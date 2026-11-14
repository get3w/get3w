import { createServer } from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { once } from "node:events";
import { toolSchemaDiagnostics, toolCallDiagnostics } from "./inference-tool-diagnostics.mjs";

/** Engine-only loopback transport. The token cannot authorize any cloud API. */
export async function createGet3wInferenceProxy({ auth, userId }) {
  const token = randomBytes(32).toString("base64url");
  const controllers = new Set();
  const submitted = new Set();
  const serverPort=()=>{const address=server.address();if(!address||typeof address==='string')throw Error('Local proxy is not listening.');return address.port;};
  const server = createServer(async (request, response) => {
    const fail = (status, message) => {
      if (!response.headersSent) response.writeHead(status, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      response.end(JSON.stringify({error:{message}}));
    };
    const supplied = Buffer.from(request.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    // Browsers cannot use this endpoint, even if they can reach loopback.
    if (request.headers.origin || request.headers.host !== `127.0.0.1:${serverPort()}` ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, "Local inference authorization required");
    // Probe only the authenticated local transport. Cloud catalog latency must
    // not cause the host to tear down a healthy proxy and its active streams.
    if (request.url === "/v1/health" && request.method === "GET") {
      response.writeHead(200, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      response.end(JSON.stringify({ready:true}));
      return;
    }
    const route = request.url === "/v1/models" && request.method === "GET" ? "models"
      : request.url === "/v1/chat/completions" && request.method === "POST" ? "chat/completions" : null;
    if (!route) return fail(404, "Unsupported inference route");
    const startedAt = performance.now();
    const toolCalls = toolCallDiagnostics();
    let upstreamHeadersAt, firstChunkAt, upstreamStatus;
    const evidenceSession = request.headers["x-openwork-session-id"];
    const evidenceId = randomBytes(16).toString("hex");
    const evidence = (type, payload) => typeof evidenceSession === "string"
      ? globalThis.__get3wTaskLogs?.captureEvidence?.(evidenceSession,{type,payload:{exchange_id:evidenceId,...payload}}).catch(()=>{})
      : undefined;
    const evidenceParts = []; let evidenceComplete = false;
    const evidenceDecoder = new TextDecoder();
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    response.once("close", abort);
    let release, eventStream = false, fingerprint, succeeded = false, terminal = false, upstreamOk = false, streamError = false;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        // Multi-image verification retains base64 image parts in the conversation.
        // Allow several original images while retaining a bounded local request size.
        if (size > 32 * 1024 * 1024) return fail(413, "Request exceeds the local inference size limit");
        chunks.push(chunk);
      }
      if (controller.signal.aborted) return;
      const body = Buffer.concat(chunks);
      await evidence("model.http.request",{body:body.toString("utf8"),route});
      const executeSchemas = toolSchemaDiagnostics(body);
      if (executeSchemas.length) console.info("[get3w-tool-schema]", JSON.stringify(executeSchemas));
      if (route === "chat/completions") {
        // Independent title and chat requests must not wait for one another.
        // Reserve each body synchronously before awaiting auth/network I/O.
        // Scope replay protection by the caller request id. Independent title
        // and chat completions may share a body, while a transport retry with
        // the same request id remains deduplicated.
        const requestId = request.headers["x-get3w-request-id"] || request.headers["x-openwork-request-id"];
        console.info("[get3w-inference-request]", JSON.stringify({ hasRequestId: Boolean(requestId), requestIdLength: requestId?.length ?? 0, bodyBytes: body.length }));
        // A caller-provided request ID is the only reliable replay key. Some
        // OpenCode versions omit both headers; hashing the body in that case
        // incorrectly rejects an automatic retry (or two legitimate identical
        // prompts) before the request reaches Get3W. Requests without an ID are
        // therefore intentionally at-most-once only at the upstream boundary.
        if (requestId) {
          fingerprint = createHash("sha256").update(requestId + "\0").update(body).digest("hex");
          if (submitted.has(fingerprint)) { fingerprint = undefined; return fail(409, "Get3W request was already submitted. Check model usage; send a new message to retry explicitly."); }
          if (submitted.size >= 256) { fingerprint = undefined; return fail(409, "Reconnect Get3W models after checking model usage."); }
          submitted.add(fingerprint);
        }
      }
      const result = await auth.inference({ userId, route, body, signal: controller.signal });
      upstreamHeadersAt = performance.now();
      release = result.release;
      const upstream = result.response;
      upstreamOk = upstream.ok;
      upstreamStatus = upstream.status;
      await evidence("model.http.response",{status:upstream.status,request_id:upstream.headers.get("x-request-id"),provider_task_id:upstream.headers.get("x-task-id")});
      const headers = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
      for (const name of ["content-type", "x-task-id", "x-request-id", "x-openwork-request-id", "x-openwork-model", "x-get3w-request-id", "x-get3w-model", "x-get3w-auto-reason", "x-get3w-auto-thinking", "server-timing", "retry-after"]) {
        const value = upstream.headers.get(name); if (value) headers[name] = value;
      }
      // The engine retries 429/5xx with new request IDs. Require an explicit
      // retry for submitted completions, whose billing outcome may be unknown.
      if (route === "chat/completions" && (upstream.status === 429 || upstream.status >= 500)) {
        return fail(400, `Get3W request failed (HTTP ${upstream.status}). This message was not automatically retried. Check model usage before sending again.`);
      }
      eventStream = String(upstream.headers.get("content-type") || "").includes("text/event-stream");
      response.writeHead(upstream.status, headers);
      response.flushHeaders();
      let pending = "";
      if (upstream.body) {
        for await (const chunk of Readable.fromWeb(upstream.body, {signal:controller.signal})) {
          firstChunkAt ??= performance.now();
          evidenceParts.push(evidenceDecoder.decode(chunk,{stream:true}));
          if (eventStream) {
            pending = (pending + chunk.toString()).slice(-65536);
            let end;
            while ((end = pending.indexOf("\n")) >= 0) {
              const line = pending.slice(0,end); pending = pending.slice(end+1);
              if (line.startsWith("data:")) {
                const data = line.slice(5).trim();
                if (data === "[DONE]") terminal = true;
                else try {
                  const event = JSON.parse(data);
                  toolCalls.observe(event);
                  if (event?.error) streamError = true;
                  if (event?.choices?.some(choice => choice.finish_reason != null)) terminal = true;
                } catch {}
              }
            }
          }
          if (!response.write(chunk)) await once(response, "drain", {signal:controller.signal});
        }
      }
      evidenceComplete = true;
      await evidence("model.output",{text:evidenceParts.join("")+evidenceDecoder.decode(),complete:true});
      succeeded = upstream.ok && !streamError;
      response.end();
    } catch (error) {
      console.error("[get3w-inference-error]", JSON.stringify({
        name: error?.name ?? "Error", message: error?.message ?? String(error),
        upstreamStatus: upstreamStatus ?? null, upstreamOk,
      }));
      if (!response.destroyed) {
        if (response.headersSent) {
          if (eventStream) {
            response.end('data: {"error":{"message":"Get3W stream interrupted. Check model usage before trying again.","type":"upstream_error"}}\n\ndata: [DONE]\n\n');
          } else response.destroy();
        }
        else fail(400, "Get3W inference unavailable. Check model usage before trying again.");
      }
    } finally {
      if(!evidenceComplete&&evidenceParts.length)await evidence("model.output",{text:evidenceParts.join("")+evidenceDecoder.decode(),complete:false});
      if (fingerprint && (succeeded || (upstreamOk && terminal && !streamError))) { submitted.delete(fingerprint); }
      // Keep failed/unknown bodies reserved against engine replay. A separate
      // explicit message or another model must remain usable without reconnecting.
      if (route === "chat/completions") {
        const calls = toolCalls.summary();
        if (calls.length) console.info("[get3w-tool-calls]", JSON.stringify(calls));
        // Timings only: never log message bodies, credentials, or account identifiers.
        const elapsed = value => value == null ? null : Math.round(value - startedAt);
        console.info("[get3w-inference]", JSON.stringify({
          headersMs: elapsed(upstreamHeadersAt), firstChunkMs: elapsed(firstChunkAt),
          totalMs: elapsed(performance.now()), upstreamStatus: upstreamStatus ?? null, succeeded,
        }));
      }
      release?.(); controllers.delete(controller); response.removeListener("close", abort);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0,"127.0.0.1",()=>resolve(undefined)); });
  return {
    baseURL: `http://127.0.0.1:${serverPort()}/v1`, apiKey: token,
    close: async () => {
      for (const controller of controllers) controller.abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

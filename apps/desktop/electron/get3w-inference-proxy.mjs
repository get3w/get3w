import { createServer } from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { once } from "node:events";

/** Engine-only loopback transport. The token cannot authorize any cloud API. */
export async function createGet3wInferenceProxy({ auth, userId, organizationId }) {
  const token = randomBytes(32).toString("base64url");
  const controllers = new Set();
  const submitted = new Set();
  let outcomeUnknown = false, completionQueue = Promise.resolve();
  const server = createServer(async (request, response) => {
    const fail = (status, message) => {
      if (!response.headersSent) response.writeHead(status, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      response.end(JSON.stringify({error:{message}}));
    };
    const supplied = Buffer.from(request.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    // Browsers cannot use this endpoint, even if they can reach loopback.
    if (request.headers.origin || request.headers.host !== `127.0.0.1:${server.address().port}` ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, "Local inference authorization required");
    const route = request.url === "/v1/models" && request.method === "GET" ? "models"
      : request.url === "/v1/chat/completions" && request.method === "POST" ? "chat/completions" : null;
    if (!route) return fail(404, "Unsupported inference route");
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    response.once("close", abort);
    let release, unlock, eventStream = false, fingerprint, succeeded = false, terminal = false, upstreamOk = false, streamError = false;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return fail(413, "Request exceeds the local inference size limit");
        chunks.push(chunk);
      }
      if (controller.signal.aborted) return;
      const body = Buffer.concat(chunks);
      if (route === "chat/completions") {
        const previous = completionQueue;
        completionQueue = new Promise(resolve => { unlock = resolve; });
        await previous;
        if (controller.signal.aborted) return;
        if (outcomeUnknown) return fail(400, "Get3W request failed. Check model usage, then reconnect models before trying again.");
        fingerprint = createHash("sha256").update(body).digest("hex");
        if (submitted.has(fingerprint)) { fingerprint = undefined; return fail(409, "Get3W request was already submitted. Check model usage; send a new message to retry explicitly."); }
        if (submitted.size >= 256) { fingerprint = undefined; return fail(409, "Reconnect Get3W models after checking model usage."); }
        submitted.add(fingerprint);
      }
      const result = await auth.inference({ userId, organizationId, route, body, signal: controller.signal });
      release = result.release;
      const upstream = result.response;
      upstreamOk = upstream.ok;
      const headers = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
      for (const name of ["content-type", "x-task-id", "x-request-id", "x-openwork-request-id", "x-openwork-model", "retry-after"]) {
        const value = upstream.headers.get(name); if (value) headers[name] = value;
      }
      // The engine retries 429/5xx with new request IDs. Require an explicit
      // retry for submitted completions, whose billing outcome may be unknown.
      if (route === "chat/completions" && (upstream.status === 429 || upstream.status >= 500)) {
        return fail(400, "Get3W request failed. Check model usage before trying again; it was not automatically replayed.");
      }
      eventStream = String(upstream.headers.get("content-type") || "").includes("text/event-stream");
      response.writeHead(upstream.status, headers);
      response.flushHeaders();
      let pending = "";
      if (upstream.body) {
        for await (const chunk of Readable.fromWeb(upstream.body, {signal:controller.signal})) {
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
                  if (event?.error) streamError = true;
                  if (event?.choices?.some(choice => choice.finish_reason != null)) terminal = true;
                } catch {}
              }
            }
          }
          if (!response.write(chunk)) await once(response, "drain", {signal:controller.signal});
        }
      }
      succeeded = upstream.ok && !streamError;
      response.end();
    } catch {
      if (!response.destroyed) {
        if (response.headersSent) {
          if (eventStream) {
            response.end('data: {"error":{"message":"Get3W stream interrupted. Check model usage before trying again.","type":"upstream_error"}}\n\ndata: [DONE]\n\n');
          } else response.destroy();
        }
        else fail(400, "Get3W inference unavailable. Check model usage before trying again.");
      }
    } finally {
      if (fingerprint && (succeeded || (upstreamOk && terminal && !streamError))) { submitted.delete(fingerprint); outcomeUnknown = false; }
      else if (fingerprint) outcomeUnknown = true;
      unlock?.();
      release?.(); controllers.delete(controller); response.removeListener("close", abort);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0,"127.0.0.1",resolve); });
  return {
    baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: token,
    close: async () => {
      for (const controller of controllers) controller.abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

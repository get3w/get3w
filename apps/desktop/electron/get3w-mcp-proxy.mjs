import { validateGenerationCall } from "./generation-policy.mjs";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createModelSubmitGuard } from "./get3w-model-submit-guard.mjs";

/** Engine-only loopback transport. The token cannot authorize any cloud API. */
export async function createGet3wMcpProxy({ auth, userId, sessionId = randomBytes(24).toString("base64url"), hostToken, approveSubmit, journal, enforceModelGuard = false }) {
  const guards = new Map();
  const guardFor = (id) => { if (!enforceModelGuard) return null; let value = guards.get(id); if (!value) { value=createModelSubmitGuard({sessionId:id}); guards.set(id,value); } return value; };
  const token = randomBytes(32).toString("base64url");
  const controllers = new Set();
  const approvalInFlight = new Map();
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
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, "Local Gateway authorization required");
    if (request.url === "/app-index" && request.method === "GET") {
      try {
        const result = await auth.artifacts({userId,method:"GET",path:"/v1/mcp-apps"});
        response.writeHead(result.status,{"Content-Type":"application/json","Cache-Control":"no-store"});
        response.end(JSON.stringify(result.json));
      } catch { fail(502,"Artifact catalog unavailable. Reconnect your account."); }
      return;
    }
    const appId = /^\/mcp\/apps\/(cob_[0-7][0-9a-hjkmnp-tv-z]{25})$/.exec(request.url ?? "")?.[1];
    if ((!appId && request.url !== "/mcp") || !["GET","POST","DELETE"].includes(request.method)) return fail(404, "Unsupported MCP route");
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    response.once("close", abort);
    let release;
    let requestId = null;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return fail(413, "Request exceeds the local Gateway size limit");
        chunks.push(chunk);
      }
      if (controller.signal.aborted) return;
      let body = Buffer.concat(chunks);
      let hostContext = null;
      if (request.method === "POST") {
        let parsed;
        try { parsed=JSON.parse(body.toString("utf8")); } catch { return fail(400,"Invalid MCP request"); }
        requestId = parsed?.id ?? null;
        if (!appId && hostToken && parsed?.method === "tools/call") {
          const suppliedHost=Buffer.from(typeof request.headers["x-get3w-host-token"] === "string" ? request.headers["x-get3w-host-token"] : "");
          const expectedHost=Buffer.from(hostToken);
          if (suppliedHost.length!==expectedHost.length || !timingSafeEqual(suppliedHost,expectedHost)
            || !/^[A-Za-z0-9_-]{16,100}$/.test(parsed.hostContext?.sessionId ?? "")
            || typeof parsed.hostContext?.messageId!=="string" || !parsed.hostContext.messageId) return fail(403,"Trusted conversation context required");
          hostContext=parsed.hostContext;
          delete parsed.hostContext;
          // The host owns the session even when the capability has an alias.
          if (parsed.params?.arguments?.arguments && "session_id" in parsed.params.arguments.arguments)
            parsed.params.arguments.arguments.session_id=hostContext.sessionId;
          body=Buffer.from(JSON.stringify(parsed));
        }
      }
      const guard = appId ? null : guardFor(hostContext?.sessionId ?? sessionId);
      let context;
      let paidApproved=false;
      if(guard && request.method === "POST") {
        try { context=guard.prepare(JSON.parse(body.toString("utf8"))); if (context) { context.sessionId=hostContext?.sessionId ?? sessionId; context.messageId=hostContext?.messageId; }
          if(context&&hostContext&&["get3w.models.schema","get3w.quote","get3w.submit"].includes(context.type)){const catalog=await auth.taskCatalog({userId,refresh:true});validateGenerationCall(context,hostContext.generationPolicy,catalog);} }
        catch(error) {
          // Return tool validation failures as MCP tool results so the chat
          // bridge preserves the corrective message instead of calling this a
          // broken connection. Never forward a rejected payload upstream.
          response.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
          response.end(JSON.stringify({jsonrpc:"2.0",id:JSON.parse(body.toString("utf8")).id ?? null,
            result:{isError:true,structuredContent:{status:"rejected",code:"invalid_model_call"},content:[{type:"text",text:error.message}]}}));
          return;
        }
      }
      const stopped = async () => {
        if(!context || !await journal?.isStopped?.(context))return false;
        response.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
        response.end(JSON.stringify({jsonrpc:"2.0",id:JSON.parse(body.toString("utf8")).id ?? null,
          result:{isError:true,structuredContent:{status:"detached",code:"stopped_waiting"},content:[{type:"text",text:"Model task stopped waiting (detached). Do not retry, resubmit, or continue dependent steps. The user can retrieve the original result from the task card."}]}}));
        return true;
      };
      if(await stopped())return;
      if (request.method === "POST" && typeof approveSubmit === "function") {
        let message;
        try { message = JSON.parse(body.toString("utf8")); } catch { message = null; }
        const call = message?.method === "tools/call" && message?.params?.name === "execute_capability"
          ? message.params.arguments : null;
        if (context?.type === "get3w.submit" || (!guard && call?.name === "get3w.submit")) {
          // Same payload retries share one prompt and one spend commitment.
          const approvalKey = context?.hash;
          let pending = approvalKey && approvalInFlight.get(approvalKey);
          if (!pending) {
            pending = context?.alreadyApproved ? Promise.resolve(true) : Promise.resolve().then(() => approveSubmit({ userId, sessionId:hostContext?.sessionId ?? sessionId, messageId:hostContext?.messageId, arguments: call.arguments, quote:context?.quote, slug: call.arguments?.slug, quoteId: call.arguments?.quote_id, id: message.id, signal: controller.signal }));
            if (approvalKey) approvalInFlight.set(approvalKey, pending);
          }
          let decision;
          try { decision = await pending; }
          finally { if (approvalKey && approvalInFlight.get(approvalKey) === pending) approvalInFlight.delete(approvalKey); }
          if (controller.signal.aborted) return;
          if (decision !== true && decision?.allowed !== true) {
            if (!response.headersSent) response.writeHead(200, {"Content-Type":"application/json", "Cache-Control":"no-store"});
            response.end(JSON.stringify({jsonrpc:"2.0",id:message.id ?? null,error:{code:-32003,message:decision?.reason || "Model task approval was denied"}}));
            return;
          }
          if(await stopped())return;
          paidApproved=true;
          if(guard) guard.approve(context);
          if(journal && context) await journal.beforeSubmit(context);
        }
      }
      const effectiveSession = hostContext?.sessionId ?? sessionId;
      let result;
      if(context?.type==="get3w.submit") {
        if(!paidApproved || !guard || !journal) throw Error("Trusted model approval required");
        let value;
        try { value=await auth.submitPersonal({userId,arguments:context.call.arguments,signal:controller.signal}); }
        catch(error) {
          if(error?.definitive) await journal.observe(context,{result:{structuredContent:{status:"succeeded",result:{status:"failed",error:{code:error.code,message:error.message}}}}});
          throw error;
        }
        result={response:Response.json({jsonrpc:"2.0",id:JSON.parse(body.toString("utf8")).id,result:{structuredContent:{status:"succeeded",result:value},content:[{type:"text",text:JSON.stringify(value)}]}})};
      } else result = await auth.mcp({ userId, appId, sessionId:effectiveSession, method:request.method, headers:request.headers, body, signal: controller.signal });
      release = result.release;
      let upstream = result.response;
      if(guard && context && upstream.ok) {
        // Native gateway uses JSON responses. Reject unsupported framing rather
        // than forwarding an unverified quote to a paid submit path.
        if(!upstream.headers.get("content-type")?.includes("application/json")) return fail(502,"Unverified gateway response format");
        const payload=await upstream.clone().json();
        if(context.type==="search") {
          for(const row of payload.result?.structuredContent?.data??[]) if(row.handler==="get3w.submit" && typeof auth.submitPersonal==="function") row.enabled=true;
          result.response=Response.json(payload);
        }
        upstream=result.response;
        guard.observe(context,payload);
        await journal?.observe(context,payload);
      }
      // A result already in flight must not revive an explicitly detached chain.
      if(await stopped())return;
      const headers = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
      for (const name of ["content-type", "x-request-id", "retry-after", "mcp-session-id", "mcp-protocol-version"]) {
        const value = upstream.headers.get(name); if (value) headers[name] = value;
      }
      response.writeHead(upstream.status, headers);
      // MCP GET streams may send no body until a later server event. The SDK
      // waits for these headers before sending its initialized notification.
      response.flushHeaders();
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response, {signal:controller.signal});
      else response.end();
    } catch (error) {
      if (!response.destroyed) {
        if (!response.headersSent && error?.definitive === true) {
          response.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
          response.end(JSON.stringify({jsonrpc:"2.0",id:requestId,error:{code:-32003,message:error.message}}));
          return;
        }
        if (response.headersSent) response.destroy();
        else fail(502, "Get3W Gateway unavailable. Check your account connection.");
      }
    } finally {
      release?.(); controllers.delete(controller); response.removeListener("close", abort);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0,"127.0.0.1",()=>resolve(undefined)); });
  return {
    url: `http://127.0.0.1:${serverPort()}/mcp`, token, sessionId,
    close: async () => {
      for (const controller of controllers) controller.abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

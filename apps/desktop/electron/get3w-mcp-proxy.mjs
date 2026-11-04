import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Engine-only loopback transport. The token cannot authorize any cloud API. */
export async function createGet3wMcpProxy({ auth, userId, organizationId }) {
  const token = randomBytes(32).toString("base64url");
  const controllers = new Set();
  const server = createServer(async (request, response) => {
    const fail = (status, message) => {
      if (!response.headersSent) response.writeHead(status, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      response.end(JSON.stringify({error:{message}}));
    };
    const supplied = Buffer.from(request.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    // Browsers cannot use this endpoint, even if they can reach loopback.
    if (request.headers.origin || request.headers.host !== `127.0.0.1:${server.address().port}` ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, "Local Gateway authorization required");
    if (request.url !== "/mcp" || !["GET","POST","DELETE"].includes(request.method)) return fail(404, "Unsupported MCP route");
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    response.once("close", abort);
    let release;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return fail(413, "Request exceeds the local Gateway size limit");
        chunks.push(chunk);
      }
      if (controller.signal.aborted) return;
      const result = await auth.mcp({ userId, organizationId, method:request.method, headers:request.headers, body: Buffer.concat(chunks), signal: controller.signal });
      release = result.release;
      const upstream = result.response;
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
    } catch {
      if (!response.destroyed) {
        if (response.headersSent) response.destroy();
        else fail(502, "Get3W Gateway unavailable. Check your account connection.");
      }
    } finally {
      release?.(); controllers.delete(controller); response.removeListener("close", abort);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0,"127.0.0.1",resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`, token,
    close: async () => {
      for (const controller of controllers) controller.abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

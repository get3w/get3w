// Run alone: isolate runtime/profile before importing the server.
import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("development reload fences writes only while idle; busy, pending and unknown keep serving", async () => {
  const root = await mkdtemp(join(tmpdir(), "get3w-dev-reload-"));
  const environment = { HOME: root, XDG_CONFIG_HOME: join(root,"config"), XDG_DATA_HOME: join(root,"data"), XDG_CACHE_HOME: join(root,"cache"), XDG_STATE_HOME: join(root,"state"), GET3W_RUNTIME_DB: join(root,"runtime.sqlite"), GET3W_DEV_MODE: "1", GET3W_ENGINE_AUTO_UPGRADE: "0", GET3W_ENGINE_V2_PREVIEW: "0", GET3W_ENGINE_V2_CHAT: "0" };
  const previous = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  let status = "idle", pending = false, unavailable = false;
  const engine = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    if (unavailable) return new Response("unavailable", { status: 503 });
    const path = new URL(request.url).pathname;
    return Response.json(path === "/session/status" ? { ses_test: { type: status } } : path === "/permission" && pending ? [{ id: "approval" }] : []);
  }});
  let stop: (() => Promise<void>) | undefined;
  try {
    const { resolveServerConfig } = await import("../src/config");
    const { startServer } = await import("../src/server");
    const config = await resolveServerConfig({ configPath: join(root,"server.json"), workspaces: [root], port: 0, token: "test", hostToken: "host", opencodeBaseUrl: `http://127.0.0.1:${engine.port}`, logRequests: false });
    const server = await startServer(config); stop = () => server.stop();
    const write = () => fetch(`http://127.0.0.1:${server.port}/missing`, { method: "POST", headers: { authorization: "Bearer test" } });
    status = "busy"; expect(await server.prepareDevReload()).toBe(false); expect((await write()).status).not.toBe(503);
    status = "idle"; pending = true; expect(await server.prepareDevReload()).toBe(false);
    pending = false; unavailable = true; expect(await server.prepareDevReload()).toBe(false);
    unavailable = false; expect(await server.prepareDevReload()).toBe(true); expect((await write()).status).toBe(503);
    server.cancelDevReload(); expect((await write()).status).not.toBe(503);
    process.env.GET3W_DEV_MODE = "0"; expect(await server.prepareDevReload()).toBe(false);
  } finally {
    await stop?.(); engine.stop(true);
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

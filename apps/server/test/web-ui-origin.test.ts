import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { resolveServerConfig } from "../src/config.js";
import type { ServerConfig } from "../src/types.js";

const TOKEN = "web-origin-test-client";
const dir = mkdtempSync(join(tmpdir(), "openwork-web-origin-"));
const overrides: Record<string, string | undefined> = {
  HOME: dir, XDG_CONFIG_HOME: join(dir, "config"), XDG_DATA_HOME: join(dir, "data"),
  XDG_CACHE_HOME: join(dir, "cache"), XDG_STATE_HOME: join(dir, "state"),
  GET3W_DATA_DIR: join(dir, "openwork"), GET3W_RUNTIME_DB: join(dir, "runtime.sqlite"),
  OPENCODE_DB: join(dir, "v1.db"), GET3W_ENGINE_AUTO_UPGRADE: "0",
  GET3W_WEB_ROOT: join(dir, "web"), GET3W_WEB_BOOTSTRAP_TOKEN: undefined,
  GET3W_CORS_ORIGINS: undefined, GET3W_ALLOWED_HOSTS: undefined,
};
const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
let config: ServerConfig;
let server: { port: number; stop: () => void | Promise<void> };

before(async () => {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mkdirSync(join(dir, "web"));
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head><title>Get3W</title></head><body></body></html>");
  config = await resolveServerConfig({ web: true, configPath: join(dir, "server.json"), workspaces: [], port: 0,
    token: TOKEN, hostToken: "web-origin-test-host", logRequests: false });
  const { startServer } = await import("../src/server.js");
  server = await startServer(config);
});

after(async () => {
  await server?.stop();
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(dir, { recursive: true, force: true });
});

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, path, headers: { host: `127.0.0.1:${server.port}`, ...headers } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const otherSiteFetch = { origin: "https://other.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };

test("web mode answers only loopback, IP and configured host names", async () => {
  assert.deepEqual(config.allowedHosts, []);
  const configured = await resolveServerConfig({ web: true, configPath: join(dir, "server.json"), workspaces: [],
    allowedHosts: ["openwork.example"] });
  assert.deepEqual(configured.allowedHosts, ["openwork.example"]);
  const standalone = await resolveServerConfig({ configPath: join(dir, "server.json"), workspaces: [] });
  assert.equal(standalone.allowedHosts, undefined, "desktop and other hosts keep answering any name");
});

test("another site's fetch of the web UI gets no CORS access and no token", async () => {
  const page = await get("/", otherSiteFetch);
  assert.equal(page.status, 200);
  assert.equal(page.headers["access-control-allow-origin"], undefined);
  assert.doesNotMatch(page.body, /__OPENWORK_BOOTSTRAP__/);
  assert.ok(!page.body.includes(TOKEN));
  const api = await get("/health", otherSiteFetch);
  assert.equal(api.status, 200);
  assert.equal(api.headers["access-control-allow-origin"], "*", "the API keeps its configured CORS");
});

test("requests addressed to an unknown host name are rejected before the page or API", async (t) => {
  for (const path of ["/", "/health"]) {
    const response = await get(path, { host: `evil.example:${server.port}` });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).code, "host_not_allowed");
    assert.ok(!response.body.includes(TOKEN));
  }
  for (const host of [`localhost:${server.port}`, `127.0.0.1:${server.port}`, `[::1]:${server.port}`, `app.localhost:${server.port}`]) {
    assert.equal((await get("/health", { host })).status, 200, host);
  }
  config.allowedHosts = ["openwork.example"];
  t.after(() => { config.allowedHosts = []; });
  assert.equal((await get("/health", { host: "Get3W.example" })).status, 200, "a configured proxy name is allowed");
  assert.equal((await get("/health", { host: "other.openwork.example" })).status, 403);
});

test("the UI's own page loads still sign in automatically", async () => {
  for (const headers of [
    {},
    { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
  ]) {
    const response = await get("/", headers);
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`window\\.__OPENWORK_BOOTSTRAP__ = \\{"token":"${TOKEN}"\\}`), JSON.stringify(headers));
  }
  const framed = await get("/", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" });
  assert.equal(framed.status, 200);
  assert.ok(!framed.body.includes(TOKEN), "another site framing the UI is not signed in");
});

test("personal server rejects retired organization session and synchronization routes", async () => {
  const endpoints = [
    ["PUT", "/den-session/identity"], ["PUT", "/den-session"], ["DELETE", "/den-session"],
    ["POST", "/cloud-provider-sync/run"], ["POST", "/cloud-provider-sync/providers/ipr_fixture/oauth/start"],
    ["GET", "/cloud-provider-sync/status"],
    ["POST", "/experimental/drive-files/call"],
    ["GET", "/experimental/connect/state"], ["PUT", "/experimental/connect/state"],
    ["GET", "/experimental/connect/skills"], ["POST", "/experimental/connect/skills/read"],
    ["GET", "/experimental/connect/automations"],
    ["GET", "/workspace/fixture/mcp/openwork-cloud/health"],
    ["POST", "/workspace/fixture/mcp/openwork-cloud/engine-refresh"],
    ["POST", "/workspace/fixture/mcp/openwork-cloud/reconcile"],
    ["GET", "/workspace/fixture/desktop-cloud-sync"], ["POST", "/workspace/fixture/desktop-cloud-sync"],
    ["GET", "/workspace/fixture/cloud-plugins"], ["DELETE", "/workspace/fixture/cloud-plugins/plugin-fixture"],
  ];
  for (const [method, path] of endpoints) {
    const result = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: server.port, path, method,
        headers: { host: `127.0.0.1:${server.port}`, authorization: "Bearer web-origin-test-host", "content-type": "application/json", accept: "application/json" },
      }, res => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); });
      req.on("error", reject);
      req.end(JSON.stringify({ baseUrl: "https://den.example.test", token: "retired-fixture", orgId: "org-fixture" }));
    });
    assert.equal(result, 404, `${method} ${path}`);
  }
});

test("local extension status remains accessible without an organization Gateway", async () => {
  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, path: "/experimental/extensions/call", method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    }, res => { let body = ""; res.on("data", chunk => { body += chunk; }); res.on("end", () => resolve({ status: res.statusCode ?? 0, body })); });
    req.on("error", reject);
    req.end(JSON.stringify({ extensionId: "openai-image-generation", action: "status" }));
  });
  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(typeof payload.result.configured, "boolean");
  assert.equal(typeof payload.result.connected, "boolean");
});

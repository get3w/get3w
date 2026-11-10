import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const embeddedUrl = process.env.GET3W_TEST_EMBEDDED_MODULE_URL
  || pathToFileURL(join(repo, "apps/server/dist/embedded.js")).href;
const engineBin = process.env.GET3W_TEST_ENGINE_BIN
  || join(repo, "apps/desktop/resources/sidecars", process.platform === "win32" ? "opencode.exe" : "opencode");

test("a fresh bundled engine lists sessions and loads Get3W tools without npm access", { timeout: 300_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openwork-cold-engine-"));
  const previousEnv = { ...process.env };
  const registryRequests = [];
  // Fault only the dependency registry. The real engine, bundled plugins, and
  // authenticated Get3W API must still answer; do not mock their readiness.
  const registry = createServer((request) => registryRequests.push(request.url));
  await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
  let handle;
  try {
    // A shell launched by Get3W can carry its actual engine DB/config.
    // Clear those before importing any module that caches environment paths.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("OPENCODE_") || key.startsWith("OPENWORK_")) delete process.env[key];
    }
    Object.assign(process.env, {
      HOME: profile, USERPROFILE: profile, OPENCODE_TEST_HOME: profile,
      XDG_CONFIG_HOME: join(profile, "config"), XDG_DATA_HOME: join(profile, "data"),
      XDG_CACHE_HOME: join(profile, "cache"), XDG_STATE_HOME: join(profile, "state"),
      OPENCODE_CONFIG_DIR: join(profile, "engine-config"),
      OPENCODE_DISABLE_MODELS_FETCH: "true",
      GET3W_ENGINE_V2_PREVIEW: "0",
      GET3W_DATA_DIR: join(profile, "openwork"),
      GET3W_ENV_STORE: join(profile, "env.json"),
      npm_config_registry: `http://127.0.0.1:${registry.address().port}`,
      npm_config_fetch_retries: "0", npm_config_fetch_timeout: "60000",
    });
    const workspace = join(profile, "workspace");
    const scratch = join(profile, "managed-opencode-workdir");
    for (const path of [scratch, join(workspace, ".opencode"), join(profile, ".opencode"), process.env.OPENCODE_CONFIG_DIR]) {
      await mkdir(path, { recursive: true });
    }
    const { startEmbeddedServer } = await import(embeddedUrl);
    handle = await startEmbeddedServer({
      manageOpencode: true, opencodeBin: engineBin, opencodeCwd: scratch, workspaces: [workspace],
      configPath: join(profile, "openwork", "server.json"),
      host: "127.0.0.1", port: 0, token: "cold-engine-owner", hostToken: "cold-engine-host",
    });
    // Exercise the real Desktop/Server host contract; branded headers must
    // authenticate, legacy clients remain compatible, and bad tokens fail.
    for (const header of ["X-Get3W-Host-Token", "X-OpenWork-Host-Token"]) {
      const issued = await fetch(`${handle.url}/tokens`, {
        method: "POST", headers: { [header]: "cold-engine-host", "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "owner", label: "isolated package acceptance" }),
      });
      assert.equal(issued.status, 201, `${header} issues an owner token`);
      assert.ok((await issued.json()).token);
      const environment = await fetch(`${handle.url}/env/keys`, { headers: { [header]: "cold-engine-host" } });
      assert.equal(environment.status, 200, `${header} authenticates host-only settings`);
    }
    const denied = await fetch(`${handle.url}/tokens`, {
      method: "POST", headers: { "X-Get3W-Host-Token": "wrong", "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "owner" }),
    });
    assert.equal(denied.status, 401);
    const workspaceId = handle.config.workspaces[0]?.id;
    assert.ok(workspaceId, "the real embedded server registered the workspace");
    const headers = { Authorization: "Bearer cold-engine-owner" };
    const sessions = await fetch(`${handle.url}/workspace/${workspaceId}/opencode/session`, {
      headers, signal: AbortSignal.timeout(30_000),
    });
    assert.equal(sessions.status, 200);
    assert.deepEqual(await sessions.json(), []);
    const tools = await fetch(`${handle.url}/workspace/${workspaceId}/opencode/experimental/tool/ids`, {
      headers, signal: AbortSignal.timeout(30_000),
    });
    assert.equal(tools.status, 200);
    const ids = await tools.json();
    for (const tool of ["openwork_docs_search", "openwork_query"]) assert.ok(ids.includes(tool), `bundled ${tool} is available`);
    assert.deepEqual(registryRequests, [], "cold startup did not need a registry download");
  } finally {
    await handle?.stop();
    registry.closeAllConnections();
    await new Promise((resolve) => registry.close(resolve));
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    await rm(profile, { recursive: true, force: true });
  }
});

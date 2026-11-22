import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDevReloadController, snapshotDevServer } from "./dev-server-reload.mjs";

const quiet = { log() {}, debounceMs: 60000, retryMs: 60000 };
test("multiple saves coalesce; failed build never reloads live server", async () => {
  let builds = 0, reloads = 0, fail = true;
  const controller = createDevReloadController({ ...quiet,
    build: async () => { builds++; if (fail) throw new Error("syntax"); },
    reload: async () => { reloads++; return true; },
  });
  try {
    controller.changed(); controller.changed(); await controller.flush();
    assert.equal(builds, 1); assert.equal(reloads, 0);
    fail = false; controller.changed(); await controller.flush();
    assert.equal(builds, 2); assert.equal(reloads, 1);
    await controller.flush(); assert.equal(reloads, 1);
  } finally { await controller.stop(); }
});
test("busy or unknown defers reload without rebuilding; shutdown cancels pending work", async () => {
  let builds = 0, reloads = 0, idle = false;
  const controller = createDevReloadController({ ...quiet,
    build: async () => { builds++; }, reload: async () => { reloads++; return idle; },
  });
  controller.changed(); await controller.flush();
  assert.equal(builds, 1); assert.equal(reloads, 1);
  idle = true; await controller.flush();
  assert.equal(builds, 1); assert.equal(reloads, 2);
  controller.changed(); await controller.stop(); await controller.flush();
  assert.equal(builds, 1);
});
test("save during build cannot apply an obsolete build", async () => {
  let release;
  let builds = 0, reloads = 0;
  const controller = createDevReloadController({ ...quiet,
    build: async () => { if (++builds === 1) await new Promise(resolve => { release = resolve; }); },
    reload: async () => { reloads++; return true; },
  });
  try {
    controller.changed(); const first = controller.flush();
    controller.changed(); release(); await first;
    assert.equal(reloads, 0);
    await controller.flush(); assert.equal(builds, 2); assert.equal(reloads, 1);
  } finally { await controller.stop(); }
});
test("snapshot reloads dependency modules and retains previous generation after failed output", async () => {
  const root = await mkdtemp(join(tmpdir(), "get3w-reload-test-"));
  const snapshots = [];
  try {
    const dist = join(root, "apps/server/dist"); await mkdir(dist, { recursive: true });
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(dist, "embedded.js"), 'export { value } from "./dependency.js";');
    await writeFile(join(dist, "dependency.js"), 'export const value = "before";');
    const first = await snapshotDevServer(root); snapshots.push(first);
    assert.equal((await import(first.entry)).value, "before");
    await writeFile(join(dist, "dependency.js"), 'export const value = "after";');
    const second = await snapshotDevServer(root); snapshots.push(second);
    assert.equal((await import(second.entry)).value, "after");
    await writeFile(join(dist, "dependency.js"), 'broken syntax');
    assert.equal((await import(first.entry)).value, "before");
    assert.equal((await import(second.entry)).value, "after");
  } finally { for (const snapshot of snapshots) await snapshot.remove(); await rm(root, { recursive: true, force: true }); }
});
test("generation propagates into shared package imports, including dynamic imports", async () => {
  const { registerDevServerModules } = await import("./dev-server-reload.mjs");
  const { pathToFileURL } = await import("node:url");
  const root = await mkdtemp(join(tmpdir(), "get3w-shared-reload-"));
  const hook = registerDevServerModules(root);
  try {
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    const dependency = join(root, "shared.js"), entry = join(root, "entry.js");
    await writeFile(entry, 'export async function value() { return (await import("./shared.js")).value; }');
    await writeFile(dependency, 'export const value = "old";');
    const first = await import(pathToFileURL(entry).href + "?get3wDevGeneration=one");
    assert.equal(await first.value(), "old");
    await writeFile(dependency, 'export const value = "new";');
    const second = await import(pathToFileURL(entry).href + "?get3wDevGeneration=two");
    assert.equal(await second.value(), "new");
  } finally { hook.deregister(); await rm(root, { recursive: true, force: true }); }
});

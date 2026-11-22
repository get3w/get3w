import { watch, existsSync, realpathSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { sep } from "node:path";
import { spawn } from "node:child_process";
import { join } from "node:path";

// One build/reload at a time; edits arriving during either schedule a new build.
export function createDevReloadController({ build, reload, log = console.log, debounceMs = 700, retryMs = 3000 }) {
  let revision = 0;
  let built = 0;
  let applied = 0;
  let timer;
  let running;
  let stopped = false;
  let deferred = false;
  function schedule(delay) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, delay);
    timer.unref?.();
  }
  async function work() {
    try {
      if (built < revision) {
        const target = revision;
        log("[server-dev] Building backend…");
        await build();
        if (stopped) return;
        built = target;
        if (revision !== target) { schedule(debounceMs); return; }
      }
      if (built > applied) {
        if (await reload()) {
          applied = built;
          deferred = false;
          log("[server-dev] Backend reloaded.");
        } else {
          if (!deferred) log("[server-dev] Reload deferred: runtime is busy or activity is unavailable.");
          deferred = true;
          schedule(retryMs);
        }
      }
    } catch (error) {
      log(`[server-dev] Update failed; fix the error and save again: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function flush() {
    if (stopped) return;
    clearTimeout(timer);
    if (running) return running;
    const startingRevision = revision;
    running = work();
    try { await running; } finally {
      running = undefined;
      if (!stopped && revision !== startingRevision) schedule(debounceMs);
    }
  }
  return {
    changed() { revision++; schedule(debounceMs); },
    flush,
    async stop() { stopped = true; clearTimeout(timer); await running; },
  };
}

export async function snapshotDevServer(repoRoot) {
  // Same directory depth as dist: relative constants.json and package resolution stay valid.
  const root = await mkdtemp(join(repoRoot, "apps/server/.dev-runtime-"));
  try { await cp(join(repoRoot, "apps/server/dist"), root, { recursive: true }); }
  catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
  return { entry: join(root, "embedded.js"), remove: () => rm(root, { recursive: true, force: true }) };
}

export function watchDevServer({ repoRoot, reload, log = console.log }) {
  let child;
  const controller = createDevReloadController({
    reload, log,
    build: () => new Promise((resolve, reject) => {
      child = spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "get3w-server...", "build"], {
        cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      child.once("error", reject);
      child.once("exit", code => {
        child = undefined;
        if (code === 0) resolve(); else reject(new Error(`Backend build exited with ${code}`));
      });
    }),
  });
  const roots = ["apps/server/src", "packages"];
  const watchers = roots.filter(root => existsSync(join(repoRoot, root))).map(root => watch(join(repoRoot, root), { recursive: true }, (_event, name) => {
    const parts = String(name ?? "").replaceAll("\\", "/").split("/");
    if (parts.some(part => ["node_modules", "dist", ".git"].includes(part))) return;
    if (root === "packages" && !parts.includes("src") && !["package.json", "tsconfig.json"].includes(parts.at(-1))) return;
    controller.changed();
  }));
  for (const watcher of watchers) watcher.on("error", error => log(`[server-dev] Watch failed: ${error.message}`));
  log("[server-dev] Watching backend and shared package sources.");
  return async () => {
    for (const watcher of watchers) watcher.close();
    child?.kill("SIGTERM");
    await controller.stop();
  };
}

export function registerDevServerModules(repoRoot) {
  const prefix = pathToFileURL(realpathSync(repoRoot) + sep).href;
  return registerHooks({ resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    const generation = context.parentURL ? new URL(context.parentURL).searchParams.get("get3wDevGeneration") : null;
    if (generation && result.url.startsWith(prefix) && !result.url.includes("/node_modules/")
      && /\.(m?js|json)$/.test(new URL(result.url).pathname)) {
      const url = new URL(result.url);
      url.searchParams.set("get3wDevGeneration", generation);
      return { ...result, url: url.href };
    }
    return result;
  } });
}

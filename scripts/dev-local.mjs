import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.resolve(root, "../api");
const web = path.resolve(root, "../web");
const python = path.join(api, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const apiOrigin = "http://localhost:6600";
const webOrigin = "http://localhost:7700";
const cloudOrigin = "http://127.0.0.1:6605";
if (!existsSync(python) || !existsSync(path.join(web, "package.json"))) {
  throw new Error("Local development requires sibling api/.venv and web projects. Install their dependencies first.");
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error(error.message);
    }
  }
  process.exitCode = code;
}
function run(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit", detached: process.platform !== "win32",
  });
  children.push(child);
  child.once("error", error => { console.error(error.message); stop(1); });
  child.once("exit", code => { if (!stopping) stop(code ?? 1); });
  return child;
}
process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));

async function ready(url) {
  const deadline = Date.now() + 60_000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) return;
    } catch { /* Service is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local service did not become ready: ${url}`);
}

try {
  const schema = spawnSync(python, ["-m", "scripts.check_personal_schema"], {
    cwd: api, env: process.env, stdio: "inherit",
  });
  if (schema.error || schema.status !== 0) {
    throw new Error("Personal storage preflight failed. Review the report; explicitly initialize missing personal tables with .venv/bin/python -m scripts.check_personal_schema --apply from api/. Shared budget schema requires the existing API schema. No schema changes were made by dev:local.");
  }
  // API uses the existing api/.env development database and Redis settings.
  run(python, ["-m", "celery", "-A", "celery_app", "worker", "-Q", "celery", "-P", "solo", "-c", "1", "--hostname=get3w-local@%h", "--loglevel=info"], api);
  run(python, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "6600"], api);
  run(python, ["-m", "uvicorn", "services.cloud.app:app", "--host", "127.0.0.1", "--port", "6605"], api);
  run(pnpm, ["dev", "--host", "127.0.0.1", "--port", "7700", "--strictPort"], web, {
    VITE_GET3W_API_ORIGIN: apiOrigin,
  });
  await Promise.all([ready(`${apiOrigin}/ping`), ready(`${cloudOrigin}/ready`), ready(webOrigin)]);
  if (!stopping) run(pnpm, ["dev"], root, {
    GET3W_CLOUD_ORIGIN: cloudOrigin,
    GET3W_AUTH_WEB_ORIGIN: webOrigin,
  });
} catch (error) {
  console.error(error.message);
  stop(1);
}

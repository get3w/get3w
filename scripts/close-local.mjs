import { execFileSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.resolve(root, "../api");
const web = path.resolve(root, "../web");
const inside = (value, directory) => value === directory || value.startsWith(directory + path.sep);

/** Select this checkout's development services, then their complete process trees. */
export function selectLocalProcesses(rows, { desktop = root, apiRoot = api, webRoot = web, self = process.pid } = {}) {
  const excluded = new Set([self]);
  let parent = rows.find(row => row.pid === self)?.ppid;
  while (parent && !excluded.has(parent)) {
    excluded.add(parent);
    parent = rows.find(row => row.pid === parent)?.ppid;
  }
  const selected = new Set();
  for (const row of rows) {
    if (excluded.has(row.pid)) continue;
    const cwd = row.cwd ?? "";
    const command = row.command;
    const desktopService = (inside(cwd, desktop) || command.includes(desktop + path.sep)) && (
      /(?:^|[\s/])(?:dev-local|electron-dev|electron-launch)\.mjs(?:\s|$)/.test(command)
      || /(?:^|[\s/])vite(?:\.js)?(?:\s|$)/.test(command)
      || command.includes(desktop + "/apps/desktop/.electron-runtime/dev/")
      || /(?:bun|node).*\b(?:src|dist)\/cli\.(?:ts|js)\b/.test(command)
      || /(?:^|[\s/])opencode2?(?:\s|$).*\bserve\b/.test(command));
    const apiService = cwd === apiRoot && /(?:^|\s)(?:-m\s+)?(?:uvicorn|celery)(?:\s|$)/.test(command);
    const webService = inside(cwd, webRoot) && /(?:^|[\s/])vite(?:\.js)?(?:\s|$)/.test(command);
    if (desktopService || apiService || webService) selected.add(row.pid);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (!excluded.has(row.pid) && selected.has(row.ppid) && !selected.has(row.pid)) {
      selected.add(row.pid); changed = true;
    }
  }
  return rows.filter(row => selected.has(row.pid));
}

function processes() {
  const output = execFileSync("ps", ["-axo", "pid=,ppid=,args="], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const directories = new Map();
  if (process.platform === "darwin") {
    // One inventory avoids running lsof once per process.
    let listing = "";
    try { listing = execFileSync("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); }
    catch (error) { listing = error.stdout?.toString() ?? ""; }
    let pid;
    for (const line of listing.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n") && pid) directories.set(pid, line.slice(1));
    }
  }
  return output.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) return [];
    const pid = Number(match[1]);
    let cwd;
    try {
      if (process.platform === "linux") cwd = readlinkSync(`/proc/${pid}/cwd`);
      else cwd = directories.get(pid);
    } catch { /* Exited or inaccessible process. */ }
    return [{ pid, ppid: Number(match[2]), command: match[3], cwd }];
  });
}

export async function closeLocal() {
  if (!["darwin", "linux"].includes(process.platform)) throw Error("close:local currently supports macOS and Linux.");
  const targets = selectLocalProcesses(processes());
  if (!targets.length) { console.log("No local development services are running for this checkout."); return; }
  // Stop supervisors first so they cannot restart their children.
  const remaining = new Map(targets.map(row => [row.pid, row]));
  for (const row of targets) {
    try { process.kill(row.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  const deadline = Date.now() + 5000;
  while (remaining.size && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const live = new Map(processes().map(row => [row.pid, row]));
    for (const [pid, row] of remaining) if (live.get(pid)?.command !== row.command) remaining.delete(pid);
  }
  for (const row of remaining.values()) {
    try { process.kill(row.pid, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  console.log(`Stopped ${targets.length} local development processes (Desktop, API, Cloud, Celery and Web).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  closeLocal().catch(error => { console.error(error.message); process.exitCode = 1; });
}

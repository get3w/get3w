import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Merge private storage without overwriting files created by a newer profile.
// Conflicting legacy files stay in place so neither version's data is lost.
export function migrateStoragePath(source, target) {
  if (!existsSync(source) || lstatSync(source).isSymbolicLink()) return;
  if (!existsSync(target)) {
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(source, target);
    return;
  }
  if (!lstatSync(source).isDirectory() || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) return;
  for (const name of readdirSync(source)) migrateStoragePath(path.join(source, name), path.join(target, name));
}

export function migrateGet3wStorage({ userDataDir, env = process.env, homeDir = os.homedir(), platform = process.platform }) {
  const home = platform === "win32" ? env.USERPROFILE || env.HOME || homeDir : env.HOME || homeDir;
  const configRoot = platform === "win32"
    ? env.APPDATA || path.join(home, "AppData", "Roaming")
    : env.XDG_CONFIG_HOME || path.join(home, ".config");
  migrateStoragePath(path.join(configRoot, "openwork"), path.join(configRoot, "get3w"));
  // Bootstrap uses LOCALAPPDATA on Windows, independently of server config.
  if (platform === "win32") {
    const local = env.XDG_CONFIG_HOME || env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    migrateStoragePath(path.join(local, "openwork"), path.join(local, "get3w"));
  }
  for (const name of ["openwork-server", "openwork-server-dev"]) {
    migrateStoragePath(path.join(home, ".openwork", name), path.join(home, ".get3w", name.replace("openwork", "get3w")));
  }
  migrateStoragePath(path.join(userDataDir, "openwork-dev-data"), path.join(userDataDir, "get3w-dev-data"));
  const devRoot = path.join(userDataDir, "get3w-dev-data");
  for (const name of ["openwork-server", "openwork-server-dev"]) {
    migrateStoragePath(path.join(devRoot, "home", ".openwork", name), path.join(devRoot, "home", ".get3w", name.replace("openwork", "get3w")));
  }
  for (const root of [path.join(devRoot, "home", ".config"), path.join(devRoot, "xdg", "config")]) {
    migrateStoragePath(path.join(root, "openwork"), path.join(root, "get3w"));
  }
  for (const name of ["server-tokens.json", "server-state.json", "workspaces.json", "ui-control.json"]) {
    migrateStoragePath(path.join(userDataDir, `openwork-${name}`), path.join(userDataDir, `get3w-${name}`));
  }
  migrateStoragePath(path.join(userDataDir, "logs", "openwork-server.log"), path.join(userDataDir, "logs", "get3w-server.log"));
  migrateStoragePath(path.join(userDataDir, "Partitions", "openwork-browser"), path.join(userDataDir, "Partitions", "get3w-browser"));
  const localRoot = path.join(userDataDir, "local-runtime");
  migrateStoragePath(path.join(localRoot, "openwork"), path.join(localRoot, "get3w"));
}

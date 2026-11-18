import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const MAX_CONFIG_ROOT_LENGTH = 4_096;
const FORBIDDEN_CONFIG_ROOT_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function invalidWindowsWorkspaceRoot(value) {
  const error = new TypeError(`Invalid Windows workspace root: ${value}`);
  Object.defineProperty(error, "code", { value: "invalid_workspace_root" });
  return error;
}

function isWindowsDeviceNamespace(value) {
  return /^\\\\[?.]\\/.test(value);
}

/**
 * Normalizes Windows verbatim drive and UNC paths without consulting the
 * filesystem. Missing drives and disconnected shares must remain unchanged so
 * callers can report their real accessibility error instead of resolving them
 * against another drive.
 */
export function normalizeWorkspaceRootPath(value, opts) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || optionPlatform(opts) !== "win32") return trimmed;

  const windowsPath = trimmed.replace(/\//g, "\\");
  let normalized = windowsPath;
  if (windowsPath.startsWith("\\\\?\\")) {
    const verbatimPath = windowsPath.slice(4);
    if (/^UNC(?:\\|$)/i.test(verbatimPath)) {
      const uncPath = verbatimPath.slice(3).replace(/^\\/, "");
      const [server, share] = uncPath.split("\\");
      if (!server || !share) throw invalidWindowsWorkspaceRoot(trimmed);
      normalized = `\\\\${uncPath}`;
    } else {
      if (!/^[A-Za-z]:\\/.test(verbatimPath)) throw invalidWindowsWorkspaceRoot(trimmed);
      normalized = verbatimPath;
    }
  }

  if (isWindowsDeviceNamespace(normalized)) {
    throw invalidWindowsWorkspaceRoot(trimmed);
  }

  if (/^[A-Za-z]:(?!\\)/.test(normalized)) {
    throw invalidWindowsWorkspaceRoot(trimmed);
  }
  if (normalized.startsWith("\\")) {
    if (!normalized.startsWith("\\\\")) throw invalidWindowsWorkspaceRoot(trimmed);
    const [server, share] = normalized.slice(2).split("\\");
    if (!server || !share) throw invalidWindowsWorkspaceRoot(trimmed);
  }
  return normalized;
}

function optionEnv(opts) {
  return opts?.env ?? process.env;
}

function optionPlatform(opts) {
  return opts?.platform ?? process.platform;
}

// Windows environment names are case-insensitive (`Path` and `PATH` are one
// variable), but plain objects copied from process.env are not. On Windows
// these helpers match names case-insensitively and let the last write win, as
// assigning to the real environment does. Other platforms keep exact names.
function sameEnvName(left, right, platform) {
  return platform === "win32" ? left.toUpperCase() === right.toUpperCase() : left === right;
}

/** Returns the spelling `env` uses for `name`, or undefined when unset. */
export function envKey(env, name, opts) {
  if (!env) return undefined;
  const platform = optionPlatform(opts);
  if (platform !== "win32") return Object.prototype.hasOwnProperty.call(env, name) ? name : undefined;
  let found;
  for (const key of Object.keys(env)) {
    if (sameEnvName(key, name, platform)) found = key;
  }
  return found;
}

/** Removes `name` from `env`, including every other spelling of it on Windows. */
export function deleteEnv(env, name, opts) {
  const platform = optionPlatform(opts);
  for (const key of Object.keys(env)) {
    if (sameEnvName(key, name, platform)) delete env[key];
  }
  return env;
}

/** Sets `name` in `env`, keeping the spelling it already has on Windows. */
export function setEnv(env, name, value, opts) {
  const key = envKey(env, name, opts) ?? name;
  deleteEnv(env, name, opts);
  env[key] = value;
  return env;
}

/**
 * Merges environment layers so later layers win. On Windows a later `PATH`
 * replaces an earlier `Path` instead of producing two entries, which a child
 * process would otherwise resolve by spelling rather than by layer order.
 */
export function mergeEnv(layers, opts) {
  const merged = {};
  if (optionPlatform(opts) !== "win32") return Object.assign(merged, ...layers);
  const keys = new Map();
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer ?? {})) {
      const folded = name.toUpperCase();
      const key = keys.get(folded) ?? name;
      keys.set(folded, key);
      merged[key] = value;
    }
  }
  return merged;
}

function envLookup(env, key, opts) {
  const name = envKey(env, key, opts);
  return name === undefined ? undefined : env[name];
}

function envValue(env, key, opts) {
  return String(envLookup(env, key, opts) ?? "").trim();
}

function envRawValue(env, key, opts) {
  const value = envLookup(env, key, opts);
  return typeof value === "string" ? value : "";
}

function optionHomeDir(opts) {
  const configured = opts?.homeDir?.trim();
  if (configured) return configured;
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const fromEnv = platform === "win32"
    ? envValue(env, "USERPROFILE", opts) || envValue(env, "HOME", opts)
    : envValue(env, "HOME", opts);
  return fromEnv || homedir();
}

function defaultGet3wConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const homeDir = optionHomeDir(opts);
  if (platform === "win32") {
    const appData = envValue(env, "APPDATA", opts);
    const root = appData || paths.join(homeDir, "AppData", "Roaming");
    return paths.join(root, "get3w");
  }
  const xdgConfigHome = envValue(env, "XDG_CONFIG_HOME", opts);
  const root = xdgConfigHome || paths.join(homeDir, ".config");
  return paths.join(root, "get3w");
}

export function get3wConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "GET3W_SERVER_CONFIG", opts);
  if (override) return paths.dirname(paths.resolve(override));
  return defaultGet3wConfigDir(opts);
}

export function get3wServerConfigPath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "GET3W_SERVER_CONFIG", opts);
  if (override) return paths.resolve(override);
  return paths.join(defaultGet3wConfigDir(opts), "server.json");
}

export function get3wEnvStorePath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "GET3W_ENV_STORE", opts);
  if (override) return paths.resolve(override);
  return paths.join(defaultGet3wConfigDir(opts), "env.json");
}

function safeConfigRoot(value, paths) {
  return value.length > 0
    && value.length <= MAX_CONFIG_ROOT_LENGTH
    && paths.isAbsolute(value)
    && !FORBIDDEN_CONFIG_ROOT_CHARS.test(value);
}

export function globalOpencodeConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const configuredDirectory = envRawValue(env, "OPENCODE_CONFIG_DIR", opts);
  if (safeConfigRoot(configuredDirectory, paths)) return configuredDirectory;

  const configuredRoot = envRawValue(env, "XDG_CONFIG_HOME", opts);
  const configRoot = safeConfigRoot(configuredRoot, paths)
    ? configuredRoot
    : paths.join(optionHomeDir(opts), ".config");
  // OpenCode accepts OPENCODE_CONFIG_DIR as the directory containing its
  // opencode.json(c) files. It is not an XDG parent directory.
  return paths.join(configRoot, "opencode");
}

export function resolveGlobalOpencodeConfigPath(opts) {
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const base = globalOpencodeConfigDir(opts);
  const jsonc = paths.join(base, "opencode.jsonc");
  const json = paths.join(base, "opencode.json");
  if (existsSync(jsonc)) return jsonc;
  if (existsSync(json)) return json;
  return jsonc;
}

export function workspaceOpencodeConfigCandidates(workspaceRoot) {
  return [
    path.join(workspaceRoot, "opencode.jsonc"),
    path.join(workspaceRoot, "opencode.json"),
    path.join(workspaceRoot, ".opencode", "opencode.jsonc"),
    path.join(workspaceRoot, ".opencode", "opencode.json"),
  ];
}

export function resolveWorkspaceOpencodeConfigPath(workspaceRoot) {
  const candidates = workspaceOpencodeConfigCandidates(workspaceRoot);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function desktopConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const xdgConfigHome = envValue(env, "XDG_CONFIG_HOME", opts);
  if (xdgConfigHome) return xdgConfigHome;
  if (platform === "win32") {
    const localAppData = envValue(env, "LOCALAPPDATA", opts);
    if (localAppData) return localAppData;
    return paths.join(optionHomeDir(opts), "AppData", "Local");
  }
  return paths.join(optionHomeDir(opts), ".config");
}

export function desktopBootstrapPath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "GET3W_DESKTOP_BOOTSTRAP_PATH", opts);
  if (override) return override;
  if (envValue(env, "GET3W_DEV_MODE", opts) === "1" && opts?.userDataDir) {
    return paths.join(opts.userDataDir, "get3w-dev-data", "home", ".config", "get3w", "desktop-bootstrap.json");
  }
  return paths.join(desktopConfigDir(opts), "get3w", "desktop-bootstrap.json");
}

export function legacyDesktopBootstrapPath(opts) {
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  // Existing installers may have written this file using USERPROFILE/HOME while
  // Electron used os.homedir(). optionHomeDir accepts an explicit homeDir but
  // otherwise checks the same env variables before os.homedir(), so both legacy
  // locations continue to resolve for normal installs.
  return paths.join(optionHomeDir(opts), ".config", "get3w", "desktop-bootstrap.json");
}

export function expandHomePath(value, opts) {
  if (value === "~") return optionHomeDir(opts);
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return pathApi(optionPlatform(opts)).join(optionHomeDir(opts), value.slice(2));
  }
  return value;
}

export function get3wServerDataDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "GET3W_DATA_DIR", opts);
  if (override) return expandHomePath(override, opts);
  return paths.join(optionHomeDir(opts), ".get3w", "get3w-server");
}

export function opencodeDataDirs(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const homeDir = optionHomeDir(opts);
  const dirs = [];
  const xdgDataHome = envValue(env, "XDG_DATA_HOME", opts);
  if (xdgDataHome) dirs.push(paths.join(xdgDataHome, "opencode"));
  dirs.push(paths.join(homeDir, ".local", "share", "opencode"));
  if (platform === "darwin") dirs.push(paths.join(homeDir, "Library", "Application Support", "opencode"));
  if (platform === "win32") {
    const appData = envValue(env, "APPDATA", opts) || paths.join(homeDir, "AppData", "Roaming");
    dirs.push(paths.join(appData, "opencode"));
  }
  return Array.from(new Set(dirs));
}

function truthy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/** Candidate OpenCode databases in the same override/channel order used by Get3W. */
export function opencodeDbCandidates(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const dirs = Array.from(new Set([...(opts?.dataDirs ?? []), ...opencodeDataDirs(opts)]));
  const override = envValue(env, "OPENCODE_DB", opts);
  if (override) {
    if (paths.isAbsolute(override)) return [override];
    return dirs.map((dir) => paths.join(dir, override));
  }

  const channel = envValue(env, "OPENCODE_CHANNEL", opts) || opts?.defaultChannel || "local";
  const names = channel === "latest" || channel === "beta" || truthy(envValue(env, "OPENCODE_DISABLE_CHANNEL_DB", opts))
    ? ["opencode.db"]
    : [`opencode-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`, "opencode.db"];
  return dirs.flatMap((dir) => names.map((name) => paths.join(dir, name)));
}

export function opencodeCacheDirs(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const dirs = [];
  const xdgCacheHome = envValue(env, "XDG_CACHE_HOME", opts);
  if (xdgCacheHome) dirs.push(paths.join(xdgCacheHome, "opencode"));
  dirs.push(paths.join(optionHomeDir(opts), ".cache", "opencode"));
  return Array.from(new Set(dirs));
}

// Runtime-neutral project configuration. Machine grants never come from this file.
export function get3wProjectConfig(value = {}) {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const workspace = object.workspace && typeof object.workspace === 'object' ? object.workspace : {};
  return {
    version: 1,
    workspace: Object.fromEntries(['name'].filter(key => typeof workspace[key] === 'string').map(key => [key, workspace[key]])),
    ...(typeof object.runtime === 'string' ? { runtime: object.runtime } : {}),
  };
}

export function get3wProjectConfigPath(workspaceRoot) {
  return path.join(workspaceRoot, 'get3w.json');
}

export async function readGet3wProjectConfig(workspaceRoot) {
  const { readFile, writeFile } = await import('node:fs/promises');
  try {
    const value = JSON.parse(await readFile(get3wProjectConfigPath(workspaceRoot), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw Error('Unsupported get3w.json format');
    if (value.workspace !== undefined && (!value.workspace || typeof value.workspace !== 'object' || Array.isArray(value.workspace))) throw Error('Invalid get3w.json workspace');
    if (value.runtime !== undefined && (typeof value.runtime !== 'string' || !value.runtime.trim())) throw Error('Invalid get3w.json runtime');
    // Remove the retired field in place while preserving unrelated project keys.
    if (value.workspace && Object.hasOwn(value.workspace, 'preset')) {
      delete value.workspace.preset;
      await writeFile(get3wProjectConfigPath(workspaceRoot), JSON.stringify(value, null, 2) + '\n', 'utf8');
    }
    return get3wProjectConfig(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function ensureGet3wProjectConfig(workspaceRoot, seed = {}) {
  const current = await readGet3wProjectConfig(workspaceRoot);
  if (current) return current;
  const { readFile, writeFile } = await import('node:fs/promises');
  const next = get3wProjectConfig(seed);
  try { await writeFile(get3wProjectConfigPath(workspaceRoot), JSON.stringify(next, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; return readGet3wProjectConfig(workspaceRoot); }
  return next;
}

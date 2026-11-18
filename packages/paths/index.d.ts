export type PathEnv = Record<string, string | undefined>;

export interface PathOptions {
  env?: PathEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  userDataDir?: string;
}

export interface OpencodeDbPathOptions extends PathOptions {
  /** Additional OpenCode data roots to search before the platform defaults. */
  dataDirs?: string[];
  /** Channel used when OPENCODE_CHANNEL is unset. */
  defaultChannel?: string;
}

export declare const MAX_CONFIG_ROOT_LENGTH: 4096;

export type EnvPlatformOptions = Pick<PathOptions, "platform">;

/** Returns the spelling `env` uses for `name`; Windows names match case-insensitively. */
export declare function envKey(env: PathEnv | undefined, name: string, opts?: EnvPlatformOptions): string | undefined;
/** Removes `name` from `env`, including every other spelling of it on Windows. */
export declare function deleteEnv<T extends PathEnv>(env: T, name: string, opts?: EnvPlatformOptions): T;
/** Sets `name` in `env`, keeping the spelling it already has on Windows. */
export declare function setEnv<T extends PathEnv>(env: T, name: string, value: string | undefined, opts?: EnvPlatformOptions): T;
/** Merges environment layers so later layers win, with one entry per Windows name. */
export declare function mergeEnv(layers: ReadonlyArray<PathEnv | null | undefined>, opts?: EnvPlatformOptions): PathEnv;

export declare function normalizeWorkspaceRootPath(value: unknown, opts?: PathOptions): string;
export declare function get3wConfigDir(opts?: PathOptions): string;
export declare function get3wServerConfigPath(opts?: PathOptions): string;
export declare function get3wEnvStorePath(opts?: PathOptions): string;
export declare function globalOpencodeConfigDir(opts?: PathOptions): string;
export declare function resolveGlobalOpencodeConfigPath(opts?: PathOptions): string;
export declare function workspaceOpencodeConfigCandidates(workspaceRoot: string): string[];
export declare function resolveWorkspaceOpencodeConfigPath(workspaceRoot: string): string;
export declare function desktopBootstrapPath(opts?: PathOptions): string;
export declare function legacyDesktopBootstrapPath(opts?: PathOptions): string;
export declare function expandHomePath(value: string, opts?: PathOptions): string;
export declare function get3wServerDataDir(opts?: PathOptions): string;
export declare function opencodeDataDirs(opts?: PathOptions): string[];
export declare function opencodeDbCandidates(opts?: OpencodeDbPathOptions): string[];
export declare function opencodeCacheDirs(opts?: PathOptions): string[];

export interface Get3wProjectConfig { version: number; workspace: { name?: string }; runtime?: string; }
export declare function get3wProjectConfig(value?: unknown): Get3wProjectConfig;
export declare function get3wProjectConfigPath(workspaceRoot: string): string;
export declare function readGet3wProjectConfig(workspaceRoot: string): Promise<Get3wProjectConfig | null>;
export declare function ensureGet3wProjectConfig(workspaceRoot: string, seed?: unknown): Promise<Get3wProjectConfig>;

import { ensureGet3wProjectConfig } from "@get3w/paths";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";

import { ensureDir, exists } from "./utils.js";
import { ApiError } from "./errors.js";
import { opencodeConfigPath } from "./workspace-files.js";
import { readJsoncFile, updateJsoncTopLevel } from "./jsonc.js";
import type { ReloadReason, WorkspaceInfo } from "./types.js";

type WorkspaceGet3wConfig = {
  version: number;
  workspace?: {
    name?: string | null;
    createdAt?: number | null;
    preset?: string | null;
  } | null;
  authorizedRoots: string[];
  reload?: {
    auto?: boolean;
    resume?: boolean;
  } | null;
};

type EnsureWorkspaceFilesResult = {
  changed: boolean;
  reloadReasons: ReloadReason[];
};

function normalizePreset(preset: string | null | undefined): string {
  const trimmed = preset?.trim() ?? "";
  if (!trimmed) return "starter";
  return trimmed;
}

function errorStringField(error: unknown, field: "code" | "path" | "syscall"): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = Object.getOwnPropertyDescriptor(error, field)?.value;
  return typeof value === "string" ? value : undefined;
}

/**
 * Build the default per-workspace get3w config metadata. The get3w
 * machine state is stored in the runtime DB. ensureWorkspaceFiles writes only
 * portable metadata to root get3w.json; callers seed local defaults separately.
 */
export function defaultWorkspaceGet3wConfig(workspaceRoot: string, preset: string): WorkspaceGet3wConfig {
  return {
    version: 1,
    workspace: {
      name: basename(workspaceRoot) || "Workspace",
      createdAt: Date.now(),
      preset,
    },
    authorizedRoots: [workspaceRoot],
    reload: null,
  };
}

// Older Get3W versions added this exact npm browser plugin entry to
// workspace configs. The built-in browser tools replaced it; left in place, it
// loads a second set of browser tools that clash by name and skip the member's
// website rules. A version-pinned entry was added by someone else and stays.
const LEGACY_BROWSER_PLUGIN = "opencode-chrome-devtools";

export function isLegacyBrowserPlugin(value: unknown): boolean {
  return value === LEGACY_BROWSER_PLUGIN;
}

async function ensureOpencodeConfig(workspaceRoot: string): Promise<boolean> {
  const path = opencodeConfigPath(workspaceRoot);
  if (!(await exists(path))) return false;
  const { data } = await readJsoncFile<Record<string, unknown>>(path, {}, { allowInvalid: true });
  if (!Array.isArray(data.plugin) || !data.plugin.some(isLegacyBrowserPlugin)) return false;
  // Remove only that entry, keeping the rest of the file and its comments.
  const plugin = data.plugin.filter((item) => !isLegacyBrowserPlugin(item));
  await updateJsoncTopLevel(path, { plugin: plugin.length ? plugin : undefined });
  return true;
}

export async function ensureWorkspaceFiles(workspaceRoot: string, presetInput: string): Promise<EnsureWorkspaceFilesResult> {
  const preset = normalizePreset(presetInput);
  if (!workspaceRoot.trim()) {
    throw new ApiError(400, "invalid_workspace_path", "workspace path is required");
  }
  try {
    await ensureDir(workspaceRoot);
  } catch (error) {
    throw new ApiError(409, "workspace_inaccessible", "Workspace path is not accessible", {
      path: workspaceRoot,
      fsCode: errorStringField(error, "code"),
      syscall: errorStringField(error, "syscall"),
      fsPath: errorStringField(error, "path"),
    });
  }
  const reloadReasons = new Set<ReloadReason>();
  if (await ensureOpencodeConfig(workspaceRoot)) reloadReasons.add("config");
  // Shareable project metadata lives at the root; machine state stays in the DB.
  await ensureGet3wProjectConfig(workspaceRoot, defaultWorkspaceGet3wConfig(workspaceRoot, preset));
  return {
    changed: reloadReasons.size > 0,
    reloadReasons: Array.from(reloadReasons),
  };
}

/**
 * Provision workspace files for every workspace that has local files to set up.
 *
 * Skips any workspace without a resolved local path, which would otherwise
 * reach ensureWorkspaceFiles() — which throws
 * `invalid_workspace_path` on a blank path — and abort server startup. Local
 * provisioning failures are logged and skipped so one stale path cannot abort
 * startup. Shared by the embedded-server and CLI boot paths.
 */
export async function ensureLocalWorkspaceFiles(
  workspaces: ReadonlyArray<Pick<WorkspaceInfo, "path" | "preset">>,
): Promise<void> {
  for (const workspace of workspaces) {
    if (!workspace.path.trim()) continue;
    try {
      await ensureWorkspaceFiles(workspace.path, workspace.preset);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to provision workspace files at ${workspace.path}: ${message}`);
    }
  }
}

export async function readRawOpencodeConfig(path: string): Promise<{ exists: boolean; content: string | null }> {
  const hasFile = await exists(path);
  if (!hasFile) {
    return { exists: false, content: null };
  }
  const content = await readFile(path, "utf8");
  return { exists: true, content };
}

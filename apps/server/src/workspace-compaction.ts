import { join } from "node:path";
import { readJsoncFile, updateJsoncPath } from "./jsonc.js";
import { ApiError } from "./errors.js";

// Match the engine's project precedence: directory config follows root files,
// and JSONC follows JSON. Never write the shared engine config for this setting.
function candidates(root: string): string[] {
  return [join(root, "opencode.json"), join(root, "opencode.jsonc"),
    join(root, ".opencode", "opencode.json"), join(root, ".opencode", "opencode.jsonc")];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readWorkspaceCompaction(root: string): Promise<Record<string, unknown> | undefined> {
  let result: Record<string, unknown> | undefined;
  for (const path of candidates(root)) {
    const { data } = await readJsoncFile<unknown>(path, {});
    if (record(data) && record(data.compaction)) result = { ...result, ...data.compaction };
  }
  return result;
}

export async function writeWorkspaceAutoCompaction(root: string, value: unknown): Promise<{ changed: boolean; path: string }> {
  if (!record(value) || Object.keys(value).some((key) => key !== "auto") || typeof value.auto !== "boolean") {
    throw new ApiError(400, "invalid_compaction", "compaction must contain a boolean auto setting");
  }
  let target = join(root, "opencode.jsonc");
  for (const path of candidates(root)) {
    const file = await readJsoncFile<unknown>(path, {});
    if (!file.missing) target = path;
  }
  const current = await readWorkspaceCompaction(root);
  if (current?.auto === value.auto) return { changed: false, path: target };
  // Update only the leaf: retain comments and engine-specific compaction fields.
  await updateJsoncPath(target, ["compaction", "auto"], value.auto);
  return { changed: true, path: target };
}

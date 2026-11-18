import { writeFile } from "node:fs/promises";
import { ensureGet3wProjectConfig, get3wProjectConfig, get3wProjectConfigPath } from "@get3w/paths";

/** Project fields override stored metadata; file contents never supply local grants. */
export async function effectiveWorkspaceConfig(root: string, local: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { ...local, ...await ensureGet3wProjectConfig(root, local) };
}

export async function saveWorkspaceProjectConfig(root: string, current: Record<string, unknown>, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const next = { ...await effectiveWorkspaceConfig(root, current), ...patch };
  await writeFile(get3wProjectConfigPath(root), JSON.stringify(get3wProjectConfig(next), null, 2) + "\n", "utf8");
  return next;
}

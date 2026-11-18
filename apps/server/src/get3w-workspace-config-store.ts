import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";

function normalizeGet3wWorkspaceConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseGet3wWorkspaceConfig(configJson: string): Record<string, unknown> {
  try {
    return normalizeGet3wWorkspaceConfig(JSON.parse(configJson));
  } catch {
    return {};
  }
}

const get3wWorkspaceConfigStore = createWorkspaceKvStore<Record<string, unknown>>({
  tableName: "get3w_workspace_configs",
  valueColumn: "config_json",
  parse: parseGet3wWorkspaceConfig,
  serialize: (value) => JSON.stringify(value),
});

export async function readGet3wWorkspaceConfig(config: ServerConfig, workspaceId: string): Promise<Record<string, unknown>> {
  return await get3wWorkspaceConfigStore.get(config, workspaceId) ?? {};
}

export async function writeGet3wWorkspaceConfig(
  config: ServerConfig,
  workspaceId: string,
  updater: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const next = normalizeGet3wWorkspaceConfig(updater(await readGet3wWorkspaceConfig(config, workspaceId)));
  await get3wWorkspaceConfigStore.set(config, workspaceId, next);
  return next;
}

export async function hasGet3wWorkspaceConfig(
  config: ServerConfig,
  workspaceId: string,
): Promise<boolean> {
  return get3wWorkspaceConfigStore.has(config, workspaceId);
}

/**
 * Seed the DB-backed get3w config for a workspace if no row exists yet.
 * Used at workspace creation and as the migrate-on-read landing spot for
 * legacy `.opencode/get3w.json` files. No-op when a row is already present,
 * so it never clobbers live provisioning state.
 */
export async function seedGet3wWorkspaceConfigIfEmpty(
  config: ServerConfig,
  workspaceId: string,
  seed: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (await hasGet3wWorkspaceConfig(config, workspaceId)) {
    return readGet3wWorkspaceConfig(config, workspaceId);
  }
  return writeGet3wWorkspaceConfig(config, workspaceId, () => seed);
}

export function mergeGet3wWorkspaceConfigs(
  legacy: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  return { ...legacy, ...stored };
}

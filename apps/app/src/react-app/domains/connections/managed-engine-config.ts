import { unwrap } from "@/app/lib/opencode";
import { isOpencodeV2Client } from "@/app/lib/opencode-v2-adapter";
import type { Get3wServerClient } from "@/app/lib/get3w-server";
import type { Client } from "@/app/types";

type WorkspaceType = string;

export type UpdateManagedDisabledProvidersOptions = {
  opencodeClient: Client | null;
  get3wClient?: Get3wServerClient | null;
  workspaceId?: string | null;
  workspaceType?: WorkspaceType | null;
  disabledProviders: unknown;
  currentConfig?: unknown;
  removeFallbackKeyWhenEmpty?: boolean;
  markReloadRequired?: () => void;
};

export type UpdateManagedDisabledProvidersResult = {
  managedRuntime: boolean;
  disabledProviders: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDisabledProviders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const providers: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const provider = entry.trim();
    if (provider && !providers.includes(provider)) providers.push(provider);
  }
  return providers;
}

export function disabledProvidersFromConfig(config: unknown): string[] {
  return isRecord(config) ? normalizeDisabledProviders(config.disabled_providers) : [];
}

export type ReadManagedDisabledProvidersOptions = {
  opencodeClient: Client | null;
  get3wClient?: Get3wServerClient | null;
  workspaceId?: string | null;
  workspaceType?: WorkspaceType | null;
  directory?: string;
};

/**
 * The providers hidden through `disabled_providers` (for example a
 * disconnected OpenCode Zen). OpenCode v1 reports them in its config. OpenCode
 * v2 keeps engine config private, so read the same shared list from the
 * Get3W server instead of treating it as empty and overwriting it.
 */
export async function readManagedDisabledProviders(
  options: ReadManagedDisabledProvidersOptions,
): Promise<string[]> {
  const client = options.opencodeClient;
  const workspaceId = options.workspaceId?.trim() ?? "";
  const get3wClient = options.get3wClient;
  const managedRuntime = Boolean(get3wClient && workspaceId && (options.workspaceType === "local" || options.workspaceType === "always-on"));
  const readRuntime = async () => get3wClient && managedRuntime
    ? normalizeDisabledProviders((await get3wClient.getRuntimeDisabledProviders(workspaceId)).disabledProviders)
    : [];
  if (client && isOpencodeV2Client(client)) return readRuntime();
  if (!client) return [];
  const config = unwrap(await client.config.get(options.directory ? { directory: options.directory } : undefined));
  const fromConfig = disabledProvidersFromConfig(config);
  if (!managedRuntime) return fromConfig;
  // updateManagedDisabledProviders writes this list on the server. v1 only
  // reads it after an engine reload, which v2 chat routing never runs, so its
  // config alone misses a provider that was just disabled (ENG-994).
  const fromRuntime = await readRuntime().catch(() => []);
  return normalizeDisabledProviders([...fromConfig, ...fromRuntime]);
}

function configWithDisabledProviders(
  config: unknown,
  providers: string[],
  removeWhenEmpty: boolean,
): Record<string, unknown> {
  const next = { ...(isRecord(config) ? config : {}) };
  if (providers.length > 0 || !removeWhenEmpty) {
    next.disabled_providers = providers;
  } else {
    delete next.disabled_providers;
  }
  return next;
}

export async function updateManagedDisabledProviders(
  options: UpdateManagedDisabledProvidersOptions,
): Promise<UpdateManagedDisabledProvidersResult> {
  const disabledProviders = normalizeDisabledProviders(options.disabledProviders);
  const workspaceId = options.workspaceId?.trim() ?? "";

  if (options.get3wClient && workspaceId && (options.workspaceType === "local" || options.workspaceType === "always-on")) {
    const result = await options.get3wClient.setRuntimeDisabledProviders(workspaceId, disabledProviders);
    return { managedRuntime: true, disabledProviders: result.disabledProviders };
  }

  const client = options.opencodeClient;
  if (!client) throw new Error("OpenCode client is not connected.");
  const currentConfig = options.currentConfig ?? unwrap(await client.config.get());
  await client.config.update({
    config: configWithDisabledProviders(
      currentConfig,
      disabledProviders,
      options.removeFallbackKeyWhenEmpty === true,
    ),
  });
  return { managedRuntime: false, disabledProviders };
}

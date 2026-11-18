import { materializeLegacyFastProviders } from "@get3w/types/cloud-model-fast";
import { fileURLToPath } from "node:url";
import { isLegacyBrowserPlugin } from "./workspace-init.js";
/**
 * Runtime OpenCode configuration injected via a server-managed config file
 * passed to the engine as OPENCODE_CONFIG.
 *
 * This is the single source of truth for the get3w agent definition,
 * plugins, and any other config that should be injected at runtime rather
 * than written to the user's own config files. Both cli.ts and embedded.ts
 * use this.
 *
 * The engine re-reads the OPENCODE_CONFIG file from disk on every instance
 * rebuild (e.g. /instance/dispose), so the file is synchronized on every
 * runtime-DB write — unlike the previous OPENCODE_CONFIG_CONTENT env var,
 * which was frozen at spawn and reverted MCP state on each dispose.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  get3wExtensionsPreviewPluginPath,
  get3wCapabilitiesKnowledgePluginPath,
  get3wAnthropicAdaptiveThinkingPluginPath,
  get3wAnthropicToolSchemaPluginPath,
  get3wTitleRecoveryPluginPath,
  get3wOfficeAttachmentsPluginPath,
  get3wSpreadsheetsPluginPath,
  get3wChromeDevtoolsPluginPath,
  get3wComputerUsePluginPath,
  get3wPdfAttachmentsPluginPath,
  get3wPluginPath,
} from "./get3w-extensions-plugin-path.js";
import type { ServerConfig } from "./types.js";
import { runtimeStorageDir } from "./runtime-db.js";
import {
  onRuntimeOpencodeConfigWrite,
  isEngineGlobalRuntimeConfigId,
  readGlobalRuntimeOpencodeConfig,
  runtimeDisabledProviderList,
  runtimeMcpMap,
  runtimeProviderMap,
  runtimePluginList,
  type RuntimeOpencodeConfig,
} from "./runtime-opencode-config-store.js";
import { CONNECT_MCP_SERVER_NAME_PREFIX } from "./connect-mcp-server-catalog.js";
import { GET3W_AGENT_PROMPT } from "./get3w-agent-prompt.js";

export async function buildGet3wRuntimeConfigObject(
  config?: ServerConfig,
): Promise<Record<string, unknown>> {
  // Workspace-independent by design: the injected engine config file is
  // rendered from the ENGINE_GLOBAL runtime row plus static built-ins only,
  // so workspace activation rewrites identical bytes and never varies the
  // engine-pool fingerprint. Per-workspace MCPs reach the engine through the
  // dynamic push path instead.
  const runtimeConfig = config ? await readGlobalRuntimeOpencodeConfig(config) : {};
  return buildGet3wRuntimeConfigObjectFromSnapshot(runtimeConfig);
}

// Older runtime configs may still list Get3W's retired policy plugins (as
// paths or file URLs). Drop only those registrations; a third-party plugin
// with the same basename stays.
function isRetiredPolicyPlugin(value: string): boolean {
  let path = value;
  if (value.startsWith("file:")) {
    try { path = fileURLToPath(value); } catch { return false; }
  }
  return path === get3wPluginPath("managed-policy") || path === get3wPluginPath("managed-policy-next");
}

export function buildGet3wRuntimeConfigObjectFromSnapshot(
  runtimeConfig: RuntimeOpencodeConfig,
): Record<string, unknown> {
  const disabledProviders = runtimeDisabledProviderList(runtimeConfig);
  const { managedPolicy: _managedPolicy, managedPrompt: _managedPrompt, ...engineConfig } = runtimeConfig;
  const provider = materializeLegacyFastProviders(runtimeProviderMap(runtimeConfig));
  return {
    ...engineConfig,
    default_agent: runtimeConfig.default_agent ?? "get3w",
    agent: {
      get3w: {
        description: "Get3W default agent",
        mode: "primary",
        temperature: 0.2,
        prompt: GET3W_AGENT_PROMPT,
        permission: {
          skill: {
            // Get3W supplies its own current skill routing and no longer
            // supports these engine or legacy workspace skills.
            "customize-opencode": "deny",
            "get-started": "deny",
            "command-creator": "deny",
            "agent-creator": "deny",
            "plugin-creator": "deny",
          },
        },
      },
    },
    plugin: [
      get3wChromeDevtoolsPluginPath(),
      get3wComputerUsePluginPath(),
      // Registration order is prompt order: the knowledge plugin appends the
      // operating rules first, then the extensions plugin adds app-control
      // mechanics, live Connect steering, and the remote skill and Automation
      // catalogs, so rules precede state and state precedes data.
      get3wCapabilitiesKnowledgePluginPath(),
      get3wExtensionsPreviewPluginPath(),
      get3wOfficeAttachmentsPluginPath(),
      get3wSpreadsheetsPluginPath(),
      get3wPdfAttachmentsPluginPath(),
      get3wAnthropicAdaptiveThinkingPluginPath(),
      get3wAnthropicToolSchemaPluginPath(),
      get3wTitleRecoveryPluginPath(),
      ...runtimePluginList(runtimeConfig).filter((plugin) => !isRetiredPolicyPlugin(plugin) && !isLegacyBrowserPlugin(plugin)),
    ],
    ...(disabledProviders.length ? { disabled_providers: disabledProviders } : {}),
    mcp: Object.fromEntries(Object.entries(runtimeMcpMap(runtimeConfig))
      .filter(([name]) => name !== "get3w-cloud" && !name.startsWith(CONNECT_MCP_SERVER_NAME_PREFIX) && !name.startsWith("get3w-direct-") && !name.startsWith("get3w-app-host-connect-"))),
    ...(Object.keys(provider).length ? { provider } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

export async function buildGet3wRuntimeConfig(config?: ServerConfig): Promise<string> {
  return stableStringify(await buildGet3wRuntimeConfigObject(config));
}

export function get3wRuntimeConfigFilePath(config: ServerConfig): string {
  return join(runtimeStorageDir(config), "runtime-opencode-config.json");
}

// Serialize file writes per path so a slow older write can never land after
// (and clobber) a newer one. Content is built inside the queued job so each
// job reads the latest runtime-DB state.
export interface Get3wRuntimeConfigWriteResult {
  path: string;
  changed: boolean;
}

const fileWriteQueue = new Map<string, Promise<Get3wRuntimeConfigWriteResult>>();

/**
 * Rebuild the engine-visible runtime config file from the runtime DB.
 * Atomic (temp file + rename) so the engine never reads a partial file
 * mid-dispose.
 */
export async function writeGet3wRuntimeConfigFile(
  config: ServerConfig,
): Promise<Get3wRuntimeConfigWriteResult> {
  const path = get3wRuntimeConfigFilePath(config);
  const job = async () => {
    const content = await buildGet3wRuntimeConfig(config);
    const current = await readFile(path, "utf8").catch(() => undefined);
    if (current === content) return { path, changed: false };
    await mkdir(runtimeStorageDir(config), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
    return { path, changed: true };
  };
  const previous = fileWriteQueue.get(path) ?? Promise.resolve();
  const next = previous.then(job, job);
  fileWriteQueue.set(path, next);
  return await next;
}

/**
 * Keep the runtime config file in sync with the runtime DB so every engine
 * instance rebuild reads fresh state instead of a spawn-time snapshot.
 * Returns an unsubscribe function.
 */
export function keepGet3wRuntimeConfigFileFresh(config: ServerConfig): () => void {
  return onRuntimeOpencodeConfigWrite((writeConfig, writtenWorkspaceId) => {
    if (!isEngineGlobalRuntimeConfigId(writtenWorkspaceId)) return;
    void writeGet3wRuntimeConfigFile(writeConfig).catch(() => undefined);
  });
}

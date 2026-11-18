import { t } from "@/i18n";
import { z } from "zod";
import type { McpStatusMap } from "../types";
import type { ConnectionActionIntent } from "@get3w/types/connection-action-app";
import type { Message, Part, Session, Todo } from "@opencode-ai/sdk/v2/client";
import type { GatewayDesktopOauthStartRequest, GatewayDesktopOauthStartResponse, GatewayUsableModel } from "@get3w/types/den/gateway";
import {
  agentContextDiagnosticsReportSchema,
  agentContextDiagnosticsRequestSchema,
  type AgentContextDiagnosticsReport,
  type AgentContextDiagnosticsRequest,
} from "@get3w/types/agent-context-diagnostics";
import { normalizeBaseUrl } from "@get3w/types/url";
import {
  AGENT_CONTEXT_DIAGNOSTICS_REQUEST_TIMEOUT_MS,
  requestAgentContextDiagnosticsPayload,
} from "./agent-context-diagnostics-transport";
import { desktopFetch, desktopFetchViaMain, desktopFetchAgentContextDiagnostics } from "./desktop";
import { isGet3wGatewayRuntime } from "./gateway-runtime";
import { parseGatewayUsableModel } from "./gateway-usable-model";
import { isDesktopRuntime } from "./runtime-env";
import type { ExecResult, OpencodeConfigFile, WorkspaceInfo, WorkspaceList } from "./desktop";
import type { CloudImportedMarketplace, CloudImportedPlugin, CloudImportedProvider } from "../cloud/import-state";
import { claudeImportItemsSchema, claudeImportResultsSchema } from "./claude-import";


export type Get3wServerCapabilities = {
  skills: { read: boolean; write: boolean; source: "get3w" | "opencode" };
  plugins: { read: boolean; write: boolean };
  mcp: { read: boolean; write: boolean };
  commands: { read: boolean; write: boolean };
  config: { read: boolean; write: boolean };
  engine?: { rollover: boolean };
  providerSync?: boolean;
  sandbox?: { enabled: boolean; backend: "none" | "docker" | "container" };
  proxy?: { opencode: boolean };
  toolProviders?: {
    browser?: {
      enabled: boolean;
      placement: "in-sandbox" | "host-machine" | "client-machine" | "external";
      mode: "none" | "headless" | "interactive";
    };
    files?: {
      injection: boolean;
      outbox: boolean;
      inboxPath: string;
      outboxPath: string;
      maxBytes: number;
    };
  };
};

export type Get3wCloudProviderSyncRun = {
  status: "applied" | "noop" | "failed" | "no_session";
  message?: string;
};

export type Get3wCloudProviderSyncSkippedProvider = {
  cloudProviderId: string;
  credentialSetId?: string;
  models?: GatewayUsableModel[];
  providerId: string;
  name: string;
  /** Machine-readable skip reason, e.g. "missing_credentials". */
  reason: string;
  /** `member_auth_required` gateway providers: Den URL that starts the member's OAuth grant. */
  authUrl?: string | null;
};

export type Get3wCloudProviderSyncStatus = {
  hasSession: boolean;
  lastRun: { at: string | number; status: Get3wCloudProviderSyncRun["status"]; message?: string } | null;
  providers: CloudImportedProvider[];
  /** A managed engine reload is still owed: materialized providers are not served yet. */
  reloadPending: boolean;
  /** Den-granted providers the server sync skipped, each with a reason. */
  skippedProviders: Get3wCloudProviderSyncSkippedProvider[];
};

export interface EngineV2MigrationStatus {
  state: "idle" | "running" | "completed" | "error";
  /** Restoring counts messages separately from the chat-copy counts. */
  phase?: "starting" | "converting" | "restoring" | "copying";
  restored?: number;
  restoreTotal?: number;
  imported: number;
  skipped: number;
  total: number;
  /** ISO time the current migration started. */
  startedAt?: string;
  error?: string;
  /** Where the v2 chat database was copied before this migration wrote to it. */
  backupPath?: string;
  /** Chats left in v1 because they could not be copied; older servers omit it. */
  notCopied?: Array<{ id: string; title: string }>;
  /** Chats copied without their largest outputs and attachments; older servers omit it. */
  trimmed?: Array<{ id: string; title: string }>;
  /** This run picks up a migration Get3W closed before it finished. */
  resumed?: boolean;
}

function parseChats(value: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((chat: unknown) =>
    chat && typeof chat === "object" && "id" in chat && typeof chat.id === "string"
      ? [{ id: chat.id, title: "title" in chat && typeof chat.title === "string" ? chat.title : "" }]
      : []);
}

function parseEngineV2Migration(value: unknown): EngineV2MigrationStatus | undefined {
  if (!value || typeof value !== "object" || !("state" in value)
    || !["idle", "running", "completed", "error"].includes(String(value.state))) return undefined;
  if (value.state !== "idle" && value.state !== "running" && value.state !== "completed" && value.state !== "error") return undefined;
  if (!("imported" in value) || typeof value.imported !== "number"
    || !("skipped" in value) || typeof value.skipped !== "number"
    || !("total" in value) || typeof value.total !== "number") return undefined;
  const phase = "phase" in value && (value.phase === "starting" || value.phase === "converting" || value.phase === "restoring" || value.phase === "copying")
    ? value.phase : undefined;
  return { state: value.state, imported: value.imported, skipped: value.skipped, total: value.total,
    ...(phase ? { phase } : {}),
    ...("restored" in value && typeof value.restored === "number" ? { restored: value.restored } : {}),
    ...("restoreTotal" in value && typeof value.restoreTotal === "number" ? { restoreTotal: value.restoreTotal } : {}),
    ...("startedAt" in value && typeof value.startedAt === "string" ? { startedAt: value.startedAt } : {}),
    ...("backupPath" in value && typeof value.backupPath === "string" ? { backupPath: value.backupPath } : {}),
    ...("notCopied" in value ? { notCopied: parseChats(value.notCopied) } : {}),
    ...("trimmed" in value ? { trimmed: parseChats(value.trimmed) } : {}),
    ...("resumed" in value && value.resumed === true ? { resumed: true } : {}),
    error: "error" in value && typeof value.error === "string" ? value.error : undefined };
}

/** Work an engine switch or migration would interrupt, as counts only. */
export interface EngineActivityCount {
  verdict: "idle" | "busy" | "unknown";
  busySessions: number;
  waitingRequests: number;
}

export interface EngineActivity {
  v1: EngineActivityCount;
  /** Null while the v2 sidecar is not running. */
  v2: EngineActivityCount | null;
}

function parseEngineActivityCount(value: unknown): EngineActivityCount | null {
  if (!value || typeof value !== "object" || !("verdict" in value)) return null;
  const verdict = value.verdict;
  if (verdict !== "idle" && verdict !== "busy" && verdict !== "unknown") return null;
  const count = (key: "busySessions" | "waitingRequests") => {
    const raw: unknown = key in value ? Reflect.get(value, key) : 0;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
  };
  return { verdict, busySessions: count("busySessions"), waitingRequests: count("waitingRequests") };
}

function parseEngineActivity(value: unknown): EngineActivity {
  const v1 = value && typeof value === "object" && "v1" in value ? parseEngineActivityCount(value.v1) : null;
  if (!v1) throw new Error("Invalid engine activity response.");
  const v2 = value && typeof value === "object" && "v2" in value ? parseEngineActivityCount(value.v2) : null;
  return { v1, v2 };
}

export interface EngineV2PreviewStatus {
  enabled: boolean;
  running: boolean;
  chatRouting: boolean;
  /** Effective server ownership of the live provider catalog. Older servers omit it. */
  liveProviderSync?: boolean;
  /** Ownership of the engine selection; older servers omit these fields. */
  engineOrigin?: "fresh" | "manual" | "forced" | "reverted";
  engineChangedAt?: string;
  engineForced?: boolean;
  /** The host is preparing a forced upgrade; engine ownership has not moved yet. */
  forceUpgradePending?: boolean;
  version?: string;
  pid?: number;
  binSource?: string;
  migration?: EngineV2MigrationStatus;
  /** Older servers omit it; treat that as unknown and do not prompt. */
  v1HistoryAvailable?: boolean;
  mirroredProviderIds: string[];
  skippedProviderIds: string[];
  /** Why each skipped provider is not on OpenCode v2. Older servers, and the rollout switched off, omit it. */
  skippedProviders?: EngineV2SkippedProvider[];
  catalogModelIds: string[];
  lastMirroredAt?: string;
  lastError?: string;
}

/**
 * `policy`: the organization allows only its own providers. Every other
 * reason means the provider is connected on this computer but OpenCode v2
 * cannot use it yet (`oauth` sign-ins, `unsupported` adapters, `metadata` or
 * `credentials` it could not read). A reason a newer server adds reads as
 * `unsupported`, never as ready.
 */
export type EngineV2SkippedProviderReason = "policy" | "oauth" | "unsupported" | "metadata" | "credentials";

export interface EngineV2SkippedProvider {
  id: string;
  reason: EngineV2SkippedProviderReason;
}

const ENGINE_V2_SKIP_REASONS: readonly EngineV2SkippedProviderReason[] = ["policy", "oauth", "unsupported", "metadata", "credentials"];

function parseEngineV2SkippedProviders(value: unknown): EngineV2SkippedProvider[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item): EngineV2SkippedProvider[] => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id) return [];
    const reason = "reason" in item ? ENGINE_V2_SKIP_REASONS.find((known) => known === item.reason) : undefined;
    return [{ id: item.id, reason: reason ?? "unsupported" }];
  });
}

const workspaceDefaultModelRefSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  variant: z.string().optional(),
});

const workspaceDefaultModelStateSchema = z.object({
  model: workspaceDefaultModelRefSchema.nullable(),
  updatedAt: z.number().nullable(),
});

/** The model a new chat in a workspace uses, as remembered by its Get3W server. */
export type WorkspaceDefaultModelRef = z.infer<typeof workspaceDefaultModelRefSchema>;
export type WorkspaceDefaultModelState = z.infer<typeof workspaceDefaultModelStateSchema>;

function parseWorkspaceDefaultModelState(value: unknown): WorkspaceDefaultModelState {
  const parsed = workspaceDefaultModelStateSchema.safeParse(value);
  if (!parsed.success) throw new Get3wServerError(502, "invalid_response", "Invalid workspace default model response");
  return parsed.data;
}

function parseEngineV2PreviewStatus(value: unknown): EngineV2PreviewStatus {
  if (
    !value || typeof value !== "object" ||
    !("enabled" in value) || typeof value.enabled !== "boolean" ||
    !("running" in value) || typeof value.running !== "boolean" ||
    !("mirroredProviderIds" in value) || !Array.isArray(value.mirroredProviderIds) || !value.mirroredProviderIds.every((item) => typeof item === "string") ||
    !("skippedProviderIds" in value) || !Array.isArray(value.skippedProviderIds) || !value.skippedProviderIds.every((item) => typeof item === "string") ||
    !("catalogModelIds" in value) || !Array.isArray(value.catalogModelIds) || !value.catalogModelIds.every((item) => typeof item === "string")
  ) {
    throw new Error("Invalid OpenCode v2 engine preview status response.");
  }
  const skippedProviders = parseEngineV2SkippedProviders("skippedProviders" in value ? value.skippedProviders : undefined);
  return {
    migration: parseEngineV2Migration("migration" in value ? value.migration : undefined),
    ...("v1HistoryAvailable" in value && typeof value.v1HistoryAvailable === "boolean"
      ? { v1HistoryAvailable: value.v1HistoryAvailable } : {}),
    ...("engineOrigin" in value && (value.engineOrigin === "fresh" || value.engineOrigin === "manual"
      || value.engineOrigin === "forced" || value.engineOrigin === "reverted") ? { engineOrigin: value.engineOrigin } : {}),
    ...("engineChangedAt" in value && typeof value.engineChangedAt === "string" ? { engineChangedAt: value.engineChangedAt } : {}),
    ...("engineForced" in value && typeof value.engineForced === "boolean" ? { engineForced: value.engineForced } : {}),
    ...("forceUpgradePending" in value && typeof value.forceUpgradePending === "boolean"
      ? { forceUpgradePending: value.forceUpgradePending } : {}),
    enabled: value.enabled,
    running: value.running,
    chatRouting: "chatRouting" in value && typeof value.chatRouting === "boolean" ? value.chatRouting : false,
    ...("liveProviderSync" in value && typeof value.liveProviderSync === "boolean"
      ? { liveProviderSync: value.liveProviderSync } : {}),
    version: "version" in value && typeof value.version === "string" ? value.version : undefined,
    pid: "pid" in value && typeof value.pid === "number" ? value.pid : undefined,
    binSource: "binSource" in value && typeof value.binSource === "string" ? value.binSource : undefined,
    mirroredProviderIds: value.mirroredProviderIds,
    skippedProviderIds: value.skippedProviderIds,
    ...(skippedProviders ? { skippedProviders } : {}),
    catalogModelIds: value.catalogModelIds,
    lastMirroredAt: "lastMirroredAt" in value && typeof value.lastMirroredAt === "string" ? value.lastMirroredAt : undefined,
    lastError: "lastError" in value && typeof value.lastError === "string" ? value.lastError : undefined,
  };
}

function parseCloudProviderSyncRun(value: unknown): Get3wCloudProviderSyncRun {
  if (!value || typeof value !== "object" || !("status" in value)) throw new Error("Invalid cloud provider sync response.");
  const status = value.status;
  if (status !== "applied" && status !== "noop" && status !== "failed" && status !== "no_session") {
    throw new Error("Invalid cloud provider sync status.");
  }
  const message = "message" in value && typeof value.message === "string" ? value.message : undefined;
  return { status, message };
}

function parseCloudImportedProvider(value: unknown): CloudImportedProvider | null {
  if (!value || typeof value !== "object") return null;
  if (
    !("cloudProviderId" in value) || typeof value.cloudProviderId !== "string" ||
    !("providerId" in value) || typeof value.providerId !== "string" ||
    !("sourceProviderId" in value) || typeof value.sourceProviderId !== "string" ||
    !("name" in value) || typeof value.name !== "string" ||
    !("modelIds" in value) || !Array.isArray(value.modelIds) || !value.modelIds.every((item) => typeof item === "string")
  ) return null;
  const modelIds = value.modelIds;
  return {
    cloudProviderId: value.cloudProviderId,
    providerId: value.providerId,
    sourceProviderId: value.sourceProviderId,
    name: value.name,
    source: "source" in value && typeof value.source === "string" ? value.source : null,
    updatedAt: "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : null,
    modelIds: value.modelIds,
    pinnedModelIds: "pinnedModelIds" in value && Array.isArray(value.pinnedModelIds)
      ? [...new Set(value.pinnedModelIds.filter((id): id is string => typeof id === "string"))].filter((id) => modelIds.includes(id)) : [],
    ...("modelConfigVersion" in value && typeof value.modelConfigVersion === "number"
      ? { modelConfigVersion: value.modelConfigVersion } : {}),
    importedAt: "importedAt" in value && typeof value.importedAt === "number" ? value.importedAt : null,
  };
}

function parseCloudProviderSyncStatus(value: unknown): Get3wCloudProviderSyncStatus {
  if (!value || typeof value !== "object" || !("hasSession" in value) || typeof value.hasSession !== "boolean" || !("providers" in value) || !Array.isArray(value.providers)) {
    throw new Error("Invalid cloud provider sync status response.");
  }
  const providers: CloudImportedProvider[] = [];
  for (const rawProvider of value.providers) {
    const provider = parseCloudImportedProvider(rawProvider);
    if (!provider) throw new Error("Invalid cloud provider sync provider response.");
    providers.push(provider);
  }
  let lastRun: Get3wCloudProviderSyncStatus["lastRun"] = null;
  if ("lastRun" in value && value.lastRun !== null) {
    if (!value.lastRun || typeof value.lastRun !== "object" || !("at" in value.lastRun) || (typeof value.lastRun.at !== "string" && typeof value.lastRun.at !== "number")) {
      throw new Error("Invalid cloud provider sync last-run response.");
    }
    const run = parseCloudProviderSyncRun(value.lastRun);
    lastRun = { at: value.lastRun.at, status: run.status, message: run.message };
  }
  // Additive fields (older servers omit them): tolerate absence and malformed
  // entries instead of failing the whole status read.
  const reloadPending = "reloadPending" in value && value.reloadPending === true;
  const skippedProviders: Get3wCloudProviderSyncSkippedProvider[] = [];
  if ("skippedProviders" in value && Array.isArray(value.skippedProviders)) {
    for (const raw of value.skippedProviders) {
      if (!raw || typeof raw !== "object") continue;
      if (
        !("cloudProviderId" in raw) || typeof raw.cloudProviderId !== "string" ||
        !("providerId" in raw) || typeof raw.providerId !== "string" ||
        !("name" in raw) || typeof raw.name !== "string" ||
        !("reason" in raw) || typeof raw.reason !== "string"
      ) continue;
      skippedProviders.push({
        cloudProviderId: raw.cloudProviderId,
        providerId: raw.providerId,
        name: raw.name,
        reason: raw.reason,
        ...("credentialSetId" in raw && typeof raw.credentialSetId === "string" ? { credentialSetId: raw.credentialSetId } : {}),
        ...("authUrl" in raw && typeof raw.authUrl === "string" ? { authUrl: raw.authUrl } : {}),
        ...(raw.reason === "member_auth_required" && "credentialSetId" in raw && "models" in raw && Array.isArray(raw.models)
          ? { models: raw.models.flatMap((value: unknown) => {
            const model = parseGatewayUsableModel(value, raw.credentialSetId);
            return model ? [model] : [];
          }) } : {}),
      });
    }
  }
  return { hasSession: value.hasSession, lastRun, providers, reloadPending, skippedProviders };
}

export type Get3wServerStatus = "connected" | "disconnected" | "limited";

export type Get3wServerDiagnostics = {
  ok: boolean;
  version: string;
  uptimeMs: number;
  readOnly: boolean;
  approval: { mode: "manual" | "auto"; timeoutMs: number };
  corsOrigins: string[];
  workspaceCount: number;
  activeWorkspaceId?: string | null;
  selectedWorkspaceId?: string | null;
  workspace: Get3wWorkspaceInfo | null;
  authorizedRoots: string[];
  server: { host: string; port: number; configPath?: string | null };
  tokenSource: { client: string; host: string };
};

export type Get3wRuntimeServiceName = "get3w-server" | "opencode";

export type Get3wRuntimeServiceSnapshot = {
  name: Get3wRuntimeServiceName;
  enabled: boolean;
  running: boolean;
  targetVersion: string | null;
  actualVersion: string | null;
  upgradeAvailable: boolean;
};

export type Get3wRuntimeSnapshot = {
  ok: boolean;
  worker?: {
    workspace: string;
    sandboxMode: string;
  };
  upgrade?: {
    status: "idle" | "running" | "failed";
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
    operationId: string | null;
    services: Get3wRuntimeServiceName[];
  };
  services: Get3wRuntimeServiceSnapshot[];
};

export type Get3wServerSettings = {
  urlOverride?: string;
  portOverride?: number;
  token?: string;
  hostToken?: string;
};

// The shared WorkspaceWire contract now carries the opencode block; keep the
// historical name as an alias for the many existing imports.
export type Get3wWorkspaceInfo = WorkspaceInfo;

export type Get3wWorkspaceList = {
  items: Get3wWorkspaceInfo[];
  workspaces?: WorkspaceInfo[];
  activeId?: string | null;
};

export type Get3wSessionMessage = {
  info: Message;
  parts: Part[];
};

export type Get3wSessionSnapshot = {
  session: Session;
  messages: Get3wSessionMessage[];
  pagination?: { before?: string; nextCursor: string | null; limit: number };
  todos: Todo[];
  status:
    | { type: "idle" }
    | { type: "busy" }
    | { type: "retry"; attempt: number; message: string; next: number };
};

// Stored history is independently readable. Missing activity fields are not an
// observed idle state or an empty todo list; live hydration owns those values.
export type Get3wSessionHistory = Pick<Get3wSessionSnapshot, "session" | "messages" | "pagination">
  & Partial<Pick<Get3wSessionSnapshot, "status" | "todos">>;

export type Get3wPluginItem = {
  spec: string;
  source: "config" | "dir.project" | "dir.global";
  scope: "project" | "global";
  path?: string;
};

export type Get3wSkillItem = {
  name: string;
  path: string;
  description: string;
  scope: "project" | "global";
  trigger?: string;
  error?: string;
};

export type Get3wSkillContent = {
  item: Get3wSkillItem;
  content: string;
};

export type Get3wWorkspaceFileContent = {
  path: string;
  content: string;
  bytes: number;
  updatedAt: number;
};

export type Get3wWorkspaceFileWriteResult = {
  ok: boolean;
  path: string;
  bytes: number;
  updatedAt: number;
  revision?: string;
};

export type Get3wWorkspaceFileDeleteResult = {
  ok: boolean;
  path: string;
  code?: string;
};

export type Get3wWorkspaceCatalogEntry = {
  path: string;
  kind: "file" | "dir";
  size: number;
  mtimeMs: number;
  revision: string;
};

export type Get3wWorkspaceCatalog = {
  nextAfter?: string;
  incomplete?: boolean;
  skippedDirectories?: string[];
  items: Get3wWorkspaceCatalogEntry[];
  total: number;
  truncated: boolean;
};

export type Get3wAuthorizedFoldersResponse = {
  folders: string[];
  hiddenCount: number;
  workspaceRoot: string;
};

export type Get3wPermissionAction = "allow" | "ask" | "deny";
export type Get3wPermissionSource = "engine" | "global" | "get3w" | "workspace";
export type Get3wEffectivePermissionKey =
  | "shell"
  | "edit"
  | "web"
  | "mcp"
  | "outside_folders"
  | "env_files"
  | "doom_loop";

export type Get3wEffectivePermissionRow = {
  key: Get3wEffectivePermissionKey;
  permission: string;
  action: Get3wPermissionAction;
  rule: { permission: string; pattern: string; action: Get3wPermissionAction } | null;
  source: Get3wPermissionSource | null;
  exceptions: number;
};

export type Get3wEffectivePermissionsResponse = {
  agent: string;
  rows: Get3wEffectivePermissionRow[];
  files: { workspace: string; global: string };
};

export type Get3wAuthorizedFoldersUpdateResponse = {
  folders: string[];
  hiddenCount: number;
  updatedAt: number;
};

export type Get3wRuntimeDisabledProvidersResult = {
  ok: true;
  disabledProviders: string[];
};

export type Get3wRuntimeConfigStatus = {
  runtime: Record<string, unknown>;
  runtimeKeys: string[];
  effectiveRuntime: Record<string, unknown>;
  managedFilePath: string;
  managedFileRebuiltAt: number | null;
  managedFileContentRedacted: string | null;
  sources?: {
    projectOpencode: { path: string; exists: boolean; keys: string[]; config: Record<string, unknown> };
    globalOpencode: { path: string; exists: boolean; keys: string[]; config: Record<string, unknown> };
    runtimeDatabase: { keys: string[]; config: Record<string, unknown> };
    injected: { keys: string[]; config: Record<string, unknown> };
  };
  userOpencode: {
    path: string;
    exists: boolean;
    keys: string[];
  };
};

export type Get3wDesktopCloudSyncChange = {
  id: string;
  kind: "new" | "modified" | "removed";
  resourceKind: "llmProvider" | "marketplace" | "plugin" | "configItem";
  marketplaceId?: string;
  pluginId?: string;
  previousLastUpdatedAt: string | null;
  nextLastUpdatedAt: string | null;
  queuedAt: number;
};

export type Get3wDesktopCloudSyncState = {
  entries: Record<string, unknown>;
  updatedAt: number;
  version: 1;
};

export type Get3wDesktopCloudSyncResult = {
  changes: Get3wDesktopCloudSyncChange[];
  state: Get3wDesktopCloudSyncState;
};

export type Get3wCloudPluginRemoveResult = {
  item: CloudImportedPlugin;
  warnings: string[];
};

export type Get3wCloudPluginsResult = {
  marketplaces: Record<string, CloudImportedMarketplace>;
  plugins: Record<string, CloudImportedPlugin>;
};

function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export type Get3wCommandItem = {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string | null;
  subtask?: boolean;
  scope: "workspace" | "global";
};

export type Get3wMcpItem = {
  name: string;
  config: Record<string, unknown>;
  source: "config.project" | "config.global" | "config.remote";
  disabledByTools?: boolean;
  managedOAuth?: Get3wManagedMcpConnection | null;
};

export type Get3wMcpAppResource = {
  hostConnectionActions?: true;
  /** Opaque, short-lived host context. Absent on generated previews and older servers. */
  launchId?: string;
  refresh?: { resourceDigest: string; expiresAt: number };
  serverName: string;
  toolName: string;
  resourceUri: string;
  html: string;
  csp: {
    connectDomains: string[];
    resourceDomains: string[];
    frameDomains: string[];
    baseUriDomains: string[];
  };
  prefersBorder: boolean;
};

export type Get3wMcpAppLaunchReference = {
  connectionId?: string;
  toolName: string;
  resourceUri: string;
  arguments: Record<string, unknown>;
};

export type Get3wMcpAppCatalogApp = {
  serverName: string;
  /** Present for Connect app-host apps: launch them through this connection reference. */
  connectionId?: string;
  toolName: string;
  projectedToolName: string;
  resourceUri: string;
  title: string | null;
  description: string | null;
  /** True when the launch tool declares required input, so a host cannot start it with empty arguments. */
  requiresInput: boolean;
  /** True when calling the launch tool needs user approval (not explicitly read-only, or destructive). */
  requiresApproval: boolean;
};

export type Get3wMcpAppCatalogServer = {
  serverName: string;
  /** Human-readable provider name for Connect app-host servers. */
  displayName?: string;
  connectionId?: string;
  reachable: boolean;
  error?: string;
  apps: Get3wMcpAppCatalogApp[];
};

export type Get3wMcpAppToolResult = {
  hostAction?: ConnectionActionIntent;
  content: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export type Get3wMcpAppSandbox = {
  url: string;
  expectedOrigin: string;
  sandbox: "allow-scripts" | "allow-scripts allow-same-origin";
};

export function normalizeMcpAppHostOrigin(hostOrigin: string): string {
  return hostOrigin === "file://" ? "null" : hostOrigin;
}

export type Get3wManagedMcpConnection = {
  name: string;
  serverUrl: string;
  enabled: boolean;
  status: "needs_auth" | "connecting" | "connected" | "reconnect_required";
  lastError: string | null;
  hasCredential: boolean;
  updatedAt: number;
};

export type Get3wManagedOAuthState = {
  available: boolean;
  recovery: { at: number; reason: string; quarantinedTo: string } | null;
};

export type Get3wManagedMcpStartResult =
  | { status: "connected" }
  | { status: "needs_auth"; authorizeUrl: string };

export type Get3wMcpEngineSync = {
  status: "ok" | "failed";
  at: number;
  failures: Array<{ name: string; status?: number; message?: string }>;
};

export type Get3wCloudMcpProviderModelContext = {
  provider: string;
  model: string;
};

export type Get3wCloudMcpFailureStage =
  | "prerequisites"
  | "token_mint"
  | "desired_config"
  | "engine_delivery"
  | "transport_auth"
  | "tool_registration"
  | "provider_projection"
  | "plugin_load"
  | "steering"
  | "desired"
  | "workspace"
  | "configuration"
  | "registration"
  | "engine_status"
  | "tool_ids"
  | "plugin_canary";

export type Get3wCloudMcpFailureCode =
  | "cloud_desired_missing"
  | "cloud_mcp_missing"
  | "cloud_mcp_disabled"
  | "cloud_endpoint_invalid"
  | "cloud_token_org_mismatch"
  | "cloud_mcp_needs_auth"
  | "invalid_mcp_token"
  | "mcp_session_revoked"
  | "mcp_membership_revoked"
  | "insufficient_mcp_scope"
  | "wrong_mcp_resource"
  | "workspace_directory_ambiguous"
  | "opencode_unconfigured"
  | "opencode_engine_unreachable"
  | "opencode_unreachable"
  | "cloud_status_missing"
  | "cloud_disabled"
  | "get3w_cloud_auth_required"
  | "get3w_cloud_auth_invalid"
  | "get3w_cloud_token_expired"
  | "get3w_cloud_membership_required"
  | "get3w_cloud_scope_missing"
  | "get3w_cloud_resource_forbidden"
  | "get3w_cloud_resource_not_found"
  | "get3w_cloud_client_registration_required"
  | "cloud_connection_failed"
  | "cloud_registration_failed"
  | "cloud_tools_denied"
  | "opencode_tool_ids_unsupported"
  | "opencode_tool_ids_unavailable"
  | "cloud_tools_missing"
  | "provider_projection_unavailable"
  | "provider_projection_missing"
  | "extensions_plugin_missing"
  | string;

export type Get3wCloudMcpFailure = {
  code: Get3wCloudMcpFailureCode;
  stage: Get3wCloudMcpFailureStage | string;
  retryable: boolean;
  recommendedAction: string;
  message: string;
  aliases?: string[];
  requestId?: string;
  referenceId?: string;
  details?: unknown;
};

export type Get3wCloudMcpCompatibility = {
  get3w: {
    serverVersion: string | null;
    app: Record<string, string | number | boolean | null> | null;
  };
  opencode: {
    expectedVersion: string | null;
    actualVersion: string | null;
    probe: "ok" | "unavailable" | "not_checked" | string;
    error?: unknown;
  };
  pluginFileHashes: Array<{
    name: string;
    sha256: string | null;
    error?: string;
  }>;
  supportedFeatures: {
    dynamicMcp: boolean;
    directoryScoping: boolean;
    toolIds: boolean;
    providerToolProjection: boolean;
    pluginCanaries: boolean;
  };
  experimentalToolIds: {
    checked: boolean;
    expected: string[];
    present: string[];
    missing: string[];
    includesMcpTools: boolean | null;
    limitation?: string;
    error?: unknown;
  };
  experimentalProviderTools: {
    checked: boolean;
    provider?: string;
    model?: string;
    expected: string[];
    present: string[];
    missing: string[];
    includesMcpTools: boolean | null;
    limitation?: string;
    error?: unknown;
  };
};

export type Get3wCloudMcpHealthPhase =
  | "missing_desired"
  | "workspace_ambiguous"
  | "engine_unconfigured"
  | "engine_unreachable"
  | "engine_missing"
  | "engine_disabled"
  | "engine_needs_auth"
  | "engine_needs_client_registration"
  | "engine_failed"
  | "registration_failed"
  | "denied_by_tools"
  | "tool_ids_unsupported"
  | "cloud_tools_missing"
  | "provider_projection_missing"
  | "extensions_plugin_missing"
  | "ready"
  | string;

export type Get3wCloudMcpDeliverySnapshot = {
  state: "not_desired" | "pending" | "registering" | "ready" | "failed" | "stale" | string;
  desiredRevision: string | null;
  appliedRevision: string | null;
  updatedAt: number | null;
  appliedAt: number | null;
  lastAttemptAt: number | null;
  trigger?: string;
  failure?: Get3wCloudMcpFailure;
};

export type Get3wCloudMcpProbeStep = {
  step: "initialize" | "initialized_notice" | "tools_list" | string;
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  error?: unknown;
};

export type Get3wCloudMcpProbeTrace = {
  endpoint: string | null;
  startedAt: string;
  latencyMs: number;
  protocolVersion: string | null;
  serverInfo: { name: string | null; version: string | null } | null;
  steps: Get3wCloudMcpProbeStep[];
};

export type Get3wCloudMcpEngineRefreshStep = {
  step: "engine_disconnect" | "reapply" | string;
  ok: boolean;
  latencyMs: number;
  detail?: unknown;
};

export type Get3wCloudMcpEngineRefresh = {
  performed: boolean;
  reason?: "desired_missing" | string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  steps: Get3wCloudMcpEngineRefreshStep[];
};

export type Get3wCloudMcpEngineRefreshResult = {
  refresh: Get3wCloudMcpEngineRefresh;
  health: Get3wCloudMcpHealth;
};

export type Get3wCloudMcpHealth = {
  schemaVersion: 1;
  phase: Get3wCloudMcpHealthPhase;
  usable: boolean;
  usableByCurrentModel: boolean | null;
  connectCatalogEnabled: boolean;
  /** Local private credential readiness, not provider health. Older servers omit it. */
  appHostAuthorizationReady?: boolean | null;
  connectCatalogDiagnostic?: "ready" | "empty" | "missing_app_host_auth" | "untrusted_origin"
    | "invalid_catalog" | "invalid_proxy_descriptor" | "discovery_unavailable";
  workspace: {
    id: string;
    type: string;
    directory: string | null;
    path: string;
  };
  desired: {
    present: boolean;
    name: "get3w-cloud";
    revision: string | null;
    config: Record<string, unknown> | null;
    token: {
      present: boolean;
      metadata: Record<string, string | number | boolean | null>;
    };
    org?: Record<string, string | number | boolean | null>;
    app?: Record<string, string | number | boolean | null>;
    updatedAt?: number;
  };
  delivery: Get3wCloudMcpDeliverySnapshot;
  engine: {
    status: "not_checked" | "missing" | "connected" | "disabled" | "failed" | "needs_auth" | "needs_client_registration" | "unreachable" | "unknown" | string;
    error?: unknown;
  };
  /** The engine's own view of every MCP server it tracks (older servers omit this). */
  engineInspection?: {
    checked: boolean;
    cloudPresent?: boolean;
    serverCount?: number;
    servers?: Array<{ name: string; status: string; error?: string }>;
  };
  tools: {
    expected: string[];
    present: string[];
    missing: string[];
    direct: {
      checked: boolean;
      source: "mcp_tools_list" | string;
      expected: string[];
      present: string[];
      missing: string[];
      trace?: Get3wCloudMcpProbeTrace;
      error?: unknown;
      failure?: Get3wCloudMcpFailure;
    };
    providerProjection: {
      checked: boolean;
      provider?: string;
      model?: string;
      source?: "experimental_tool" | "provider_capability" | string;
      limitation?: string;
      modelExists?: boolean;
      toolCalling?: boolean | null;
      present: string[];
      missing: string[];
      error?: unknown;
    };
  };
  pluginCanaries: {
    expected: string[];
    present: string[];
    missing: string[];
  };
  compatibility: Get3wCloudMcpCompatibility;
  toolDenies: unknown[];
  firstFailure: Get3wCloudMcpFailure | null;
  checkedAt: string;
  durationMs?: number;
};

export type Get3wCloudMcpReconcilePayload = {
  workspaceId: string;
  name: "get3w-cloud";
  config: Record<string, unknown>;
  /** Desktop-private credential; the local server must never project it into OpenCode. */
  appHostAuthorization?: string;
  tokenMetadata?: Record<string, string | number | boolean | null>;
  org?: Record<string, string | number | boolean | null>;
  app?: Record<string, string | number | boolean | null>;
  appVersion?: string;
  buildSha?: string;
  connectCatalogEnabled?: boolean;
  trigger?: string;
  provider?: string;
  model?: string;
};

export type Get3wWorkspaceExport = {
  workspaceId: string;
  exportedAt: number;
  opencode?: Record<string, unknown>;
  get3w?: Record<string, unknown>;
  skills?: Array<{ name: string; description?: string; trigger?: string; content: string }>;
  commands?: Array<{ name: string; description?: string; template?: string }>;
  files?: Array<{ path: string; content: string }>;
};

export type Get3wWorkspaceExportSensitiveMode = "auto" | "include" | "exclude";

export type Get3wWorkspaceExportWarning = {
  id: string;
  label: string;
  detail: string;
};

export type Get3wConnectState = {
  ok: true;
  schemaVersion: 1;
  status: "available" | "missing" | "invalid" | "unreadable";
  connectEnabled: boolean;
  cloudMcpPresent: boolean;
};

export type Get3wExtensionActionCall = {
  extensionId: string;
  action: string;
  args?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type Get3wExtensionActionResult =
  | {
    ok: true;
    extensionId: string;
    action: string;
    result: unknown;
    context?: Record<string, unknown>;
  }
  | {
    ok: false;
    error: string;
    message: string;
  };

export type Get3wResolvedArtifactTarget = {
  id: string;
  kind: "file" | "url";
  value: string;
  name: string;
  preview: "browser" | "markdown" | "code" | "sheet" | "slides" | "document" | "image" | "pdf" | "html" | "text" | "external";
  confidence: number;
  reason: string;
  exists?: boolean;
  size?: number;
  updatedAt?: number;
  contentType?: string;
  /** Absolute path on the owning server; never implies native/local access. */
  resolvedPath?: string;
  fileScope?: "workspace" | "conversation";
};

export type Get3wWorkspaceFileStat = {
  ok: boolean;
  path: string;
  exists: boolean;
  kind?: "file" | "dir" | "other";
  size?: number;
  updatedAt?: number;
};

export type Get3wInboxItem = {
  id: string;
  name?: string;
  path?: string;
  size?: number;
  updatedAt?: number;
};

export type Get3wInboxList = {
  items: Get3wInboxItem[];
};

export type Get3wInboxUploadResult = {
  ok: boolean;
  path: string;
  bytes: number;
};

export type Get3wUserEnvItem = {
  key: string;
  updatedAt: number;
  hasValue: boolean;
  value?: string;
};

export type Get3wActor = {
  type: "remote" | "host";
  clientId?: string;
  tokenHash?: string;
};

export type Get3wAuditEntry = {
  id: string;
  workspaceId: string;
  actor: Get3wActor;
  action: string;
  target: string;
  summary: string;
  timestamp: number;
};

export type Get3wReloadTrigger = {
  type: "skill" | "plugin" | "config" | "mcp" | "agent" | "command";
  name?: string;
  action?: "added" | "removed" | "updated";
  path?: string;
};

export type Get3wReloadEvent = {
  id: string;
  seq: number;
  workspaceId: string;
  reason: "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";
  trigger?: Get3wReloadTrigger;
  timestamp: number;
};

export type Get3wUiControlRequest = {
  id: string;
  kind: "context" | "query" | "command";
  input: unknown;
  createdAt: number;
};

export type Get3wSessionGroupDefinition = {
  id: string;
  label: string;
};

export type Get3wSessionGroupState = {
  groups: Get3wSessionGroupDefinition[];
  assignments: Record<string, string>;
};

export type Get3wSessionGroupEvent = {
  id: string;
  seq: number;
  workspaceId: string;
  type: "session_groups.updated";
  action: "created" | "updated" | "deleted" | "assigned" | "reordered" | "imported";
  groupId?: string;
  sessionId?: string;
  timestamp: number;
};

const STORAGE_URL_OVERRIDE = "get3w.server.urlOverride";
const STORAGE_PORT_OVERRIDE = "get3w.server.port";
const STORAGE_TOKEN = "get3w.server.token";
const STORAGE_HOST_AUTH_KEY = "get3w.server.hostToken";
// Remote access was removed; writes clear the key older builds persisted.
const LEGACY_STORAGE_REMOTE_ACCESS = "get3w.server.remoteAccessEnabled";

type Get3wBootstrap = {
  token?: string;
};

declare global {
  interface Window {
    __GET3W_BOOTSTRAP__?: Get3wBootstrap;
  }
}

export function normalizeGet3wServerUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return normalizeBaseUrl(withProtocol);
}

export function isLoopbackGet3wServerUrl(input: string) {
  const normalized = normalizeGet3wServerUrl(input) ?? "";
  if (!normalized) return false;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function parseGet3wWorkspaceIdFromUrl(input: string) {
  const normalized = normalizeGet3wServerUrl(input) ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    const legacyIndex = segments.indexOf("w");
    if (legacyIndex >= 0 && segments[legacyIndex + 1]) {
      return decodeURIComponent(segments[legacyIndex + 1]);
    }
    const workspaceIndex = segments.indexOf("workspace");
    if (workspaceIndex >= 0 && segments[workspaceIndex + 1]) {
      return decodeURIComponent(segments[workspaceIndex + 1]);
    }
    return null;
  } catch {
    const match = normalized.match(/\/(?:w|workspace)\/([^/?#]+)/);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

export function buildGet3wWorkspaceBaseUrl(hostUrl: string, workspaceId?: string | null) {
  const normalized = normalizeGet3wServerUrl(hostUrl) ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    const workspaceIndex = segments.indexOf("workspace");
    const legacyIndex = segments.indexOf("w");
    const mountIndex = workspaceIndex >= 0 ? workspaceIndex : legacyIndex;
    if (mountIndex >= 0 && segments[mountIndex + 1]) {
      const prefix = segments.slice(0, mountIndex).join("/");
      url.pathname = `${prefix ? `/${prefix}` : ""}/workspace/${encodeURIComponent(
        decodeURIComponent(segments[mountIndex + 1]),
      )}`;
      return url.toString().replace(/\/+$/, "");
    }

    const id = (workspaceId ?? "").trim();
    if (!id) return url.toString().replace(/\/+$/, "");

    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/workspace/${encodeURIComponent(id)}`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    const id = (workspaceId ?? "").trim();
    if (!id) return normalized;
    return `${normalized.replace(/\/+$/, "")}/workspace/${encodeURIComponent(id)}`;
  }
}

export type Get3wConnectInvite = {
  url: string;
  token?: string;
  startup?: "server";
  autoConnect?: boolean;
};

export function readGet3wServerSettings(): Get3wServerSettings {
  if (typeof window === "undefined") return {};
  try {
    const urlOverride = normalizeGet3wServerUrl(
      window.localStorage.getItem(STORAGE_URL_OVERRIDE) ?? "",
    );
    const portRaw = window.localStorage.getItem(STORAGE_PORT_OVERRIDE) ?? "";
    const portOverride = portRaw ? Number(portRaw) : undefined;
    const token = window.localStorage.getItem(STORAGE_TOKEN) ?? undefined;
    const hostToken = window.localStorage.getItem(STORAGE_HOST_AUTH_KEY) ?? undefined;
    return {
      urlOverride: urlOverride ?? undefined,
      portOverride: Number.isNaN(portOverride) ? undefined : portOverride,
      token: token?.trim() || undefined,
      hostToken: hostToken?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

export function writeGet3wServerSettings(next: Get3wServerSettings): Get3wServerSettings {
  if (typeof window === "undefined") return next;
  try {
    const urlOverride = normalizeGet3wServerUrl(next.urlOverride ?? "");
    const portOverride = typeof next.portOverride === "number" ? next.portOverride : undefined;
    const token = next.token?.trim() || undefined;
    const hostToken = next.hostToken?.trim() || undefined;

    if (urlOverride) {
      window.localStorage.setItem(STORAGE_URL_OVERRIDE, urlOverride);
    } else {
      window.localStorage.removeItem(STORAGE_URL_OVERRIDE);
    }

    if (typeof portOverride === "number" && !Number.isNaN(portOverride)) {
      window.localStorage.setItem(STORAGE_PORT_OVERRIDE, String(portOverride));
    } else {
      window.localStorage.removeItem(STORAGE_PORT_OVERRIDE);
    }

    if (token) {
      window.localStorage.setItem(STORAGE_TOKEN, token);
    } else {
      window.localStorage.removeItem(STORAGE_TOKEN);
    }

    if (hostToken) {
      window.localStorage.setItem(STORAGE_HOST_AUTH_KEY, hostToken);
    } else {
      window.localStorage.removeItem(STORAGE_HOST_AUTH_KEY);
    }

    window.localStorage.removeItem(LEGACY_STORAGE_REMOTE_ACCESS);

    return readGet3wServerSettings();
  } catch {
    return next;
  }
}

function readForceEnvSettingsFlag(): boolean {
  const raw =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_GET3W_FORCE_ENV_SETTINGS === "string"
      ? import.meta.env.VITE_GET3W_FORCE_ENV_SETTINGS.trim()
      : "";
  return /^(1|true|yes|on)$/i.test(raw);
}

export function hydrateGet3wServerSettingsFromEnv() {
  if (typeof window === "undefined") return;
  if (isGet3wGatewayRuntime()) return;

  const envUrl = typeof import.meta.env?.VITE_GET3W_URL === "string"
    ? import.meta.env.VITE_GET3W_URL.trim()
    : "";
  const envPort = typeof import.meta.env?.VITE_GET3W_PORT === "string"
    ? import.meta.env.VITE_GET3W_PORT.trim()
    : "";
  const envToken = typeof import.meta.env?.VITE_GET3W_TOKEN === "string"
    ? import.meta.env.VITE_GET3W_TOKEN.trim()
    : "";
  const envHostToken = typeof import.meta.env?.VITE_GET3W_HOST_TOKEN === "string"
    ? import.meta.env.VITE_GET3W_HOST_TOKEN.trim()
    : "";
  const bootstrapToken = typeof window.__GET3W_BOOTSTRAP__?.token === "string"
    ? window.__GET3W_BOOTSTRAP__.token.trim()
    : "";
  const forceEnvSettings = readForceEnvSettingsFlag();

  if (!envUrl && !envPort && !envToken && !envHostToken && !bootstrapToken) return;

  try {
    const current = readGet3wServerSettings();
    const next: Get3wServerSettings = { ...current };
    let changed = false;

    if (envUrl && (forceEnvSettings || !current.urlOverride)) {
      const normalized = normalizeGet3wServerUrl(
        envUrl === "/api/get3w" ? new URL(envUrl, window.location.origin).href : envUrl,
      );
      if (normalized && normalized !== current.urlOverride) {
        next.urlOverride = normalized;
        changed = true;
      }
    }

    if (envPort && (forceEnvSettings || !current.portOverride)) {
      const parsed = Number(envPort);
      if (Number.isFinite(parsed) && parsed > 0 && parsed !== current.portOverride) {
        next.portOverride = parsed;
        changed = true;
      }
    }

    if (bootstrapToken && current.token !== bootstrapToken) {
      next.token = bootstrapToken;
      changed = true;
    } else if (envToken && (forceEnvSettings || !current.token) && current.token !== envToken) {
      next.token = envToken;
      changed = true;
    }

    if (envHostToken && (forceEnvSettings || !current.hostToken) && current.hostToken !== envHostToken) {
      next.hostToken = envHostToken;
      changed = true;
    } else if (forceEnvSettings && !envHostToken && current.hostToken) {
      // Headless web does not inject the host token into the Vite bundle.
      // Drop a leftover value from an earlier desktop/dev session so it
      // cannot keep authorizing host-token routes from the browser.
      next.hostToken = undefined;
      changed = true;
    }

    if (changed) {
      writeGet3wServerSettings(next);
    }
  } catch {
    // ignore
  }
}

export function clearGet3wServerSettings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_URL_OVERRIDE);
    window.localStorage.removeItem(STORAGE_PORT_OVERRIDE);
    window.localStorage.removeItem(STORAGE_TOKEN);
    window.localStorage.removeItem(STORAGE_HOST_AUTH_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_REMOTE_ACCESS);
  } catch {
    // ignore
  }
}

export class Get3wServerError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildHeaders(
  token?: string,
  hostToken?: string,
  extra?: Record<string, string>,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hostToken) {
    headers["X-Get3W-Host-Token"] = hostToken;
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  return headers;
}

function buildAuthHeaders(token?: string, hostToken?: string, extra?: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hostToken) {
    headers["X-Get3W-Host-Token"] = hostToken;
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  return headers;
}

// Use Tauri's fetch when running in the desktop app to avoid CORS issues.
// Stream URLs (SSE) bypass the plugin because its `fetch_read_body` IPC call
// blocks until the body closes — that freezes the webview for infinite bodies.
const GET3W_STREAM_URL_RE = /\/events(\b|\?)|\/event-stream\b|\/stream\b/;

function isStreamUrl(url: string): boolean {
  return GET3W_STREAM_URL_RE.test(url);
}

const resolveFetch = (url?: string) => {
  if (!isDesktopRuntime()) return globalThis.fetch;
  if (url && isStreamUrl(url)) {
    return typeof window !== "undefined" ? window.fetch.bind(window) : globalThis.fetch;
  }
  return desktopFetch;
};

const DEFAULT_GET3W_SERVER_TIMEOUT_MS = 10_000;
const ENGINE_RELOAD_TIMEOUT_MS = 60_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchImpl(url, init);
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller?.signal;
  const initWithSignal = signal
    ? { ...init, signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal }
    : init;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        // ignore
      }
      reject(new Error("Request timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchImpl(url, initWithSignal), timeoutPromise]);
  } catch (error) {
    const name = (error && typeof error === "object" && "name" in error ? (error as any).name : "") as string;
    if (name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal; desktopTransport?: "main" } = {},
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const fetchImpl = options.desktopTransport === "main" && isDesktopRuntime() ? desktopFetchViaMain : resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "GET",
      signal: options.signal,
      headers: buildHeaders(options.token, options.hostToken),
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    options.timeoutMs ?? DEFAULT_GET3W_SERVER_TIMEOUT_MS,
  );

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const code = typeof json?.code === "string" ? json.code : "request_failed";
    const message = typeof json?.message === "string" ? json.message : response.statusText;
    throw new Get3wServerError(response.status, code, message, json?.details);
  }

  return json as T;
}

async function requestAgentContextDiagnosticsJson(
  baseUrl: string,
  path: string,
  options: {
    token?: string;
    hostToken?: string;
    body: AgentContextDiagnosticsRequest;
    timeoutMs: number;
  },
): Promise<unknown> {
  const url = `${baseUrl}${path}`;
  const result = await requestAgentContextDiagnosticsPayload({
    url,
    init: {
      method: "POST",
      headers: buildHeaders(options.token, options.hostToken),
      body: JSON.stringify(options.body),
    },
    timeoutMs: options.timeoutMs,
    fetchImpl: (input, init, deadlineAtMs) => isDesktopRuntime()
      ? desktopFetchAgentContextDiagnostics(input, init, deadlineAtMs)
      : globalThis.fetch(input, init),
  });

  if (!result.response.ok) {
    const payload = result.payload;
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
      ? payload.code
      : "request_failed";
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : result.response.statusText;
    const details = payload && typeof payload === "object" && "details" in payload
      ? payload.details
      : undefined;
    throw new Get3wServerError(result.response.status, code, message, details);
  }

  return result.payload;
}

async function requestMultipartRaw(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; body?: FormData; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; text: string }>{
  const url = `${baseUrl}${path}`;
  const fetchImpl = resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "POST",
      headers: buildAuthHeaders(options.token, options.hostToken),
      body: options.body,
    },
    options.timeoutMs ?? DEFAULT_GET3W_SERVER_TIMEOUT_MS,
  );
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

async function requestBinary(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; timeoutMs?: number } = {},
): Promise<{ data: ArrayBuffer; contentType: string | null; filename: string | null }>{
  const url = `${baseUrl}${path}`;
  const fetchImpl = resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "GET",
      headers: buildAuthHeaders(options.token, options.hostToken),
    },
    options.timeoutMs ?? DEFAULT_GET3W_SERVER_TIMEOUT_MS,
  );

  if (!response.ok) {
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const code = typeof json?.code === "string" ? json.code : "request_failed";
    const message = typeof json?.message === "string" ? json.message : response.statusText;
    throw new Get3wServerError(response.status, code, message, json?.details);
  }

  const contentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filenameRaw = filenameMatch?.[1] ?? filenameMatch?.[2] ?? null;
  const filename = filenameRaw ? decodeURIComponent(filenameRaw) : null;
  const data = await response.arrayBuffer();
  return { data, contentType, filename };
}

export type WorkspaceRunMode = "default" | "approve" | "run-everything";
export type WorkspaceRunModeResponse = {
  mode: WorkspaceRunMode | null;
  catchAll: "ask" | "allow" | "deny" | null;
  path: string;
  supported: boolean;
  reason?: string;
  refreshPending: boolean;
};
export type WorkspaceRunModeUpdate = WorkspaceRunModeResponse & {
  changed: boolean;
  refresh: "reloaded" | "deferred" | "skipped";
};

export function createGet3wServerClient(options: { baseUrl: string; token?: string; hostToken?: string }) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const token = options.token;
  const hostToken = options.hostToken;

  const timeouts = {
    health: 3_000,
    capabilities: 6_000,
    listWorkspaces: 8_000,
    activateWorkspace: 10_000,
    deleteWorkspace: 10_000,
    sessionRead: 12_000,
    status: 6_000,
    diagnostics: AGENT_CONTEXT_DIAGNOSTICS_REQUEST_TIMEOUT_MS,
    config: 10_000,
    cloudMcpHealth: 12_000,
    cloudMcpProbeHealth: 30_000,
    cloudMcpReconcile: 60_000,
    workspaceExport: 30_000,
    binary: 60_000,
  };

  let legacyFileBrowser = false;
  async function browseLegacyWorkspaceFiles(workspaceId: string, options: { directory?: string; query?: string; after?: string; showSystem?: boolean }): Promise<Get3wWorkspaceCatalog> {
    const created = await requestJson<{ session: { id: string } }>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/files/sessions`, { token, hostToken, method: "POST", body: { write: false } });
    const sessionPath = `/files/sessions/${encodeURIComponent(created.session.id)}`;
    const all: Get3wWorkspaceCatalogEntry[] = [];
    let after: string | undefined;
    let incomplete = false;
    try {
      do {
        const params = new URLSearchParams({ includeDirs: "true", limit: "10000", excludeHeavyDirectories: String(!options.showSystem) });
        if (after) params.set("after", after);
        const page = await requestJson<Get3wWorkspaceCatalog>(baseUrl, `${sessionPath}/catalog/snapshot?${params}`, { token, hostToken });
        all.push(...page.items);
        incomplete ||= Boolean(page.incomplete);
        if (!page.truncated) break;
        if (!page.nextAfter || page.nextAfter === after) throw new Error("File listing could not advance. Refresh to try again.");
        after = page.nextAfter;
      } while (true);
      const directory = options.directory ?? "";
      const query = options.query?.trim().toLocaleLowerCase();
      const items = all.filter(entry => {
        if (query) return entry.path.toLocaleLowerCase().includes(query);
        const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
        return parent === directory;
      });
      return { items, total: items.length, truncated: false, incomplete };
    } finally {
      await requestJson<{ ok: boolean }>(baseUrl, sessionPath, { token, hostToken, method: "DELETE" }).catch(() => undefined);
    }
  }

  return {
    baseUrl,
    token,
    health: () =>
      requestJson<{ ok: boolean; version: string; uptimeMs: number }>(baseUrl, "/health", { token, hostToken, timeoutMs: timeouts.health }),
    runtimeVersions: () =>
      requestJson<Get3wRuntimeSnapshot>(baseUrl, "/runtime/versions", { token, hostToken, timeoutMs: timeouts.status }),
    status: () => requestJson<Get3wServerDiagnostics>(baseUrl, "/status", { token, hostToken, timeoutMs: timeouts.status }),
    capabilities: () => requestJson<Get3wServerCapabilities>(baseUrl, "/capabilities", { token, hostToken, timeoutMs: timeouts.capabilities }),
    getEngineV2PreviewStatus: async (): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview/status", {
        token,
        timeoutMs: timeouts.config,
      })),
    /** The host owns idle checks, bounded retries, migration and forced-only revert. */
    setEngineV2ForcePolicy: async (policy: { upgrade: boolean }): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview/force", {
        token, hostToken, method: "POST", body: policy, timeoutMs: timeouts.config,
      })),
    getWorkspaceDefaultModel: async (workspaceId: string): Promise<WorkspaceDefaultModelState> =>
      parseWorkspaceDefaultModelState(await requestJson<unknown>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/default-model`,
        { token, hostToken, timeoutMs: timeouts.config },
      )),
    setWorkspaceDefaultModel: async (workspaceId: string, model: WorkspaceDefaultModelRef | null): Promise<WorkspaceDefaultModelState> =>
      parseWorkspaceDefaultModelState(await requestJson<unknown>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/default-model`,
        { token, hostToken, method: "PUT", body: { model }, timeoutMs: timeouts.config },
      )),
    switchOpencodeEngine: async (engine: "v1" | "v2"): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview", {
        token, method: "PUT", body: { enabled: engine === "v2", chatRouting: engine === "v2" }, timeoutMs: timeouts.config,
      })),
    getEngineActivity: async (): Promise<EngineActivity> =>
      parseEngineActivity(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview/activity", {
        token,
        timeoutMs: timeouts.config,
      })),
    /** Rejects with `engine_migration_active_sessions` (409) while v1 tasks run, unless allowed. */
    migrateOpencodeHistory: async (options: { allowActiveSessions?: boolean } = {}): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview/migrate", {
        token, hostToken, method: "POST", timeoutMs: timeouts.config,
        body: { confirm: true, ...(options.allowActiveSessions ? { allowActiveSessions: true } : {}) },
      })),
    setEngineV2PreviewEnabled: async (enabled: boolean): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview", {
        token,
        method: "PUT",
        body: { enabled },
        timeoutMs: timeouts.config,
      })),
    setEngineV2PreviewChatRouting: async (chatRouting: boolean): Promise<EngineV2PreviewStatus> =>
      parseEngineV2PreviewStatus(await requestJson<unknown>(baseUrl, "/experimental/engine-v2-preview", {
        token,
        method: "PUT",
        body: { chatRouting },
        timeoutMs: timeouts.config,
      })),
    callExtensionAction: (payload: Get3wExtensionActionCall) =>
      requestJson<Get3wExtensionActionResult>(baseUrl, "/experimental/extensions/call", {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.binary,
      }),
    listWorkspaces: () => requestJson<Get3wWorkspaceList>(baseUrl, "/workspaces", { token, hostToken, timeoutMs: timeouts.listWorkspaces }),
    createLocalWorkspace: (payload: { folderPath: string; name: string; preset: string }) =>
      requestJson<WorkspaceList>(baseUrl, "/workspaces/local", {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.activateWorkspace,
      }),
    updateWorkspaceDisplayName: (workspaceId: string, displayName: string | null) =>
      requestJson<WorkspaceList>(baseUrl, `/workspaces/${encodeURIComponent(workspaceId)}/display-name`, {
        token,
        hostToken,
        method: "PATCH",
        body: { displayName },
        timeoutMs: timeouts.activateWorkspace,
      }),
    activateWorkspace: (workspaceId: string, options?: { persist?: boolean }) => {
      const query = options?.persist ? "?persist=true" : "";
      return requestJson<{ activeId: string; workspace: Get3wWorkspaceInfo; persisted: boolean }>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}/activate${query}`,
        { token, hostToken, method: "POST", timeoutMs: timeouts.activateWorkspace },
      );
    },
    deleteWorkspace: (workspaceId: string) =>
      requestJson<{ ok: boolean; deleted: boolean; persisted: boolean; activeId: string | null; items: Get3wWorkspaceInfo[]; workspaces?: WorkspaceInfo[] }>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}`,
        { token, hostToken, method: "DELETE", timeoutMs: timeouts.deleteWorkspace },
      ),
    getSessionGroups: (workspaceId: string) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number | null }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups`,
        { token, hostToken, timeoutMs: timeouts.sessionRead },
      ),
    putSessionGroups: (workspaceId: string, state: Get3wSessionGroupState) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups`,
        { token, hostToken, method: "PUT", body: { state }, timeoutMs: timeouts.config },
      ),
    createSessionGroup: (workspaceId: string, input: { id?: string; label: string }) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups`,
        { token, hostToken, method: "POST", body: input, timeoutMs: timeouts.config },
      ),
    reorderSessionGroups: (workspaceId: string, groupIds: string[]) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups/reorder`,
        { token, hostToken, method: "PATCH", body: { groupIds }, timeoutMs: timeouts.config },
      ),
    assignSessionGroup: (workspaceId: string, sessionId: string, groupId: string | null) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups/assignments/${encodeURIComponent(sessionId)}`,
        { token, hostToken, method: "PATCH", body: { groupId }, timeoutMs: timeouts.config },
      ),
    renameSessionGroup: (workspaceId: string, groupId: string, label: string) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups/${encodeURIComponent(groupId)}`,
        { token, hostToken, method: "PATCH", body: { label }, timeoutMs: timeouts.config },
      ),
    removeSessionGroup: (workspaceId: string, groupId: string, destinationGroupId: string | null = null) =>
      requestJson<{ state: Get3wSessionGroupState; updatedAt: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups/${encodeURIComponent(groupId)}${destinationGroupId ? `?destinationGroupId=${encodeURIComponent(destinationGroupId)}` : ""}`,
        { token, hostToken, method: "DELETE", timeoutMs: timeouts.config },
      ),
    listSessionGroupEvents: (workspaceId: string, options?: { since?: number }) => {
      const query = typeof options?.since === "number" ? `?since=${options.since}` : "";
      return requestJson<{ items: Get3wSessionGroupEvent[]; cursor?: number }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/session-groups/events${query}`,
        { token, hostToken },
      );
    },
    exportWorkspace: (
      workspaceId: string,
      options?: { sensitiveMode?: Get3wWorkspaceExportSensitiveMode },
    ) => {
      const query = new URLSearchParams();
      if (options?.sensitiveMode) {
        query.set("sensitive", options.sensitiveMode);
      }
      const suffix = query.size ? `?${query.toString()}` : "";
      return requestJson<Get3wWorkspaceExport>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/export${suffix}`, {
        token,
        hostToken,
        timeoutMs: timeouts.workspaceExport,
      });
    },
    getConfig: (workspaceId: string) =>
      requestJson<{ opencode: Record<string, unknown>; get3w: Record<string, unknown>; updatedAt?: number | null }>(
        baseUrl,
        `/workspace/${workspaceId}/config`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    getWorkspaceRunMode: (workspaceId: string) =>
      requestJson<WorkspaceRunModeResponse>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/permissions/mode`, {
        token, hostToken, timeoutMs: timeouts.config,
      }),
    setWorkspaceRunMode: (workspaceId: string, mode: WorkspaceRunMode) =>
      requestJson<WorkspaceRunModeUpdate>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/permissions/mode`, {
        token, hostToken, method: "PUT", body: { mode }, timeoutMs: 60_000,
      }),
    getEffectivePermissions: (workspaceId: string) =>
      requestJson<Get3wEffectivePermissionsResponse>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/permissions/effective`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    listAuthorizedFolders: (workspaceId: string) =>
      requestJson<Get3wAuthorizedFoldersResponse>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/authorized-folders`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    setAuthorizedFolders: (workspaceId: string, folders: string[]) =>
      requestJson<Get3wAuthorizedFoldersUpdateResponse>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/authorized-folders`,
        {
          token,
          hostToken,
          method: "PUT",
          body: { folders },
          timeoutMs: timeouts.config,
        },
      ),
    getRuntimeDisabledProviders: (workspaceId: string) =>
      requestJson<Get3wRuntimeDisabledProvidersResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/runtime-config/disabled-providers`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    setRuntimeDisabledProviders: (workspaceId: string, providers: string[]) =>
      requestJson<Get3wRuntimeDisabledProvidersResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/runtime-config/disabled-providers`,
        {
          token,
          hostToken,
          method: "POST",
          body: { providers },
          timeoutMs: timeouts.config,
        },
      ),
    getRuntimeConfigStatus: (workspaceId: string) =>
      requestJson<Get3wRuntimeConfigStatus>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/runtime-config`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    /** `mergeProviderModels`: provider IDs whose saved models are kept, with the patch's models added. */
    patchConfig: (workspaceId: string, payload: { opencode?: Record<string, unknown>; get3w?: Record<string, unknown>; mergeProviderModels?: string[] }) =>
      requestJson<{ updatedAt?: number | null }>(baseUrl, `/workspace/${workspaceId}/config`, {
        token,
        hostToken,
        method: "PATCH",
        body: payload,
      }),
    readOpencodeConfigFile: (workspaceId: string, scope: "project" | "global" = "project") => {
      const query = `?scope=${scope}`;
      return requestJson<OpencodeConfigFile>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/opencode-config${query}`, {
        token,
        hostToken,
      });
    },
    writeOpencodeConfigFile: (workspaceId: string, scope: "project" | "global", content: string) =>
      requestJson<ExecResult>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/opencode-config`, {
        token,
        hostToken,
        method: "POST",
        body: { scope, content },
      }),
    listReloadEvents: (workspaceId: string, options?: { since?: number }) => {
      const query = typeof options?.since === "number" ? `?since=${options.since}` : "";
      return requestJson<{ items: Get3wReloadEvent[]; cursor?: number }>(
        baseUrl,
        `/workspace/${workspaceId}/events${query}`,
        { token, hostToken },
      );
    },
    listUiControlPending: (options?: { wait?: boolean; signal?: AbortSignal }) =>
      requestJson<{ items: Get3wUiControlRequest[] }>(
        baseUrl,
        `/experimental/ui-control/pending${options?.wait ? "?wait=1" : ""}`,
        { token, hostToken, timeoutMs: 15_000, signal: options?.signal },
      ),
    replyUiControl: (id: string, result: unknown) =>
      requestJson<{ ok: boolean }>(baseUrl, `/experimental/ui-control/${encodeURIComponent(id)}/reply`, {
        token,
        hostToken,
        method: "POST",
        body: { result },
      }),
    reloadEngine: (workspaceId: string) =>
      requestJson<{ ok: boolean; reloadedAt?: number }>(baseUrl, `/workspace/${workspaceId}/engine/reload`, {
        token,
        hostToken,
        method: "POST",
        timeoutMs: ENGINE_RELOAD_TIMEOUT_MS,
      }),
    listPlugins: (workspaceId: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<{ items: Get3wPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins${query}`,
        { token, hostToken },
      );
    },
    addPlugin: (workspaceId: string, spec: string) =>
      requestJson<{ items: Get3wPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins`,
        { token, hostToken, method: "POST", body: { spec } },
      ),
    removePlugin: (workspaceId: string, name: string) =>
      requestJson<{ items: Get3wPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins/${encodeURIComponent(name)}`,
        { token, hostToken, method: "DELETE" },
      ),
    listSkills: (workspaceId: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<{ items: Get3wSkillItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/skills${query}`,
        { token, hostToken },
      );
    },
    getSkill: (workspaceId: string, name: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<Get3wSkillContent>(
        baseUrl,
        `/workspace/${workspaceId}/skills/${encodeURIComponent(name)}${query}`,
        { token, hostToken },
      );
    },
    upsertSkill: (workspaceId: string, payload: { name: string; content: string; description?: string }) =>
      requestJson<Get3wSkillItem>(baseUrl, `/workspace/${workspaceId}/skills`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    deleteSkill: (workspaceId: string, name: string) =>
      requestJson<{ path: string }>(
        baseUrl,
        `/workspace/${workspaceId}/skills/${encodeURIComponent(name)}`,
        {
          token,
          hostToken,
          method: "DELETE",
        },
      ),
    listMcp: (workspaceId: string) =>
      requestJson<{
        items: Get3wMcpItem[];
        engineSync?: Get3wMcpEngineSync | null;
        managedOAuthState?: Get3wManagedOAuthState | null;
      }>(
        baseUrl,
        `/workspace/${workspaceId}/mcp`,
        { token, hostToken },
      ),
    getMcpStatus: (workspaceId: string) =>
      requestJson<McpStatusMap>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/opencode/mcp`, { token, hostToken }),
    listMcpApps: (workspaceId: string) =>
      requestJson<{ servers: Get3wMcpAppCatalogServer[] }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/mcp-apps/list`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),
    resolveMcpApp: (
      workspaceId: string,
      projectedToolName: string,
      launch?: Get3wMcpAppLaunchReference,
      context?: { sessionId: string | null; readOnly: boolean; engine?: "v1" | "v2" },
    ) =>
      requestJson<{ app: Get3wMcpAppResource | null }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/mcp-apps/resolve`,
        {
          token,
          hostToken,
          method: "POST",
          body: { projectedToolName, ...(launch ? { launch } : {}), ...(context ? { context: { sessionId: context.sessionId, readOnly: context.readOnly, engine: context.engine } } : {}) },
          timeoutMs: timeouts.binary,
        },
      ),
    mcpAppSandbox: (app: Get3wMcpAppResource, hostOrigin: string): Get3wMcpAppSandbox => {
      const messageOrigin = normalizeMcpAppHostOrigin(hostOrigin);
      const url = new URL(`${baseUrl}/mcp-apps/sandbox.html`);
      if (url.origin === hostOrigin && url.hostname === "localhost") url.hostname = "127.0.0.1";
      else if (url.origin === hostOrigin && url.hostname === "127.0.0.1") url.hostname = "localhost";
      // A server with this exact page lets the browser keep it, so later Apps
      // start without fetching it again. Any other server ignores the version.
      const version = String(import.meta.env.VITE_GET3W_MCP_APP_SANDBOX_VERSION ?? "").trim();
      if (version) url.searchParams.set("v", version);
      url.searchParams.set("csp", JSON.stringify(app.csp));
      url.searchParams.set("hostOrigin", messageOrigin);
      // Hosted Web serves the trusted proxy on its own origin. Keep that frame
      // opaque rather than granting it access to the host's DOM and storage.
      const sameOrigin = url.origin === messageOrigin;
      return {
        url: url.toString(),
        expectedOrigin: sameOrigin ? "null" : url.origin,
        sandbox: sameOrigin ? "allow-scripts" : "allow-scripts allow-same-origin",
      };
    },
    callMcpAppTool: (
      workspaceId: string,
      payload: {
        launchId?: string;
        sessionId?: string | null;
        engine?: "v1" | "v2";
        serverName: string;
        name: string;
        resourceUri: string;
        expectedResourceDigest?: string;
        arguments?: Record<string, unknown>;
        approved?: boolean;
        checkOnly?: boolean;
      },
    ) => requestJson<Get3wMcpAppToolResult>(
      baseUrl,
      `/workspace/${encodeURIComponent(workspaceId)}/mcp-apps/call`,
      {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.binary,
      },
    ),
    releaseMcpApp: (workspaceId: string, launchId: string) => requestJson<{ released: boolean }>(
      baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/mcp-apps/release`,
      { token, hostToken, method: "POST", body: { launchId } },
    ),
    runAgentContextDiagnostics: async (
      workspaceId: string,
      input: AgentContextDiagnosticsRequest,
    ): Promise<AgentContextDiagnosticsReport> => {
      const body = agentContextDiagnosticsRequestSchema.parse(input);
      const payload = await requestAgentContextDiagnosticsJson(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/diagnostics/agent-context`,
        {
          token,
          hostToken,
          body,
          timeoutMs: timeouts.diagnostics,
        },
      );
      return agentContextDiagnosticsReportSchema.parse(payload);
    },
    addMcp: (workspaceId: string, payload: { name: string; config: Record<string, unknown> }) =>
      requestJson<{ items: Get3wMcpItem[] }>(baseUrl, `/workspace/${workspaceId}/mcp`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    addManagedMcp: (
      workspaceId: string,
      payload: {
        name: string;
        url: string;
        oauth?: {
          applicationType?: "native" | "web";
          requestedScopes?: string[];
          authorizationServerIssuer?: string;
          clientId?: string;
          clientSecret?: string;
        };
      },
    ) =>
      requestJson<Get3wManagedMcpStartResult>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/mcp/managed`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    getManagedMcp: (workspaceId: string, name: string) =>
      requestJson<Get3wManagedMcpConnection>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/mcp/${encodeURIComponent(name)}/managed`,
        { token, hostToken },
      ),
    connectManagedMcp: (workspaceId: string, name: string) =>
      requestJson<Get3wManagedMcpStartResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/mcp/${encodeURIComponent(name)}/managed/connect`,
        { token, hostToken, method: "POST" },
      ),
    removeMcp: (workspaceId: string, name: string) =>
      requestJson<{ items: Get3wMcpItem[] }>(baseUrl, `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}`, {
        token,
        hostToken,
        method: "DELETE",
      }),
    setMcpEnabled: (workspaceId: string, name: string, enabled: boolean) =>
      requestJson<{ items: Get3wMcpItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}/enabled`,
        {
          token,
          hostToken,
          method: "POST",
          body: { enabled },
        },
      ),

    logoutMcpAuth: (workspaceId: string, name: string) =>
      requestJson<{ ok: true }>(baseUrl, `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}/auth`, {
        token,
        hostToken,
        method: "DELETE",
      }),

    listCommands: (workspaceId: string, scope: "workspace" | "global" = "workspace") =>
      requestJson<{ items: Get3wCommandItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/commands?scope=${scope}`,
        { token, hostToken },
      ),
    listAudit: (workspaceId: string, limit = 50) =>
      requestJson<{ items: Get3wAuditEntry[] }>(
        baseUrl,
        `/workspace/${workspaceId}/audit?limit=${limit}`,
        { token, hostToken },
      ),
    upsertCommand: (
      workspaceId: string,
      payload: { name: string; description?: string; template: string; agent?: string; model?: string | null; subtask?: boolean },
    ) =>
      requestJson<{ items: Get3wCommandItem[] }>(baseUrl, `/workspace/${workspaceId}/commands`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    deleteCommand: (workspaceId: string, name: string) =>
      requestJson<{ ok: boolean }>(baseUrl, `/workspace/${workspaceId}/commands/${encodeURIComponent(name)}`, {
        token,
        hostToken,
        method: "DELETE",
      }),
    listClaudeCodeSessions: async (workspaceId: string) =>
      claudeImportItemsSchema.parse(
        await requestJson<unknown>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/claude-import/code`, { token, hostToken, timeoutMs: 60_000 }),
      ).items,
    importClaudeCodeSessions: async (workspaceId: string, ids: string[]) =>
      claudeImportResultsSchema.parse(
        await requestJson<unknown>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/claude-import/code`, {
          token,
          hostToken,
          method: "POST",
          body: { ids },
          timeoutMs: 10 * 60_000,
        }),
      ).results,
    readClaudeExport: async (workspaceId: string, file: File, selection?: { importIds: string[] }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", selection ? "import" : "preview");
      if (selection) form.append("ids", JSON.stringify(selection.importIds));
      const result = await requestMultipartRaw(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/claude-import/export`, {
        token,
        hostToken,
        method: "POST",
        body: form,
        timeoutMs: 10 * 60_000,
      });
      let parsed: unknown = null;
      try { parsed = result.text ? JSON.parse(result.text) : null; } catch { parsed = null; }
      if (!result.ok) {
        const error = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(parsed);
        throw new Get3wServerError(
          result.status,
          error.success ? error.data.code ?? "request_failed" : "request_failed",
          error.success && error.data.message ? error.data.message : "This file could not be read.",
        );
      }
      return parsed;
    },
    uploadInbox: async (workspaceId: string, file: File, options?: { path?: string }) => {
      const id = workspaceId.trim();
      if (!id) throw new Error("workspaceId is required");
      if (!file) throw new Error("file is required");
      const uploadPath = `/workspace/${encodeURIComponent(id)}/inbox`;
      const form = new FormData();
      form.append("file", file);
      if (options?.path?.trim()) form.append("path", options.path.trim());
      const result = await requestMultipartRaw(baseUrl, uploadPath, {
        token,
        hostToken,
        method: "POST",
        body: form,
        timeoutMs: timeouts.binary,
      });

      if (!result.ok) {
        let message = result.text.trim();
        try {
          const json = message ? JSON.parse(message) : null;
          if (json && typeof json.message === "string") {
            message = json.message;
          }
        } catch {
          // ignore
        }
        throw new Get3wServerError(
          result.status,
          "request_failed",
          message || "Shared folder upload failed",
        );
      }

      const body = result.text.trim();
      if (body) {
        try {
          const parsed = JSON.parse(body) as Partial<Get3wInboxUploadResult>;
          if (typeof parsed.path === "string" && parsed.path.trim()) {
            return {
              ok: parsed.ok ?? true,
              path: parsed.path.trim(),
              bytes: typeof parsed.bytes === "number" ? parsed.bytes : file.size,
            } satisfies Get3wInboxUploadResult;
          }
        } catch {
          // ignore invalid JSON and fall back
        }
      }

      return {
        ok: true,
        path: options?.path?.trim() || file.name,
        bytes: file.size,
      } satisfies Get3wInboxUploadResult;
    },

    listInbox: (workspaceId: string) =>
      requestJson<Get3wInboxList>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/inbox`, {
        token,
        hostToken,
      }),

    downloadInboxItem: (workspaceId: string, inboxId: string) =>
      requestBinary(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(inboxId)}`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),

    /** `sessionId` also finds files the conversation wrote after moving into a worktree. */
    readWorkspaceFile: (workspaceId: string, path: string, options?: { sessionId?: string; fileScope?: "workspace" | "conversation" }) =>
      requestJson<Get3wWorkspaceFileContent>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/content?path=${encodeURIComponent(path)}${options?.sessionId ? `&session=${encodeURIComponent(options.sessionId)}` : ""}${options?.fileScope ? `&fileScope=${encodeURIComponent(options.fileScope)}` : ""}`,
        { token, hostToken },
      ),

    statWorkspaceFile: (workspaceId: string, path: string) =>
      requestJson<Get3wWorkspaceFileStat>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/stat?path=${encodeURIComponent(path)}`,
        { token, hostToken },
      ),

    browseWorkspaceFiles: async (workspaceId: string, options: { directory?: string; query?: string; after?: string; showSystem?: boolean } = {}) => {
      const params = new URLSearchParams({ limit: "1000" });
      if (options.directory) params.set("directory", options.directory);
      if (options.query) params.set("query", options.query);
      if (options.after) params.set("after", options.after);
      if (options.showSystem) params.set("showSystem", "true");
      if (legacyFileBrowser) return browseLegacyWorkspaceFiles(workspaceId, options);
      try {
        return await requestJson<Get3wWorkspaceCatalog>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/files/browser?${params}`, { token, hostToken });
      } catch (error) {
        // A hot-reloaded renderer may connect to an older embedded service.
        // Only an unregistered route permits fallback; never mask permission or workspace errors.
        if (!(error instanceof Get3wServerError) || error.status !== 404 || error.code !== "not_found") throw error;
        legacyFileBrowser = true;
        return browseLegacyWorkspaceFiles(workspaceId, options);
      }
    },

    operateWorkspaceFile: async (workspaceId: string, operation: { type: "create" | "mkdir" | "rename" | "delete"; path: string; to?: string; recursive?: boolean }) => {
      try {
        return await requestJson<{ ok: boolean }>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/files/browser/ops`, { token, hostToken, method: "POST", body: operation });
      } catch (error) {
        if (error instanceof Get3wServerError && error.status === 404 && error.code === "not_found") throw new Error(t("files.restartService"));
        throw error;
      }
    },

    listWorkspaceFiles: async (workspaceId: string) => {
      const created = await requestJson<{ session: { id: string } }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/sessions`,
        { token, hostToken, method: "POST", body: { write: false } },
      );
      const sessionId = created.session.id;
      try {
        return await requestJson<Get3wWorkspaceCatalog>(
          baseUrl,
          `/files/sessions/${encodeURIComponent(sessionId)}/catalog/snapshot?includeDirs=true&limit=10000&excludeHeavyDirectories=true`,
          { token, hostToken },
        );
      } finally {
        await requestJson<{ ok: boolean }>(baseUrl, `/files/sessions/${encodeURIComponent(sessionId)}`, {
          token,
          hostToken,
          method: "DELETE",
        }).catch(() => undefined);
      }
    },

    writeWorkspaceFile: (
      workspaceId: string,
      payload: { path: string; content: string; baseUpdatedAt?: number | null; force?: boolean; sessionId?: string; fileScope?: "workspace" | "conversation" },
    ) =>
      requestJson<Get3wWorkspaceFileWriteResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/content`,
        {
          token,
          hostToken,
          method: "POST",
          body: payload,
        },
      ),

    deleteWorkspaceFiles: async (
      workspaceId: string,
      files: Array<{ path: string; recursive?: boolean }>,
    ): Promise<Get3wWorkspaceFileDeleteResult[]> => {
      if (files.length === 0) return [];
      const created = await requestJson<{ session: { id: string } }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/sessions`,
        { token, hostToken, method: "POST", body: { write: true } },
      );
      const sessionId = created.session.id;
      try {
        const result = await requestJson<{ items: Array<{ ok?: boolean; path?: string; code?: string }> }>(
          baseUrl,
          `/files/sessions/${encodeURIComponent(sessionId)}/ops`,
          {
            token,
            hostToken,
            method: "POST",
            body: {
              operations: files.map((file) => ({
                type: "delete",
                path: file.path,
                recursive: file.recursive === true,
              })),
            },
          },
        );
        return result.items.map((item, index) => ({
          ok: item.ok === true,
          path: typeof item.path === "string" ? item.path : files[index]?.path ?? "",
          ...(typeof item.code === "string" ? { code: item.code } : {}),
        }));
      } finally {
        await requestJson<{ ok: boolean }>(baseUrl, `/files/sessions/${encodeURIComponent(sessionId)}`, {
          token,
          hostToken,
          method: "DELETE",
        }).catch(() => undefined);
      }
    },

    writeWorkspaceBinaryFile: (
      workspaceId: string,
      payload: { path: string; data: ArrayBuffer; baseUpdatedAt?: number | null; force?: boolean; sessionId?: string; fileScope?: "workspace" | "conversation" },
    ) =>
      requestJson<Get3wWorkspaceFileWriteResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/raw`,
        {
          token,
          hostToken,
          method: "POST",
          body: {
            path: payload.path,
            dataBase64: arrayBufferToBase64(payload.data),
            baseUpdatedAt: payload.baseUpdatedAt,
            force: payload.force,
            sessionId: payload.sessionId,
            fileScope: payload.fileScope,
          },
        },
      ),

    /** `sessionId` also finds files the conversation wrote after moving into a worktree. */
    downloadWorkspaceFile: (workspaceId: string, path: string, options?: { sessionId?: string; fileScope?: "workspace" | "conversation" }) =>
      requestBinary(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/raw?path=${encodeURIComponent(path)}${options?.sessionId ? `&session=${encodeURIComponent(options.sessionId)}` : ""}${options?.fileScope ? `&fileScope=${encodeURIComponent(options.fileScope)}` : ""}`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),

    resolveArtifacts: (
      workspaceId: string,
      targets: Array<{
        kind: "file" | "url";
        value: string;
        name?: string;
        preview?: string;
        confidence?: number;
        reason?: string;
        fileScope?: "workspace" | "conversation";
      }>,
      /** `search` also finds a file by name anywhere in the workspace when its path misses. */
      options?: { sessionId?: string; search?: boolean },
    ) =>
      requestJson<{ items: Get3wResolvedArtifactTarget[] }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/artifacts/resolve`,
        {
          token,
          hostToken,
          method: "POST",
          body: { targets, sessionId: options?.sessionId, ...(options?.search ? { search: true } : {}) },
        },
      ),

    // User-level env vars (host-auth only — desktop shell is the sole caller).
    // See apps/server/src/env-file.ts and apps/app/pr/environment-variables.md.
    listUserEnvKeys: (options?: { desktopTransport?: "main" }) =>
      requestJson<{ keys: string[] }>(
        baseUrl,
        "/env/keys",
        { token, hostToken, timeoutMs: timeouts.config, desktopTransport: options?.desktopTransport },
      ),

    getUserEnvStatus: (runtimeKey?: string | null) => {
      const params = new URLSearchParams();
      if (runtimeKey?.trim()) params.set("runtimeKey", runtimeKey.trim());
      const query = params.size ? `?${params.toString()}` : "";
      return requestJson<{ runtimeKey: string; pendingChanges: boolean }>(
        baseUrl,
        `/env/status${query}`,
        { token, hostToken, timeoutMs: timeouts.config },
      );
    },

    setUserEnvPendingChanges: (pendingChanges: boolean, runtimeKey?: string | null) =>
      requestJson<{ runtimeKey: string; pendingChanges: boolean }>(baseUrl, "/env/status", {
        token,
        hostToken,
        method: "PUT",
        body: { pendingChanges, runtimeKey: runtimeKey?.trim() || undefined },
        timeoutMs: timeouts.config,
      }),

    listUserEnv: () =>
      requestJson<{ items: Get3wUserEnvItem[] }>(
        baseUrl,
        "/env?includeValues=false",
        { token, hostToken, timeoutMs: timeouts.config },
      ),

    getUserEnv: (key: string) =>
      requestJson<{ item: Get3wUserEnvItem & { value: string } }>(
        baseUrl,
        `/env/${encodeURIComponent(key)}`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),

    upsertUserEnv: (entries: Array<{ key: string; value: string }>) =>
      requestJson<{ ok: true; count: number }>(baseUrl, "/env", {
        token,
        hostToken,
        method: "PUT",
        body: { entries },
        timeoutMs: timeouts.config,
      }),

    deleteUserEnv: (key: string) =>
      requestJson<{ ok: true }>(baseUrl, `/env/${encodeURIComponent(key)}`, {
        token,
        hostToken,
        method: "DELETE",
        timeoutMs: timeouts.config,
      }),

  };
}

export type Get3wServerClient = ReturnType<typeof createGet3wServerClient>;

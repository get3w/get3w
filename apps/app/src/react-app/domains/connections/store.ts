import { useSyncExternalStore } from "react";

import { desktopRestrictionNotice, type DesktopAppRestrictionChecker } from "../../../app/cloud/desktop-app-restrictions";

import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";

import { t } from "../../../i18n";
import {
  getMcpServerName,
  isBuiltInGet3WExtension,
  MCP_QUICK_CONNECT,
  type McpDirectoryInfo,
} from "../../../app/constants";
import { extensionResource } from "../../../app/extensions";
import { createClient, unwrap } from "../../../app/lib/opencode";
import { finishPerf, perfNow, recordPerfLog } from "../../../app/lib/perf-log";
import {
  assertDesktopWebUrl,
  openDesktopUrl,
  readOpencodeConfig,
  writeOpencodeConfig,
  type OpencodeConfigFile,
} from "../../../app/lib/desktop";
import { toSessionTransportDirectory } from "../../../app/lib/session-scope";
import {
  normalizeMcpServerCommand,
  normalizeMcpSlug,
  parseMcpServersFromContent,
  removeMcpFromConfig,
  validateMcpServerName,
} from "../../../app/mcp";
import {
  buildGet3wWorkspaceBaseUrl,
  type Get3wServerClient,
} from "../../../app/lib/get3w-server";
import type {
  Client,
  McpServerEntry,
  McpStatusMap,
  ReloadReason,
  ReloadTrigger,
} from "../../../app/types";
import { isDesktopRuntime, normalizeDirectoryPath, safeStringify } from "../../../app/utils";
import { conflictsWithGet3wConnect } from "./mcp-connection-boundary";

import type { Get3wServerStore } from "./get3w-server-store";
import { attemptSilentMcpReauth } from "./mcp-silent-reauth";
import {
  createMcpStatusSynchronizer,
  resolveObservedMcpStatus,
  type McpStatusRefreshToken,
} from "./mcp-status-synchronization";
type SetStateAction<T> = T | ((current: T) => T);

const LOCAL_GET3W_SERVER_RECOVERY_TIMEOUT_MS = 30_000;

async function withLocalGet3wServerRecoveryTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(t("mcp.connect_failed"))), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type ConnectionsStoreSnapshot = {
  mcpServers: McpServerEntry[];
  mcpStatus: string | null;
  mcpLastUpdatedAt: number | null;
  mcpStatuses: McpStatusMap;
  mcpConnectingName: string | null;
  selectedMcp: string | null;
  mcpAuthModalOpen: boolean;
  mcpAuthEntry: McpDirectoryInfo | null;
  mcpAuthNeedsReload: boolean;
  /** False when the server reports managed OAuth secure storage is unavailable. */
  managedOAuthAvailable: boolean;
};

type MutableState = ConnectionsStoreSnapshot;

export type ConnectionsStore = ReturnType<typeof createConnectionsStore>;

export type McpConnectResult =
  | { ok: true }
  | { ok: false; error: string };

export function createConnectionsStore(options: {
  checkDesktopAppRestriction: DesktopAppRestrictionChecker;
  client: () => Client | null;
  setClient: (value: Client | null) => void;
  projectDir: () => string;
  selectedWorkspaceId: () => string;
  selectedWorkspaceRoot: () => string;
  workspaceType: () => "local" | "always-on";
  get3wServer: Get3wServerStore;
  runtimeWorkspaceId: () => string | null;
  ensureRuntimeWorkspaceId?: () => Promise<string | null | undefined>;
  localGet3wServerRecoveryTimeoutMs?: number;
  setProjectDir?: (value: string) => void;
  developerMode: () => boolean;
  markReloadRequired?: (reason: ReloadReason, trigger?: ReloadTrigger) => void;
}) {
  const listeners = new Set<() => void>();

  let started = false;
  let disposed = false;
  let lastWorkspaceContextKey = "";
  let lastProjectDir = "";
  let snapshot: ConnectionsStoreSnapshot;
  const mcpStatusSynchronizer = createMcpStatusSynchronizer();
  const authStatusPolls = new Set<string>();

  let state: MutableState = {
    mcpServers: [],
    mcpStatus: null,
    mcpLastUpdatedAt: null,
    mcpStatuses: {},
    mcpConnectingName: null,
    selectedMcp: null,
    mcpAuthModalOpen: false,
    mcpAuthEntry: null,
    mcpAuthNeedsReload: false,
    managedOAuthAvailable: true,
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
  };

  const refreshSnapshot = () => {
    snapshot = {
      mcpServers: state.mcpServers,
      mcpStatus: state.mcpStatus,
      mcpLastUpdatedAt: state.mcpLastUpdatedAt,
      mcpStatuses: state.mcpStatuses,
      mcpConnectingName: state.mcpConnectingName,
      selectedMcp: state.selectedMcp,
      mcpAuthModalOpen: state.mcpAuthModalOpen,
      mcpAuthEntry: state.mcpAuthEntry,
      mcpAuthNeedsReload: state.mcpAuthNeedsReload,
      managedOAuthAvailable: state.managedOAuthAvailable,
    };
  };

  const mutateState = (updater: (current: MutableState) => MutableState) => {
    state = updater(state);
    refreshSnapshot();
    emitChange();
  };

  const setStateField = <K extends keyof MutableState>(key: K, value: MutableState[K]) => {
    if (Object.is(state[key], value)) return;
    mutateState((current) => ({ ...current, [key]: value }));
  };

  const applyStateAction = <T,>(current: T, next: SetStateAction<T>) =>
    typeof next === "function" ? (next as (value: T) => T)(current) : next;

  const getWorkspaceContextKey = () => {
    const workspaceId = options.selectedWorkspaceId().trim();
    const root = normalizeDirectoryPath(options.selectedWorkspaceRoot().trim());
    const runtimeWorkspaceId = (options.runtimeWorkspaceId() ?? "").trim();
    const workspaceType = options.workspaceType();
    return `${workspaceType}:${workspaceId}:${root}:${runtimeWorkspaceId}`;
  };

  const getGet3wSnapshot = () => options.get3wServer.getSnapshot();

  const resolveGet3wWorkspaceId = async () => {
    const current = options.runtimeWorkspaceId()?.trim();
    if (current) return current;
    const get3wSnapshot = getGet3wSnapshot();
    if (get3wSnapshot.get3wServerStatus !== "connected" || !get3wSnapshot.get3wServerClient) {
      return null;
    }
    const ensured = (await options.ensureRuntimeWorkspaceId?.())?.trim();
    if (ensured) return ensured;
    return (options.workspaceType() === "local" || options.workspaceType() === "always-on") ? options.selectedWorkspaceId().trim() || null : null;
  };

  const resolveConfigGet3wTarget = async (mode: "read" | "write") => {
    const get3wSnapshot = getGet3wSnapshot();
    const get3wClient = get3wSnapshot.get3wServerClient;
    const get3wWorkspaceId = await resolveGet3wWorkspaceId();
    const hasGet3wTarget =
      get3wSnapshot.get3wServerStatus === "connected" &&
      Boolean(get3wClient && get3wWorkspaceId);
    const canUseGet3wServer =
      hasGet3wTarget &&
      get3wSnapshot.get3wServerCapabilities?.config?.[mode] !== false;
    return {
      get3wClient,
      get3wWorkspaceId,
      hasGet3wTarget,
      canUseGet3wServer,
    };
  };

  const resolveMcpGet3wTarget = async (mode: "read" | "write") => {
    let get3wSnapshot = getGet3wSnapshot();
    let get3wClient = get3wSnapshot.get3wServerClient;
    let get3wWorkspaceId = await resolveGet3wWorkspaceId();
    if ((!get3wClient || !get3wWorkspaceId || get3wSnapshot.get3wServerStatus !== "connected")
      && isDesktopRuntime()
      && (options.workspaceType() === "local" || options.workspaceType() === "always-on")) {
      get3wClient = await withLocalGet3wServerRecoveryTimeout(
        options.get3wServer.ensureLocalGet3wServerClient(),
        options.localGet3wServerRecoveryTimeoutMs ?? LOCAL_GET3W_SERVER_RECOVERY_TIMEOUT_MS,
      );
      get3wSnapshot = getGet3wSnapshot();
      get3wWorkspaceId = options.runtimeWorkspaceId()?.trim()
        || (await options.ensureRuntimeWorkspaceId?.())?.trim()
        || options.selectedWorkspaceId().trim()
        || null;
    }
    const hasGet3wTarget =
      Boolean(get3wClient && get3wWorkspaceId);
    const canUseGet3wServer =
      hasGet3wTarget &&
      get3wSnapshot.get3wServerCapabilities?.mcp?.[mode] !== false;
    return {
      get3wClient,
      get3wWorkspaceId,
      hasGet3wTarget,
      canUseGet3wServer,
    };
  };

  const filterConfiguredStatuses = (status: McpStatusMap, entries: McpServerEntry[]) => {
    const next: McpStatusMap = {};
    for (const entry of entries) {
      const resolved = resolveObservedMcpStatus(status, entry);
      if (resolved && resolved.status !== "disconnected") next[entry.name] = resolved;
    }
    return next;
  };

  const readMcpConfigFile = async (scope: "project" | "global"): Promise<OpencodeConfigFile | null> => {
    const projectDir = options.projectDir().trim();
    const { get3wClient, get3wWorkspaceId, hasGet3wTarget, canUseGet3wServer } =
      await resolveConfigGet3wTarget("read");

    if (canUseGet3wServer && get3wClient && get3wWorkspaceId) {
      return get3wClient.readOpencodeConfigFile(get3wWorkspaceId, scope);
    }

    if (hasGet3wTarget) {
      return null;
    }

    if ((options.workspaceType() !== "local" && options.workspaceType() !== "always-on") || !isDesktopRuntime()) {
      return null;
    }

    return readOpencodeConfig(scope, projectDir) as Promise<OpencodeConfigFile>;
  };

  const ensureActiveClient = async () => {
    let activeClient = options.client();
    if (activeClient) {
      return activeClient;
    }

    const get3wSnapshot = getGet3wSnapshot();
    const get3wBaseUrl = get3wSnapshot.get3wServerBaseUrl.trim();
    const token = get3wSnapshot.get3wServerAuth.token?.trim();
    if (!get3wBaseUrl || !token) {
      return null;
    }

    const mountedBaseUrl =
      buildGet3wWorkspaceBaseUrl(get3wBaseUrl, await resolveGet3wWorkspaceId()) ?? get3wBaseUrl;
    activeClient = createClient(`${mountedBaseUrl.replace(/\/+$/, "")}/opencode`, undefined, {
      token,
      mode: "get3w",
    });
    options.setClient(activeClient);
    return activeClient;
  };

  const resolveWritableGet3wTarget = async () => {
    return resolveMcpGet3wTarget("write");
  };

  const resolveProjectDir = async (activeClient: Client | null, currentProjectDir: string) => {
    let resolvedProjectDir = currentProjectDir;
    if (!resolvedProjectDir && activeClient) {
      try {
        const pathInfo = unwrap(await activeClient.path.get());
        const discoveredRaw = toSessionTransportDirectory(pathInfo.directory ?? "");
        const discovered = discoveredRaw.replace(/^\/private\/tmp(?=\/|$)/, "/tmp");
        if (discovered) {
          resolvedProjectDir = discovered;
          options.setProjectDir?.(discovered);
        }
      } catch {
        // ignore
      }
    }

    return resolvedProjectDir;
  };

  const listMcpFromGet3wServer = async (projectDir: string) => {
    const get3wSnapshot = getGet3wSnapshot();
    const { get3wClient, get3wWorkspaceId, hasGet3wTarget, canUseGet3wServer } =
      await resolveMcpGet3wTarget("read");
    const canTryGet3wServer = canUseGet3wServer;

    recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-check", {
      workspaceType: options.workspaceType(),
      projectDir: projectDir || null,
      get3wStatus: get3wSnapshot.get3wServerStatus,
      hasGet3wClient: Boolean(get3wClient),
      get3wWorkspaceId: get3wWorkspaceId ?? null,
      canReadMcp: get3wSnapshot.get3wServerCapabilities?.mcp?.read ?? null,
      canTryGet3wServer,
    });

    if (hasGet3wTarget && !canTryGet3wServer) {
      throw new Error("Get3W server cannot read MCP config for this workspace.");
    }

    if (!canTryGet3wServer || !get3wClient || !get3wWorkspaceId) return null;

    const response = await get3wClient.listMcp(get3wWorkspaceId);
    const next = response.items.map((entry) => ({
      name: entry.name,
      // The server relays opencode.json entries verbatim; fold a Claude-style
      // string command into one list before any reader touches it.
      config: normalizeMcpServerCommand(entry.config as McpServerEntry["config"]),
      source: entry.source,
      managedOAuth: entry.managedOAuth,
    }));
    const engineSync = response.engineSync ?? null;

    let nextStatuses: McpStatusMap = {};
    // Read through the same workspace mount as configuration. The chat client
    // can still point at the previous/default workspace during restoration.
    try {
      nextStatuses = filterConfiguredStatuses(await get3wClient.getMcpStatus(get3wWorkspaceId), next);
    } catch {
      nextStatuses = {};
    }

    for (const entry of next) {
      const managed = entry.managedOAuth;
      if (!managed) continue;
      if (!managed.enabled) {
        nextStatuses[entry.name] = { status: "disabled" };
      } else if (managed.status === "reconnect_required") {
        nextStatuses[entry.name] = { status: "reconnect_required" };
      } else if (managed.status === "needs_auth" || managed.status === "connecting") {
        nextStatuses[entry.name] = { status: "needs_auth" };
      } else if (!nextStatuses[entry.name]) {
        nextStatuses[entry.name] = { status: "connected" };
      }
    }

    recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-result", {
      count: next.length,
      names: next.map((entry) => entry.name),
      sources: next.map((entry) => entry.source ?? "unknown"),
      engineSyncStatus: engineSync?.status ?? null,
    });

    return {
      next,
      nextStatuses,
      engineSync,
      managedOAuthAvailable: response.managedOAuthState?.available ?? true,
    };
  };

  const resolveDesktopCommand = async (commandName: "getGet3wUiMcpCommand") => {
    try {
      const command = await window.__GET3W_ELECTRON__?.invokeDesktop?.(commandName);
      if (Array.isArray(command) && command.every((part) => typeof part === "string") && command.length > 0) {
        return command;
      }
    } catch {
      // Fall through to the published package command in the manifest/catalog.
    }
    return null;
  };

  const resolveLocalMcpCommand = async (entry: McpDirectoryInfo) => {
    const mcpResource = extensionResource(entry.extensionManifest, "mcp");
    if (mcpResource?.localCommandRef === "get3w.uiMcp" || entry.serverName === "get3w-ui") {
      const command = await resolveDesktopCommand("getGet3wUiMcpCommand");
      return command ?? entry.command;
    }
    return entry.command;
  };

  const resolveLocalMcpEnvironment = async (entry: McpDirectoryInfo) => {
    if (entry.serverName !== "get3w-ui") return undefined;
    try {
      const environment = await window.__GET3W_ELECTRON__?.invokeDesktop?.("getGet3wUiMcpEnvironment");
      if (environment && typeof environment === "object" && !Array.isArray(environment)) {
        return Object.fromEntries(
          Object.entries(environment).filter((entry): entry is [string, string] =>
            typeof entry[0] === "string" && typeof entry[1] === "string"
          ),
        );
      }
    } catch {
      // Discovery fallback in get3w-ui-mcp still handles normal launches.
    }
    return undefined;
  };

  /**
   * Quiet self-heal for remote OAuth MCPs stuck in "Sign in needed": the
   * engine only refreshes tokens reactively (once per transport), so an
   * expired access token strands the entry until the user clicks Sign in.
   * `mcp.connect` retries the stored refresh-token grant on a fresh
   * transport without opening a browser or modal for user-added connectors.
   */
  async function healUnhealthyMcpEntries(
    servers: McpServerEntry[],
    statuses: McpStatusMap,
    refreshToken: McpStatusRefreshToken,
  ) {
    if (disposed || snapshot.mcpAuthModalOpen || snapshot.mcpConnectingName) return;
    const activeClient = options.client();
    const projectDir = options.projectDir().trim();
    if (!activeClient || !projectDir) return;
    const attempted = await attemptSilentMcpReauth({
      client: activeClient,
      directory: projectDir,
      servers,
      statuses,
    }).catch(() => false);
    if (!attempted || disposed || !mcpStatusSynchronizer.isCurrent(refreshToken)) return;
    // Re-enter the ordered refresh path. A self-heal launched from an older
    // snapshot must never publish its late status over a newer OAuth result.
    await refreshMcpServers();
  }

  async function refreshMcpServers() {
    if (disposed) return;

    const refreshToken = mcpStatusSynchronizer.beginRefresh(getWorkspaceContextKey());
    const isCurrentRefresh = () => !disposed && mcpStatusSynchronizer.isCurrent(refreshToken);
    const projectDir = options.projectDir().trim();
    try {
      if (isCurrentRefresh()) setStateField("mcpStatus", null);
      const serverResult = await listMcpFromGet3wServer(projectDir);
      if (serverResult) {
        // Surface engine registration failures instead of leaving users
        // staring at an MCP that silently shows as disconnected.
        const failedNames = serverResult.engineSync?.status === "failed"
          ? serverResult.engineSync.failures.map((failure) => failure.name).join(", ")
          : "";
        const projectedStatuses = mcpStatusSynchronizer.project(
          refreshToken,
          serverResult.nextStatuses,
          serverResult.next,
        );
        if (!projectedStatuses) return;
        mutateState((current) => ({
          ...current,
          mcpServers: serverResult.next,
          mcpLastUpdatedAt: Date.now(),
          mcpStatuses: projectedStatuses,
          managedOAuthAvailable: serverResult.managedOAuthAvailable,
          // The Library's own empty state explains an empty server list.
          mcpStatus: failedNames
            ? `Some MCPs could not be registered with the engine: ${failedNames}. They may appear disconnected — try reloading the engine.`
            : null,
        }));
        void healUnhealthyMcpEntries(serverResult.next, projectedStatuses, refreshToken);
        return;
      }
    } catch (error) {
      recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-error", {
        message: error instanceof Error ? error.message : String(error),
      });
      const serverTarget = await resolveMcpGet3wTarget("read").catch(() => null);
      if (!isCurrentRefresh()) return;
      if (serverTarget?.hasGet3wTarget) {
        mutateState((current) => ({
          ...current,
          mcpServers: [],
          mcpStatuses: {},
          mcpStatus: error instanceof Error ? error.message : "Failed to load MCP servers",
        }));
        return;
      }
    }

    if (!isDesktopRuntime()) {
      if (!isCurrentRefresh()) return;
      mutateState((current) => ({
        ...current,
        mcpStatus: "MCP configuration is only available for local workspaces.",
        mcpServers: [],
        mcpStatuses: {},
      }));
      return;
    }

    if (!projectDir) {
      if (!isCurrentRefresh()) return;
      mutateState((current) => ({
        ...current,
        mcpStatus: "Pick a workspace folder to load MCP servers.",
        mcpServers: [],
        mcpStatuses: {},
      }));
      return;
    }

    try {
      if (isCurrentRefresh()) setStateField("mcpStatus", null);
      recordPerfLog(options.developerMode(), "mcp.refresh", "desktop-project-fallback", {
        projectDir,
      });
      const [globalConfig, projectConfig] = await Promise.all([
        readOpencodeConfig("global", projectDir) as Promise<OpencodeConfigFile>,
        readOpencodeConfig("project", projectDir) as Promise<OpencodeConfigFile>,
      ]);
      const globalServers = globalConfig.exists && globalConfig.content
        ? parseMcpServersFromContent(globalConfig.content).map((entry) => ({
          ...entry,
          source: "config.global" as const,
        }))
        : [];
      const projectServers = projectConfig.exists && projectConfig.content
        ? parseMcpServersFromContent(projectConfig.content)
        : [];
      const projectNames = new Set(projectServers.map((entry) => entry.name));
      const fileServers = [
        ...globalServers.filter((entry) => !projectNames.has(entry.name)),
        ...projectServers,
      ];
      // Runtime-DB MCPs (source "config.remote") only exist on the Get3W
      // server. Keep the last-known entries instead of silently dropping them
      // while the server is briefly unreachable (startup race) — otherwise
      // enabled MCPs like get3w-ui render as "off".
      const fileNames = new Set(fileServers.map((entry) => entry.name));
      const runtimeServers = state.mcpServers.filter(
        (entry) => entry.source === "config.remote" && !fileNames.has(entry.name),
      );
      const next = [...fileServers, ...runtimeServers];

      recordPerfLog(options.developerMode(), "mcp.refresh", "desktop-project-fallback-result", {
        globalConfigPath: globalConfig.path,
        projectConfigPath: projectConfig.path,
        count: next.length,
        names: next.map((entry) => entry.name),
        sources: next.map((entry) => entry.source ?? "unknown"),
      });

      if (!globalConfig.exists && !projectConfig.exists && runtimeServers.length === 0) {
        if (!isCurrentRefresh()) return;
        mutateState((current) => ({
          ...current,
          mcpServers: [],
          mcpStatuses: {},
          mcpStatus: "No opencode.json found yet. Create one by connecting an MCP.",
        }));
        return;
      }

      let nextStatuses = state.mcpStatuses;
      const activeClient = options.client();
      if (activeClient) {
        try {
          const status = unwrap(await activeClient.mcp.status({ directory: projectDir }));
          nextStatuses = filterConfiguredStatuses(status as McpStatusMap, next);
        } catch {
          nextStatuses = {};
        }
      }

      const projectedStatuses = mcpStatusSynchronizer.project(refreshToken, nextStatuses, next);
      if (!projectedStatuses) return;
      mutateState((current) => ({
        ...current,
        mcpServers: next,
        mcpLastUpdatedAt: Date.now(),
        mcpStatuses: projectedStatuses,
        mcpStatus: null,
      }));
      void healUnhealthyMcpEntries(next, projectedStatuses, refreshToken);
    } catch (error) {
      if (!isCurrentRefresh()) return;
      mutateState((current) => ({
        ...current,
        mcpServers: [],
        mcpStatuses: {},
        mcpStatus: error instanceof Error ? error.message : "Failed to load MCP servers",
      }));
    }
  }

  function mcpMutationDenied(builtIn: boolean) {
    const restriction = builtIn ? "allowBuiltInExtensions" : "allowManageExtensions";
    if (!options.checkDesktopAppRestriction({ restriction })) return null;
    const message = desktopRestrictionNotice(restriction);
    setStateField("mcpStatus", message);
    return message;
  }

  function builtInMcp(name: string) {
    return MCP_QUICK_CONNECT.find((entry) =>
      isBuiltInGet3WExtension(entry) && getMcpServerName(entry) === name,
    );
  }

  async function connectMcp(entry: McpDirectoryInfo): Promise<McpConnectResult> {
    const builtIn = builtInMcp(getMcpServerName(entry));
    // Use catalog configuration for built-ins; caller-supplied metadata must
    // not turn an arbitrary URL or command into an allowed built-in.
    if (builtIn) entry = builtIn;
    // Cloud repair uses the signed-in organization's reconciler below, not
    // caller-supplied MCP configuration. Existing service access stays usable.
    if (entry.managedBy !== "get3w-connect") {
      const error = mcpMutationDenied(Boolean(builtIn));
      if (error) return { ok: false, error };
    }
    const startedAt = perfNow();
    const get3wSnapshot = getGet3wSnapshot();
    // A browser session connected to an Get3W server has no local config to fall back to.
    const serverOnly = !isDesktopRuntime() && get3wSnapshot.get3wServerStatus === "connected";
    const projectDir = options.projectDir().trim();
    const entryType = entry.type ?? "remote";

    recordPerfLog(options.developerMode(), "mcp.connect", "start", {
      name: entry.name,
      type: entryType,
      serverOnly,
      projectDir: projectDir || null,
    });

    const { get3wClient, get3wWorkspaceId, hasGet3wTarget, canUseGet3wServer } =
      await resolveWritableGet3wTarget();

    if (serverOnly && !canUseGet3wServer) {
      const error = "Get3W server unavailable. MCP config is read-only.";
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "get3w-server-unavailable",
      });
      return { ok: false, error };
    }

    if (hasGet3wTarget && !canUseGet3wServer) {
      const error = "Get3W server MCP config is read-only.";
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "get3w-server-read-only",
      });
      return { ok: false, error };
    }

    if (!canUseGet3wServer && !isDesktopRuntime()) {
      const error = t("mcp.desktop_required");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "desktop-required",
      });
      return { ok: false, error };
    }

    if (!serverOnly && !projectDir && !canUseGet3wServer) {
      const error = t("mcp.pick_workspace_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "missing-workspace",
      });
      return { ok: false, error };
    }

    const activeClient = canUseGet3wServer ? options.client() ?? await ensureActiveClient().catch(() => null) : await ensureActiveClient();
    if (!activeClient && !canUseGet3wServer) {
      const error = t("mcp.connect_server_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "no-active-client",
      });
      return { ok: false, error };
    }

    const resolvedProjectDir = activeClient ? await resolveProjectDir(activeClient, projectDir) : projectDir;
    if (!resolvedProjectDir && !canUseGet3wServer) {
      const error = t("mcp.pick_workspace_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "missing-workspace-after-discovery",
      });
      return { ok: false, error };
    }

    const slug = entry.id ?? getMcpServerName(entry);
    const action = snapshot.mcpServers.some((server) => server.name === slug) ? "updated" : "added";

    if (conflictsWithGet3wConnect(entry)) {
      const error = t("mcp.name_reserved_get3w_connect");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "get3w-connect-name-reserved",
      });
      return { ok: false, error };
    }

    try {
      mutateState((current) => ({ ...current, mcpStatus: null, mcpConnectingName: entry.name }));

      if (entry.managedBy === "get3w-connect") {
        throw new Error(t("extensions.cloud_retired"));
      }

      if (entry.managedOAuth) {
        if (!isDesktopRuntime()) {
          throw new Error("Get3W-managed MCP OAuth is currently available for local desktop workspaces only.");
        }
        if (entryType !== "remote" || !entry.url) {
          throw new Error("Get3W-managed OAuth requires a remote MCP URL.");
        }
        if (!canUseGet3wServer || !get3wClient || !get3wWorkspaceId) {
          throw new Error("The local Get3W server is required for managed MCP sign-in.");
        }
        const result = await get3wClient.addManagedMcp(get3wWorkspaceId, {
          name: slug,
          url: entry.url,
          oauth: {
            applicationType: "native",
            requestedScopes: entry.oauthConfig?.scope?.split(/\s+/).filter(Boolean),
            clientId: entry.oauthConfig?.clientId,
            clientSecret: entry.oauthConfig?.clientSecret,
          },
        });
        const connected = await waitForManagedMcpAuthorization(
          get3wClient,
          get3wWorkspaceId,
          slug,
          result,
        );
        options.markReloadRequired?.("mcp", { type: "mcp", name: slug, action });
        await refreshMcpServers();
        if (connected) setStateField("mcpStatus", t("mcp.connected"));
        finishPerf(options.developerMode(), "mcp.connect", connected ? "done" : "blocked", startedAt, {
          name: entry.name,
          type: entryType,
          slug,
        });
        return connected
          ? { ok: true }
          : {
              ok: false,
              error: state.mcpStatus ?? "MCP sign-in is still pending. Finish it in your browser, then refresh connections.",
            };
      }

      // Resolve dynamic URLs for built-in MCPs
      let resolvedUrl = entry.url;
      let resolvedHeaders: Record<string, string> | undefined;
      if (!resolvedUrl && entry.serverName === "get3w-ui") {
        try {
          const bridgeInfo = await window.__GET3W_ELECTRON__?.invokeDesktop?.("getUiControlBridgeInfo");
          if (bridgeInfo?.baseUrl) {
            resolvedUrl = `${bridgeInfo.baseUrl}/mcp`;
            if (bridgeInfo.token) {
              resolvedHeaders = { Authorization: `Bearer ${bridgeInfo.token}` };
            }
          }
        } catch {
          // Bridge not available
        }
      }

      const mcpEntryConfig: Record<string, unknown> = {
        type: entryType,
        enabled: true,
      };

      if (entryType === "remote") {
        if (!resolvedUrl) {
          throw new Error("Missing MCP URL. Is the Get3W desktop app running?");
        }
        mcpEntryConfig["url"] = resolvedUrl;
        if (resolvedHeaders) {
          mcpEntryConfig["headers"] = resolvedHeaders;
          // Header-authed entries must not trigger OAuth auto-detection;
          // otherwise opencode reports "needs_auth" despite valid headers.
          mcpEntryConfig["oauth"] = false;
        }
        if (!resolvedHeaders) {
          if (entry.oauthConfig) {
            mcpEntryConfig["oauth"] = entry.oauthConfig;
          } else if (entry.oauth) {
            mcpEntryConfig["oauth"] = {};
          }
        }
      }

      if (entryType === "local") {
        const command = await resolveLocalMcpCommand(entry);
        if (!command?.length) {
          throw new Error("Missing MCP command.");
        }
        mcpEntryConfig["command"] = command;
        const environment = await resolveLocalMcpEnvironment(entry);
        if (environment) {
          mcpEntryConfig["environment"] = environment;
        }
      }

      if (canUseGet3wServer && get3wClient && get3wWorkspaceId) {
        await get3wClient.addMcp(get3wWorkspaceId, {
          name: slug,
          config: mcpEntryConfig,
        });
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        const configFile = await readOpencodeConfig("project", resolvedProjectDir) as OpencodeConfigFile;

        const raw = configFile.exists && configFile.content?.trim()
          ? configFile.content
          : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';

        const parseErrors: Array<{ error: number; offset: number; length: number }> = [];
        parse(raw, parseErrors, { allowTrailingComma: true });
        if (parseErrors.length > 0) {
          const details = parseErrors
            .map((entry) => printParseErrorCode(entry.error))
            .join(", ");
          throw new Error(`Failed to parse opencode config: ${details}`);
        }

        let updated = raw;
        const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
        updated = applyEdits(
          updated,
          modify(updated, ["$schema"], "https://opencode.ai/config.json", { formattingOptions }),
        );
        updated = applyEdits(
          updated,
          modify(updated, ["mcp", slug], mcpEntryConfig, { formattingOptions }),
        );

        const writeResult = await writeOpencodeConfig(
          "project",
          resolvedProjectDir,
          updated.endsWith("\n") ? updated : `${updated}\n`,
        ) as { ok: boolean; stderr?: string; stdout?: string };
        if (!writeResult.ok) {
          throw new Error(writeResult.stderr || writeResult.stdout || "Failed to write opencode.json");
        }
      }

      if (canUseGet3wServer && get3wClient && get3wWorkspaceId) {
        // The Get3W server is the source of truth for workspace-scoped MCP
        // config in the React port. Avoid also calling the OpenCode SDK's MCP
        // hot-add endpoint here: when the SDK client is rooted at the aggregate
        // `/opencode` route it can resolve to an internal `local_*` workspace
        // id that the Get3W server does not expose, producing a confusing
        // `workspace_not_found` after the config write already succeeded.
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        const mcpAddConfig =
          entryType === "remote"
            ? {
                type: "remote" as const,
                url: resolvedUrl ?? entry.url!,
                enabled: true,
                ...(resolvedHeaders ? { headers: resolvedHeaders, oauth: false as const } : {}),
                ...(!resolvedHeaders && entry.oauthConfig ? { oauth: entry.oauthConfig } : {}),
                ...(!resolvedHeaders && !entry.oauthConfig && entry.oauth ? { oauth: {} } : {}),
              }
            : {
                type: "local" as const,
                command: (mcpEntryConfig["command"] as string[]) ?? entry.command!,
                enabled: true,
                // The hot-add call is what spawns the process on first connect;
                // the file write above only matters on a later engine start.
                ...(mcpEntryConfig["environment"]
                  ? { environment: mcpEntryConfig["environment"] as Record<string, string> }
                  : {}),
              };

        unwrap(
          await activeClient.mcp.add({
            directory: resolvedProjectDir,
            name: slug,
            config: mcpAddConfig,
          }),
        );
      }
      options.markReloadRequired?.("mcp", { type: "mcp", name: slug, action });
      await refreshMcpServers();

      // OAuth is auto-detected: open the sign-in modal when the directory
      // entry declares OAuth up front, or when the engine reports the fresh
      // remote entry as needing auth. Custom apps no longer ask the user to
      // know whether their server uses OAuth.
      let needsAuth = Boolean(entry.oauth) && !resolvedHeaders;
      if (!needsAuth && entryType === "remote" && !resolvedHeaders) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const detected = snapshot.mcpStatuses[slug]?.status;
          if (detected === "needs_auth" || detected === "needs_client_registration") {
            needsAuth = true;
            break;
          }
          if (detected === "connected" || detected === "failed" || detected === "disabled") break;
          await new Promise((resolve) => setTimeout(resolve, 500));
          await refreshMcpServers();
        }
      }

      if (needsAuth) {
        mutateState((current) => ({
          ...current,
          mcpAuthEntry: entry,
          mcpAuthNeedsReload: true,
          mcpAuthModalOpen: true,
        }));
      } else {
        setStateField("mcpStatus", t("mcp.connected"));
      }

      await refreshMcpServers();
      finishPerf(options.developerMode(), "mcp.connect", "done", startedAt, {
        name: entry.name,
        type: entryType,
        slug,
      });
      return { ok: true };
    } catch (error) {
      console.error("[mcp.connect] failed", entry.name, error);
      const message = error instanceof Error ? error.message : t("mcp.connect_failed");
      setStateField("mcpStatus", message);
      finishPerf(options.developerMode(), "mcp.connect", "error", startedAt, {
        name: entry.name,
        type: entryType,
        error: error instanceof Error ? error.message : safeStringify(error),
      });
      return { ok: false, error: message };
    } finally {
      setStateField("mcpConnectingName", null);
    }
  }

  async function waitForManagedMcpAuthorization(
    get3wClient: Get3wServerClient,
    workspaceId: string,
    name: string,
    result: { status: "connected" } | { status: "needs_auth"; authorizeUrl: string },
  ): Promise<boolean> {
    if (result.status === "connected") return true;
    await openDesktopUrl(assertDesktopWebUrl(result.authorizeUrl));
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const connection = await get3wClient.getManagedMcp(workspaceId, name);
      if (connection.status === "connected") return true;
      if (connection.status === "reconnect_required") {
        throw new Error(connection.lastError || "MCP sign-in needs to be restarted.");
      }
    }
    setStateField("mcpStatus", "MCP sign-in is still pending. Finish it in your browser, then refresh connections.");
    return false;
  }

  async function authorizeMcp(entry: McpServerEntry) {
    if (entry.managedOAuth) {
      try {
        const { get3wClient, get3wWorkspaceId, canUseGet3wServer } = await resolveWritableGet3wTarget();
        if (!canUseGet3wServer || !get3wClient || !get3wWorkspaceId) {
          throw new Error("The local Get3W server is required for managed MCP sign-in.");
        }
        mutateState((current) => ({ ...current, mcpStatus: null, mcpConnectingName: entry.name }));
        const result = await get3wClient.connectManagedMcp(get3wWorkspaceId, entry.name);
        const connected = await waitForManagedMcpAuthorization(get3wClient, get3wWorkspaceId, entry.name, result);
        await refreshMcpServers();
        if (connected) setStateField("mcpStatus", t("mcp.connected"));
      } catch (error) {
        setStateField("mcpStatus", error instanceof Error ? error.message : t("mcp.connect_failed"));
      } finally {
        setStateField("mcpConnectingName", null);
      }
      return;
    }
    if (entry.config.type !== "remote" || entry.config.oauth === false) {
      setStateField("mcpStatus", t("mcp.login_unavailable"));
      return;
    }

    const matchingQuickConnect = MCP_QUICK_CONNECT.find((candidate) => {
      const candidateSlug = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return candidateSlug === entry.name || candidate.name === entry.name;
    });

    mutateState((current) => ({
      ...current,
      mcpAuthEntry:
        matchingQuickConnect ?? {
          name: entry.name,
          description: "",
          type: "remote",
          url: entry.config.url,
          oauth: true,
        },
      mcpAuthNeedsReload: false,
      mcpAuthModalOpen: true,
    }));
  }

  async function logoutMcpAuth(name: string) {
    const get3wSnapshot = getGet3wSnapshot();
    // A browser session connected to an Get3W server has no local config to fall back to.
    const serverOnly = !isDesktopRuntime() && get3wSnapshot.get3wServerStatus === "connected";
    const projectDir = options.projectDir().trim();

    const { get3wClient, get3wWorkspaceId, hasGet3wTarget, canUseGet3wServer } =
      await resolveWritableGet3wTarget();

    if (serverOnly && !canUseGet3wServer) {
      setStateField("mcpStatus", "Get3W server unavailable. MCP auth is read-only.");
      return;
    }

    if (hasGet3wTarget && !canUseGet3wServer) {
      setStateField("mcpStatus", "Get3W server MCP auth is read-only.");
      return;
    }

    if (!canUseGet3wServer && !isDesktopRuntime()) {
      setStateField("mcpStatus", t("mcp.desktop_required"));
      return;
    }

    const activeClient = canUseGet3wServer ? options.client() : await ensureActiveClient();
    if (!activeClient && !canUseGet3wServer) {
      setStateField("mcpStatus", t("mcp.connect_server_first"));
      return;
    }

    const resolvedProjectDir = activeClient ? await resolveProjectDir(activeClient, projectDir) : projectDir;
    if (!resolvedProjectDir && !canUseGet3wServer) {
      setStateField("mcpStatus", t("mcp.pick_workspace_first"));
      return;
    }

    const safeName = validateMcpServerName(name);
    setStateField("mcpStatus", null);

    try {
      if (canUseGet3wServer && get3wClient && get3wWorkspaceId) {
        await get3wClient.logoutMcpAuth(get3wWorkspaceId, safeName);
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        try {
          await activeClient.mcp.disconnect({ directory: resolvedProjectDir, name: safeName });
        } catch {
          // ignore
        }
        await activeClient.mcp.auth.remove({ directory: resolvedProjectDir, name: safeName });
      }

      await refreshMcpServers();
      setStateField("mcpStatus", t("mcp.logout_success").replace("{server}", safeName));
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.logout_failed"),
      );
    }
  }

  async function removeMcp(name: string) {
    if (mcpMutationDenied(Boolean(builtInMcp(name)))) return;
    try {
      setStateField("mcpStatus", null);

      const { get3wClient, get3wWorkspaceId, hasGet3wTarget, canUseGet3wServer } =
        await resolveWritableGet3wTarget();

      if (canUseGet3wServer && get3wClient && get3wWorkspaceId) {
        await get3wClient.removeMcp(get3wWorkspaceId, name);
      } else {
        if (hasGet3wTarget) {
          setStateField("mcpStatus", "Get3W server MCP config is read-only.");
          return;
        }
        const projectDir = options.projectDir().trim();
        if (!projectDir) {
          setStateField("mcpStatus", t("mcp.pick_workspace_first"));
          return;
        }
        await removeMcpFromConfig(projectDir, name);
      }

      options.markReloadRequired?.("mcp", { type: "mcp", name, action: "removed" });
      await refreshMcpServers();
      if (snapshot.selectedMcp === name) {
        setStateField("selectedMcp", null);
      }
      setStateField("mcpStatus", null);
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.remove_failed"),
      );
    }
  }

  function notifyMcpReloading() {
    setStateField("mcpStatus", t("mcp.reloading_status"));
  }

  // OpenCode reconnects MCP servers asynchronously after /instance/dispose,
  // so an immediate mcp.status query returns stale "disconnected". Poll on
  // a backoff until every enabled MCP reaches a terminal status, with the
  // banner up the whole time so users see continuous feedback.
  async function pollMcpServersAfterReload(): Promise<void> {
    if (disposed) return;
    notifyMcpReloading();
    await refreshMcpServers();

    const settled = (statuses: McpStatusMap, servers: McpServerEntry[]) => {
      const expected = servers.filter((s) => s.config.enabled !== false);
      if (expected.length === 0) return true;
      return expected.every((server) => {
        const status = statuses[server.name]?.status;
        return status === "connected" || status === "needs_auth" || status === "failed";
      });
    };

    const delays = [400, 800, 1500, 2500, 4000];
    for (const delay of delays) {
      if (disposed) return;
      if (settled(snapshot.mcpStatuses, snapshot.mcpServers)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      await refreshMcpServers();
    }

    if (disposed) return;
    // Only clear the reloading banner if it's still ours. refreshMcpServers
    // may have already replaced it with a real message (e.g. a registration failure).
    if (snapshot.mcpStatus === "Reloading MCP servers…") {
      setStateField("mcpStatus", null);
    }
  }

  // Server-only path. Local fallback would rewrite opencode.jsonc whole and
  // clobber inline comments — settings-route.tsx already gates the prop so
  // this never gets called when the server is unavailable. Reload UX comes
  // from the existing reload-required popup; no extra banner here.
  async function setMcpEnabled(name: string, enabled: boolean) {
    if (mcpMutationDenied(Boolean(builtInMcp(name)))) return;
    try {
      const { get3wClient, get3wWorkspaceId, canUseGet3wServer } =
        await resolveWritableGet3wTarget();

      if (!canUseGet3wServer || !get3wClient || !get3wWorkspaceId) {
        setStateField("mcpStatus", t("mcp.toggle_requires_server"));
        return;
      }

      await get3wClient.setMcpEnabled(get3wWorkspaceId, name, enabled);
      options.markReloadRequired?.("mcp", { type: "mcp", name, action: "updated" });
      await refreshMcpServers();
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.toggle_failed"),
      );
    }
  }

  function closeMcpAuthModal() {
    mutateState((current) => ({
      ...current,
      mcpAuthModalOpen: false,
      mcpAuthEntry: null,
      mcpAuthNeedsReload: false,
    }));
  }

  function recordMcpAuthenticated(name: string) {
    const workspaceContextKey = getWorkspaceContextKey();
    mcpStatusSynchronizer.recordAuthenticated(workspaceContextKey, name);
    const normalizedName = normalizeMcpSlug(name);
    const configuredName = state.mcpServers.find((entry) => (
      normalizeMcpSlug(entry.id ?? entry.name) === normalizedName
      || normalizeMcpSlug(entry.name) === normalizedName
    ))?.name ?? name;
    mutateState((current) => ({
      ...current,
      mcpStatuses: {
        ...current.mcpStatuses,
        [configuredName]: { status: "connected" },
      },
    }));

    const pollKey = `${workspaceContextKey}\n${normalizedName}`;
    if (authStatusPolls.has(pollKey)) return;
    authStatusPolls.add(pollKey);
    void (async () => {
      const delays = [0, 250, 500, 1_000, 2_000, 4_000];
      try {
        for (const delay of delays) {
          if (disposed || !mcpStatusSynchronizer.isPending(workspaceContextKey, name)) return;
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          if (disposed) return;
          await refreshMcpServers();
        }
      } finally {
        authStatusPolls.delete(pollKey);
      }
    })();
  }

  async function completeMcpAuthModal() {
    closeMcpAuthModal();
    await refreshMcpServers();
  }

  const syncFromOptions = () => {
    const workspaceContextKey = getWorkspaceContextKey();
    const projectDir = options.projectDir().trim();
    const changed =
      workspaceContextKey !== lastWorkspaceContextKey || projectDir !== lastProjectDir;

    lastWorkspaceContextKey = workspaceContextKey;
    lastProjectDir = projectDir;

    if (!started || disposed || !changed) {
      return;
    }

    if (!isDesktopRuntime() && getGet3wSnapshot().get3wServerStatus !== "connected") {
      return;
    }

    void refreshMcpServers();
  };

  const start = () => {
    if (started) return;
    // StrictMode double-mount re-arms after dispose.
    disposed = false;
    started = true;
    syncFromOptions();
  };

  const dispose = () => {
    disposed = true;
    started = false;
  };

  refreshSnapshot();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => snapshot;

  return {
    subscribe,
    getSnapshot,
    start,
    dispose,
    syncFromOptions,
    get mcpServers() {
      return snapshot.mcpServers;
    },
    get mcpStatus() {
      return snapshot.mcpStatus;
    },
    get mcpLastUpdatedAt() {
      return snapshot.mcpLastUpdatedAt;
    },
    get mcpStatuses() {
      return snapshot.mcpStatuses;
    },
    get mcpConnectingName() {
      return snapshot.mcpConnectingName;
    },
    get selectedMcp() {
      return snapshot.selectedMcp;
    },
    setSelectedMcp(value: SetStateAction<string | null>) {
      const resolved = applyStateAction(state.selectedMcp, value);
      setStateField("selectedMcp", resolved);
    },
    quickConnect: MCP_QUICK_CONNECT,
    readMcpConfigFile,
    refreshMcpServers,
    connectMcp,
    authorizeMcp,
    logoutMcpAuth,
    removeMcp,
    setMcpEnabled,
    notifyMcpReloading,
    pollMcpServersAfterReload,
    get mcpAuthModalOpen() {
      return snapshot.mcpAuthModalOpen;
    },
    get mcpAuthEntry() {
      return snapshot.mcpAuthEntry;
    },
    get mcpAuthNeedsReload() {
      return snapshot.mcpAuthNeedsReload;
    },
    closeMcpAuthModal,
    recordMcpAuthenticated,
    completeMcpAuthModal,
  };
}

export function useConnectionsStoreSnapshot(store: ConnectionsStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

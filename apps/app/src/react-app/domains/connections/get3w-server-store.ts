import { useSyncExternalStore } from "react";

import { t } from "../../../i18n";
import type { StartupPreference } from "../../../app/types";
import { isDesktopRuntime } from "../../../app/utils";
import {
  get3wServerInfo,
  get3wServerRestart,
  type Get3wServerInfo,
} from "../../../app/lib/desktop";
import {
  getGet3wGatewayOrigin,
  readGet3wGatewayDenToken,
} from "../../../app/lib/gateway-runtime";
import {
  clearGet3wServerSettings,
  createGet3wServerClient,
  isLoopbackGet3wServerUrl,
  normalizeGet3wServerUrl,
  readGet3wServerSettings,
  writeGet3wServerSettings,
  type Get3wAuditEntry,
  type Get3wServerCapabilities,
  type Get3wServerClient,
  type Get3wServerDiagnostics,
  type Get3wServerError,
  type Get3wServerSettings,
  type Get3wServerStatus,
} from "../../../app/lib/get3w-server";

type SetStateAction<T> = T | ((current: T) => T);

export type Get3wServerStoreSnapshot = {
  get3wServerSettings: Get3wServerSettings;
  get3wServerUrl: string;
  get3wServerBaseUrl: string;
  get3wServerAuth: { token?: string; hostToken?: string };
  get3wServerClient: Get3wServerClient | null;
  get3wServerStatus: Get3wServerStatus;
  get3wServerCapabilities: Get3wServerCapabilities | null;
  get3wServerReady: boolean;
  get3wServerWorkspaceReady: boolean;
  resolvedGet3wCapabilities: Get3wServerCapabilities | null;
  get3wServerCanWriteSkills: boolean;
  get3wServerCanWritePlugins: boolean;
  get3wServerHostInfo: Get3wServerInfo | null;
  get3wServerDiagnostics: Get3wServerDiagnostics | null;
  get3wReconnectBusy: boolean;
  get3wAuditEntries: Get3wAuditEntry[];
  get3wAuditStatus: "idle" | "loading" | "error";
  get3wAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

export type Get3wServerStore = ReturnType<typeof createGet3wServerStore>;

type CreateGet3wServerStoreOptions = {
  startupPreference: () => StartupPreference | null;
  documentVisible: () => boolean;
  developerMode: () => boolean;
  runtimeWorkspaceId: () => string | null;
};

type MutableState = {
  get3wServerSettings: Get3wServerSettings;
  get3wServerUrl: string;
  get3wServerStatus: Get3wServerStatus;
  get3wServerCapabilities: Get3wServerCapabilities | null;
  get3wServerCheckedAt: number | null;
  get3wServerHostInfo: Get3wServerInfo | null;
  get3wServerHostInfoReady: boolean;
  get3wServerDiagnostics: Get3wServerDiagnostics | null;
  get3wReconnectBusy: boolean;
  get3wAuditEntries: Get3wAuditEntry[];
  get3wAuditStatus: "idle" | "loading" | "error";
  get3wAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

const applyStateAction = <T,>(current: T, next: SetStateAction<T>) =>
  typeof next === "function" ? (next as (value: T) => T)(current) : next;

function sameGet3wServerSnapshot(
  current: Get3wServerStoreSnapshot,
  next: Get3wServerStoreSnapshot,
): boolean {
  return (
    current.get3wServerSettings === next.get3wServerSettings &&
    current.get3wServerUrl === next.get3wServerUrl &&
    current.get3wServerBaseUrl === next.get3wServerBaseUrl &&
    current.get3wServerAuth.token === next.get3wServerAuth.token &&
    current.get3wServerAuth.hostToken === next.get3wServerAuth.hostToken &&
    current.get3wServerClient === next.get3wServerClient &&
    current.get3wServerStatus === next.get3wServerStatus &&
    current.get3wServerCapabilities === next.get3wServerCapabilities &&
    current.get3wServerReady === next.get3wServerReady &&
    current.get3wServerWorkspaceReady === next.get3wServerWorkspaceReady &&
    current.resolvedGet3wCapabilities === next.resolvedGet3wCapabilities &&
    current.get3wServerCanWriteSkills === next.get3wServerCanWriteSkills &&
    current.get3wServerCanWritePlugins === next.get3wServerCanWritePlugins &&
    current.get3wServerHostInfo === next.get3wServerHostInfo &&
    current.get3wServerDiagnostics === next.get3wServerDiagnostics &&
    current.get3wReconnectBusy === next.get3wReconnectBusy &&
    current.get3wAuditEntries === next.get3wAuditEntries &&
    current.get3wAuditStatus === next.get3wAuditStatus &&
    current.get3wAuditError === next.get3wAuditError &&
    current.devtoolsWorkspaceId === next.devtoolsWorkspaceId
  );
}

export function createGet3wServerStore(options: CreateGet3wServerStoreOptions) {
  const bootStartedAt = Date.now();
  const listeners = new Set<() => void>();
  const intervals = new Map<string, number>();

  let clientCacheKey = "";
  let clientCacheValue: Get3wServerClient | null = null;
  let started = false;
  let disposed = false;
  let healthTimeoutId: number | null = null;
  let healthBusy = false;
  let healthDelayMs = 10_000;
  let consecutiveHealthFailures = 0;
  let visibilityChangeHandler: (() => void) | null = null;
  let snapshot: Get3wServerStoreSnapshot | undefined;

  let state: MutableState = {
    get3wServerSettings: readGet3wServerSettings(),
    get3wServerUrl: "",
    get3wServerStatus: "disconnected",
    get3wServerCapabilities: null,
    get3wServerCheckedAt: null,
    get3wServerHostInfo: null,
    get3wServerHostInfoReady: !isDesktopRuntime(),
    get3wServerDiagnostics: null,
    get3wReconnectBusy: false,
    get3wAuditEntries: [],
    get3wAuditStatus: "idle",
    get3wAuditError: null,
    devtoolsWorkspaceId: null,
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
  };

  const getBaseUrl = () => {
    const gatewayOrigin = getGet3wGatewayOrigin();
    if (gatewayOrigin) return normalizeGet3wServerUrl(gatewayOrigin) ?? "";

    const pref = options.startupPreference();
    const hostInfo = state.get3wServerHostInfo;
    const settingsUrl = normalizeGet3wServerUrl(state.get3wServerSettings.urlOverride ?? "") ?? "";

    if (pref === "local") return hostInfo?.baseUrl ?? "";
    if (pref === "server" && settingsUrl && isLoopbackGet3wServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return hostInfo.baseUrl;
    }
    if (pref === "server") return settingsUrl;
    return hostInfo?.baseUrl ?? settingsUrl;
  };

  const getAuth = () => {
    const gatewayOrigin = getGet3wGatewayOrigin();
    if (gatewayOrigin) {
      const token = readGet3wGatewayDenToken().trim();
      return { token: token || undefined, hostToken: undefined };
    }

    const pref = options.startupPreference();
    const hostInfo = state.get3wServerHostInfo;
    const settingsUrl = normalizeGet3wServerUrl(state.get3wServerSettings.urlOverride ?? "") ?? "";
    const settingsToken = state.get3wServerSettings.token?.trim() ?? "";
    const settingsHostToken = state.get3wServerSettings.hostToken?.trim() ?? "";
    const clientToken = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";

    if (pref === "local") {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    if (pref === "server" && settingsUrl && isLoopbackGet3wServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return {
        token: clientToken || settingsToken || undefined,
        hostToken: hostToken || settingsHostToken || undefined,
      };
    }
    if (pref === "server") {
      return {
        token: settingsToken || undefined,
        hostToken: settingsUrl && isLoopbackGet3wServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
      };
    }
    if (hostInfo?.baseUrl) {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    return {
      token: settingsToken || undefined,
      hostToken: settingsUrl && isLoopbackGet3wServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
    };
  };

  const getClient = () => {
    const baseUrl = getBaseUrl().trim();
    if (!baseUrl) {
      clientCacheKey = "";
      clientCacheValue = null;
      return null;
    }

    const auth = getAuth();
    const key = `${baseUrl}::${auth.token ?? ""}::${auth.hostToken ?? ""}`;
    if (key !== clientCacheKey) {
      clientCacheKey = key;
      clientCacheValue = createGet3wServerClient({
        baseUrl,
        token: auth.token,
        hostToken: auth.hostToken,
      });
    }
    return clientCacheValue;
  };

  const refreshSnapshot = (): boolean => {
    const get3wServerBaseUrl = getBaseUrl().trim();
    const get3wServerAuth = getAuth();
    const get3wServerClient = getClient();
    const get3wServerReady = state.get3wServerStatus === "connected";
    const get3wServerWorkspaceReady = Boolean(options.runtimeWorkspaceId());
    const resolvedGet3wCapabilities = state.get3wServerCapabilities;

    const pref = options.startupPreference();
    const info = state.get3wServerHostInfo;
    const hostUrl = info?.baseUrl ?? "";
    const settingsUrl = normalizeGet3wServerUrl(state.get3wServerSettings.urlOverride ?? "") ?? "";

    let get3wServerUrl = hostUrl || settingsUrl;
    if (pref === "local") get3wServerUrl = hostUrl;
    if (pref === "server") get3wServerUrl = settingsUrl;
    state.get3wServerUrl = get3wServerUrl;

    const nextSnapshot: Get3wServerStoreSnapshot = {
      get3wServerSettings: state.get3wServerSettings,
      get3wServerUrl,
      get3wServerBaseUrl,
      get3wServerAuth,
      get3wServerClient,
      get3wServerStatus: state.get3wServerStatus,
      get3wServerCapabilities: state.get3wServerCapabilities,
      get3wServerReady,
      get3wServerWorkspaceReady,
      resolvedGet3wCapabilities,
      get3wServerCanWriteSkills:
        get3wServerReady &&
        (resolvedGet3wCapabilities?.skills?.write ?? false),
      get3wServerCanWritePlugins:
        get3wServerReady &&
        (resolvedGet3wCapabilities?.plugins?.write ?? false),
      get3wServerHostInfo: state.get3wServerHostInfo,
      get3wServerDiagnostics: state.get3wServerDiagnostics,
      get3wReconnectBusy: state.get3wReconnectBusy,
      get3wAuditEntries: state.get3wAuditEntries,
      get3wAuditStatus: state.get3wAuditStatus,
      get3wAuditError: state.get3wAuditError,
      devtoolsWorkspaceId: state.devtoolsWorkspaceId,
    };
    if (snapshot && sameGet3wServerSnapshot(snapshot, nextSnapshot)) return false;
    snapshot = nextSnapshot;
    return true;
  };

  const mutateState = (updater: (current: MutableState) => MutableState) => {
    state = updater(state);
    if (refreshSnapshot()) emitChange();
  };

  const setStateField = <K extends keyof MutableState>(key: K, value: MutableState[K]) => {
    if (Object.is(state[key], value)) return;
    mutateState((current) => ({ ...current, [key]: value }));
  };

  const setGet3wServerSettings = (next: SetStateAction<Get3wServerSettings>) => {
    const resolved = applyStateAction(state.get3wServerSettings, next);
    mutateState((current) => ({ ...current, get3wServerSettings: resolved }));
    queueHealthCheck(0);
  };

  const updateGet3wServerSettings = (next: Get3wServerSettings) => {
    const stored = writeGet3wServerSettings(next);
    mutateState((current) => ({ ...current, get3wServerSettings: stored }));
    queueHealthCheck(0);
  };

  const resetGet3wServerSettings = () => {
    clearGet3wServerSettings();
    mutateState((current) => ({ ...current, get3wServerSettings: {} }));
    queueHealthCheck(0);
  };

  const shouldWaitForLocalHostInfo = () =>
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    !state.get3wServerHostInfoReady;

  const shouldRetryStartupCheck = (status: Get3wServerStatus) =>
    status !== "connected" &&
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    Date.now() - bootStartedAt < 5_000;

  const checkGet3wServer = async (url: string, token?: string, hostToken?: string) => {
    const client = createGet3wServerClient({ baseUrl: url, token, hostToken });
    try {
      await client.health();
    } catch (error) {
      const resolved = error as Get3wServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as Get3wServerStatus, capabilities: null };
      }
      return { status: "disconnected" as Get3wServerStatus, capabilities: null };
    }

    if (!token) {
      return { status: "limited" as Get3wServerStatus, capabilities: null };
    }

    try {
      const capabilities = await client.capabilities();
      return { status: "connected" as Get3wServerStatus, capabilities };
    } catch (error) {
      const resolved = error as Get3wServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as Get3wServerStatus, capabilities: null };
      }
      return { status: "disconnected" as Get3wServerStatus, capabilities: null };
    }
  };

  const clearHealthTimeout = () => {
    if (healthTimeoutId !== null) {
      window.clearTimeout(healthTimeoutId);
      healthTimeoutId = null;
    }
  };

  const queueHealthCheck = (delayMs: number) => {
    if (disposed || typeof window === "undefined") return;
    clearHealthTimeout();
    healthTimeoutId = window.setTimeout(() => {
      healthTimeoutId = null;
      void runHealthCheck();
    }, Math.max(0, delayMs));
  };

  const runHealthCheck = async () => {
    if (disposed || typeof window === "undefined") return;
    if (!options.documentVisible()) {
      queueHealthCheck(healthDelayMs);
      return;
    }
    if (shouldWaitForLocalHostInfo()) {
      queueHealthCheck(250);
      return;
    }
    if (healthBusy) return;

    const url = getBaseUrl().trim();
    const auth = getAuth();
    if (!url) {
      consecutiveHealthFailures = 0;
      mutateState((current) => ({
        ...current,
        get3wServerStatus: "disconnected",
        get3wServerCapabilities: null,
        get3wServerCheckedAt: Date.now(),
      }));
      return;
    }

    healthBusy = true;
    try {
      let result = await checkGet3wServer(url, auth.token, auth.hostToken);

      if (shouldRetryStartupCheck(result.status)) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
        if (disposed) return;

        try {
          const info = await get3wServerInfo() as Get3wServerInfo;
          if (disposed) return;

          mutateState((current) => ({
            ...current,
            get3wServerHostInfo: info,
            get3wServerHostInfoReady: true,
          }));

          const retryUrl = info.baseUrl?.trim() ?? "";
          const retryToken = info.clientToken?.trim() || undefined;
          const retryHostToken = info.hostToken?.trim() || undefined;
          if (retryUrl) {
            result = await checkGet3wServer(retryUrl, retryToken, retryHostToken);
          }
        } catch {
          // Preserve the original check result when the retry probe fails.
        }
      }

      if (disposed) return;
      const previousStatus = state.get3wServerStatus;
      const previousCapabilities = state.get3wServerCapabilities;
      const healthy = result.status === "connected" || result.status === "limited";
      if (healthy) {
        consecutiveHealthFailures = 0;
        healthDelayMs = 10_000;
      } else {
        consecutiveHealthFailures += 1;
        healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      }

      const preservePrevious =
        !healthy &&
        consecutiveHealthFailures < 3 &&
        (previousStatus === "connected" || previousStatus === "limited");

      mutateState((current) => ({
        ...current,
        get3wServerStatus: preservePrevious ? previousStatus : result.status,
        get3wServerCapabilities: preservePrevious ? previousCapabilities : result.capabilities,
        get3wServerCheckedAt: Date.now(),
      }));
    } catch {
      healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      mutateState((current) => ({
        ...current,
        get3wServerCheckedAt: Date.now(),
      }));
    } finally {
      healthBusy = false;
      if (!disposed) queueHealthCheck(healthDelayMs);
    }
  };

  const syncFromOptions = () => {
    if (refreshSnapshot()) emitChange();

    if (!isDesktopRuntime()) return;
    const port = state.get3wServerHostInfo?.port;
    if (!port) return;
    if (state.get3wServerSettings.portOverride === port) return;

    updateGet3wServerSettings({
      ...state.get3wServerSettings,
      portOverride: port,
    });
  };

  const startInterval = (key: string, fn: () => void, ms: number) => {
    if (typeof window === "undefined") return;
    if (intervals.has(key)) return;
    intervals.set(key, window.setInterval(fn, ms));
  };

  const stopInterval = (key: string) => {
    const id = intervals.get(key);
    if (id === undefined) return;
    window.clearInterval(id);
    intervals.delete(key);
  };

  const start = () => {
    if (typeof window === "undefined") return;
    if (started) return;
    // Allow restart after a prior dispose() (React 18 StrictMode double-mounts
    // each effect in dev: mount → dispose → re-mount). If we early-return when
    // `disposed` is true, the real mount never arms polling and the UI stays
    // on stale/empty state forever.
    disposed = false;
    started = true;

    syncFromOptions();
    queueHealthCheck(0);
    visibilityChangeHandler = () => {
      if (!options.documentVisible()) return;
      consecutiveHealthFailures = 0;
      queueHealthCheck(0);
    };
    window.addEventListener("visibilitychange", visibilityChangeHandler);

    const refreshHostInfo = () => {
      if (!isDesktopRuntime()) return;
      if (!options.documentVisible()) return;
      void (async () => {
        try {
          const info = await get3wServerInfo() as Get3wServerInfo;
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            get3wServerHostInfo: info,
            get3wServerHostInfoReady: true,
          }));
        } catch {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            get3wServerHostInfo: null,
            get3wServerHostInfoReady: true,
          }));
        }
      })();
    };
    refreshHostInfo();
    startInterval("hostInfo", refreshHostInfo, 10_000);

    const refreshDiagnostics = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("get3wServerDiagnostics", null);
        return;
      }

      const client = getClient();
      if (!client || state.get3wServerStatus === "disconnected") {
        setStateField("get3wServerDiagnostics", null);
        return;
      }

      void (async () => {
        try {
          const status = await client.status();
          if (!disposed) setStateField("get3wServerDiagnostics", status);
        } catch {
          if (!disposed) setStateField("get3wServerDiagnostics", null);
        }
      })();
    };
    refreshDiagnostics();
    startInterval("diagnostics", refreshDiagnostics, 10_000);

    const refreshDevtoolsWorkspace = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      const client = getClient();
      if (!client) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      void (async () => {
        try {
          const response = await client.listWorkspaces();
          if (disposed) return;
          const items = Array.isArray(response.items) ? response.items : [];
          const activeMatch = response.activeId
            ? items.find((item) => item.id === response.activeId)
            : null;
          setStateField("devtoolsWorkspaceId", activeMatch?.id ?? items[0]?.id ?? null);
        } catch {
          if (!disposed) setStateField("devtoolsWorkspaceId", null);
        }
      })();
    };
    refreshDevtoolsWorkspace();
    startInterval("devtoolsWorkspace", refreshDevtoolsWorkspace, 20_000);

    const refreshAudit = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        mutateState((current) => ({
          ...current,
          get3wAuditEntries: [],
          get3wAuditStatus: "idle",
          get3wAuditError: null,
        }));
        return;
      }

      const client = getClient();
      const workspaceId = state.devtoolsWorkspaceId;
      if (!client || !workspaceId) {
        mutateState((current) => ({
          ...current,
          get3wAuditEntries: [],
          get3wAuditStatus: "idle",
          get3wAuditError: null,
        }));
        return;
      }

      mutateState((current) => ({
        ...current,
        get3wAuditStatus: "loading",
        get3wAuditError: null,
      }));

      void (async () => {
        try {
          const result = await client.listAudit(workspaceId, 50);
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            get3wAuditEntries: Array.isArray(result.items) ? result.items : [],
            get3wAuditStatus: "idle",
          }));
        } catch (error) {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            get3wAuditEntries: [],
            get3wAuditStatus: "error",
            get3wAuditError:
              error instanceof Error
                ? error.message
                : t("app.error_audit_load"),
          }));
        }
      })();
    };
    refreshAudit();
    startInterval("audit", refreshAudit, 15_000);
  };

  const dispose = () => {
    disposed = true;
    started = false;
    clearHealthTimeout();
    if (visibilityChangeHandler && typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", visibilityChangeHandler);
      visibilityChangeHandler = null;
    }
    for (const key of [...intervals.keys()]) stopInterval(key);
  };

  const testGet3wServerConnection = async (next: Get3wServerSettings) => {
    const derived = normalizeGet3wServerUrl(next.urlOverride ?? "");
    if (!derived) {
      mutateState((current) => ({
        ...current,
        get3wServerStatus: "disconnected",
        get3wServerCapabilities: null,
        get3wServerCheckedAt: Date.now(),
      }));
      return false;
    }

    const result = await checkGet3wServer(derived, next.token);
    consecutiveHealthFailures = result.status === "disconnected" ? consecutiveHealthFailures + 1 : 0;
    mutateState((current) => ({
      ...current,
      get3wServerStatus: result.status,
      get3wServerCapabilities: result.capabilities,
      get3wServerCheckedAt: Date.now(),
    }));

    return result.status === "connected" || result.status === "limited";
  };

  const reconnectGet3wServer = async () => {
    if (state.get3wReconnectBusy) return false;
    setStateField("get3wReconnectBusy", true);

    try {
      let hostInfo = state.get3wServerHostInfo;
      if (isDesktopRuntime()) {
        try {
          hostInfo = await get3wServerInfo() as Get3wServerInfo;
          mutateState((current) => ({ ...current, get3wServerHostInfo: hostInfo }));
        } catch {
          hostInfo = null;
          setStateField("get3wServerHostInfo", null);
        }
      }

      if (hostInfo?.clientToken?.trim() && options.startupPreference() !== "server") {
        const liveToken = hostInfo.clientToken.trim();
        const liveHostToken = hostInfo.hostToken?.trim() ?? "";
        const settings = state.get3wServerSettings;
        if (
          (settings.token?.trim() ?? "") !== liveToken ||
          (settings.hostToken?.trim() ?? "") !== liveHostToken
        ) {
          updateGet3wServerSettings({
            ...settings,
            token: liveToken,
            hostToken: liveHostToken || undefined,
          });
        }
      }

      const url = getBaseUrl().trim();
      const auth = getAuth();
      if (!url) {
        mutateState((current) => ({
          ...current,
          get3wServerStatus: "disconnected",
          get3wServerCapabilities: null,
          get3wServerCheckedAt: Date.now(),
        }));
        return false;
      }

      const result = await checkGet3wServer(url, auth.token, auth.hostToken);
      mutateState((current) => ({
        ...current,
        get3wServerStatus: result.status,
        get3wServerCapabilities: result.capabilities,
        get3wServerCheckedAt: Date.now(),
      }));
      return result.status === "connected" || result.status === "limited";
    } finally {
      setStateField("get3wReconnectBusy", false);
    }
  };

  async function ensureLocalGet3wServerClient(): Promise<Get3wServerClient | null> {
    const healthyClientFromInfo = async (
      info: Get3wServerInfo | null,
    ): Promise<Get3wServerClient | null> => {
      const baseUrl = info?.baseUrl?.trim() ?? "";
      const token = info?.clientToken?.trim() ?? "";
      if (!baseUrl || !token) return null;
      const candidate = createGet3wServerClient({
        baseUrl,
        token,
        hostToken: info?.hostToken?.trim() || undefined,
      });
      try {
        await candidate.health();
      } catch {
        return null;
      }
      return candidate;
    };

    const cached = await healthyClientFromInfo(state.get3wServerHostInfo);
    if (cached) {
      if (options.startupPreference() !== "server") {
        await reconnectGet3wServer();
      }
      return cached;
    }

    if (!isDesktopRuntime()) return null;

    // A store that has not observed the server yet (a fresh route mount)
    // must not treat it as dead: the restart below tears down the embedded
    // server AND its managed engine, killing every live run. Ask the desktop
    // bridge for the live server first and restart only when that running
    // server is genuinely unreachable.
    let hostInfo: Get3wServerInfo | null = null;
    try {
      hostInfo = await get3wServerInfo() as Get3wServerInfo;
      mutateState((current) => ({
        ...current,
        get3wServerHostInfo: hostInfo,
        get3wServerHostInfoReady: true,
      }));
    } catch {
      hostInfo = null;
    }
    const live = await healthyClientFromInfo(hostInfo);
    if (live) {
      if (options.startupPreference() !== "server") {
        await reconnectGet3wServer();
      }
      return live;
    }

    try {
      hostInfo = await get3wServerRestart({ diagnosticsCause: "connection-recovery" }) as Get3wServerInfo;
      mutateState((current) => ({ ...current, get3wServerHostInfo: hostInfo }));
    } catch {
      return null;
    }

    const baseUrl = hostInfo?.baseUrl?.trim() ?? "";
    const token = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";
    if (!baseUrl || !token) return null;

    if (options.startupPreference() !== "server") {
      await reconnectGet3wServer();
    }

    return createGet3wServerClient({
      baseUrl,
      token,
      hostToken: hostToken || undefined,
    });
  }

  refreshSnapshot();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => {
    if (!snapshot) throw new Error("Get3W server snapshot was not initialized.");
    return snapshot;
  };

  return {
    subscribe,
    getSnapshot,
    start,
    dispose,
    syncFromOptions,
    setGet3wServerSettings,
    updateGet3wServerSettings,
    resetGet3wServerSettings,
    checkGet3wServer,
    testGet3wServerConnection,
    reconnectGet3wServer,
    ensureLocalGet3wServerClient,
  };
}

export function useGet3wServerStoreSnapshot(store: Get3wServerStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

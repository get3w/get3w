import { useSyncExternalStore } from "react";
import { providerCredentialScope, useProviderCredentialHealth } from "./credential-health";

import { applyEdits, modify, parse } from "jsonc-parser";
import type {
  ProviderAuthAuthorization,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2/client";

import { t } from "../../../../i18n";
import { type DenUsableGatewayProvider } from "../../../../app/lib/den";

import { unwrap, waitForHealthy } from "../../../../app/lib/opencode";
import { readOpencodeConfig, writeOpencodeConfig, engineRestart } from "../../../../app/lib/desktop";
import { OpenworkServerError } from "../../../../app/lib/openwork-server";
import type {
  Client,
  ProviderListItem,
  WorkspaceDisplay,
} from "../../../../app/types";
import { isDesktopRuntime, safeStringify } from "../../../../app/utils";
import {
  compareProviders,
  filterProviderList,
} from "../../../../app/utils/providers";
import { getReactQueryClient } from "../../../infra/query-client";
import { ensureProviderCatalogQuery, ensureProviderListQuery } from "../../../infra/provider-list-query";
import type { OpenworkCloudProviderSyncSkippedProvider } from "../../../../app/lib/openwork-server";
import type { OpenworkServerStoreSnapshot } from "../openwork-server-store";

/**
 * The slice of the openwork-server store this store actually consumes.
 * The settings route passes the full store; the session route passes a
 * lightweight endpoint-backed adapter (previously forced through `as never`).
 */
export type ProviderAuthOpenworkServer = {
  getSnapshot: () => Pick<
    OpenworkServerStoreSnapshot,
    "openworkServerStatus" | "openworkServerClient"
  > & {
    openworkServerAuth?: { token?: string; hostToken?: string };
    openworkServerHostInfo?: { generation: number | null } | null;
    openworkServerCapabilities: { config?: { read?: boolean; write?: boolean }; providerSync?: boolean } | null;
  };
};

import { type CloudImportedProvider } from "../../../../app/cloud/import-state";
import { type GatewayConnectProvider } from "./cloud-provider-config";
import { dispatchNewProviders } from "../../../../app/lib/provider-events";

import { readManagedDisabledProviders, updateManagedDisabledProviders } from "../managed-engine-config";
import {
  DESKTOP_RESTRICTION_OPENCODE_PROVIDER_ID,
  isDesktopProviderBlocked,
  type DesktopAppRestrictionChecker,
} from "../../../../app/cloud/desktop-app-restrictions";
import { isProviderAddRestrictedByDesktopPolicy, isProviderAllowedByDesktopPolicy, type ModelEntitlementOption } from "./provider-policy";

type ProviderReturnFocusTarget = "none" | "composer";
type CloudProviderSyncReason =
  | "sign_in"
  | "app_launch"
  | "app_resume"
  | "model_picker_open"
  | "new_chat"
  | "settings_cloud_opened"
  | "manual";

let lastGlobalProviderDisposeRefreshAt = 0;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableConfigValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableConfigValue(value[key])]),
  );
}

function canonicalConfig(raw: string): string | null {
  const parsed: unknown = parse(raw);
  if (parsed === undefined && raw.trim()) return null;
  return JSON.stringify(stableConfigValue(parsed ?? {}));
}

function configsAreSemanticallyEqual(left: string, right: string): boolean {
  if (left === right) return true;
  const leftCanonical = canonicalConfig(left);
  const rightCanonical = canonicalConfig(right);
  return leftCanonical !== null && leftCanonical === rightCanonical;
}

export type ProviderAuthMethod = {
  type: "oauth" | "api" | "cloud";
  label: string;
  methodIndex?: number;
};

export type CloudProviderSyncError = {
  kind: "error" | "conflict" | "needs_credential" | "needs_server";
  message: string;
};

export type ProviderAuthProvider = {
  id: string;
  name: string;
  env: string[];
};

export type ProviderOAuthStartResult = {
  methodIndex: number;
  authorization: ProviderAuthAuthorization;
};

/**
 * Server-side sync facts the Cloud Providers settings rows derive from when
 * the local server owns provider sync: whether an engine reload is still owed
 * (materialized providers are not served yet) and which Den-granted providers
 * the server skipped, keyed by cloudProviderId. Null while the legacy
 * renderer-side import path owns the state (remote/hostless workspaces).
 */
export type CloudProviderServerSyncState = {
  lastRun?: { at: string | number; status: "applied" | "noop" | "failed" | "no_session"; message?: string } | null;
  lastVerifiedAt?: string | number | null;
  reloadPending: boolean;
  skippedProviders: Record<string, OpenworkCloudProviderSyncSkippedProvider>;
};

export type ProviderLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export type ProviderAuthStoreSnapshot = {
  providerLoadState: ProviderLoadState;
  gatewayUsageProviderScope?: number | null;
  providerAuthModalOpen: boolean;
  providerAuthBusy: boolean;
  providerAuthError: string | null;
  providerAuthMethods: Record<string, ProviderAuthMethod[]>;
  providerAuthPreferredProviderId: string | null;
  providerAuthProviders: ProviderAuthProvider[];
  importedCloudProviders: Record<string, CloudImportedProvider>;
  cloudProviderServerSync: CloudProviderServerSyncState | null;
  /**
   * The member's Gateway providers read straight from Den while the engine
   * owns the Gateway catalog (live provider sync). The server sync no longer
   * reports them then, so Settings would otherwise list none. null otherwise.
   */
  liveGatewayProviders: DenUsableGatewayProvider[] | null;
  lastSyncError: Record<string, CloudProviderSyncError>;
};

type CreateProviderAuthStoreOptions = {
  client: () => Client | null;
  providers: () => ProviderListItem[];
  providerDefaults: () => Record<string, string>;
  providerConnectedIds: () => string[];
  disabledProviders: () => string[];
  checkDesktopAppRestriction: DesktopAppRestrictionChecker;
  selectedWorkspaceDisplay: () => WorkspaceDisplay;
  providerBaseUrl: () => string;
  selectedWorkspaceRoot: () => string;
  runtimeWorkspaceId: () => string | null;
  ensureRuntimeWorkspaceId?: () => Promise<string | null | undefined>;
  openworkServer: ProviderAuthOpenworkServer;
  setProviders: (value: ProviderListItem[]) => void;
  setProviderDefaults: (value: Record<string, string>) => void;
  setProviderConnectedIds: (value: string[]) => void;
  setDisabledProviders: (value: string[]) => void;
  markOpencodeConfigReloadRequired: () => void;
  focusPromptSoon?: () => void;
};

type MutableState = {
  providerLoadState: ProviderLoadState;
  gatewayUsageProviderScope?: number | null;
  providerAuthModalOpen: boolean;
  providerAuthBusy: boolean;
  providerAuthError: string | null;
  providerAuthMethods: Record<string, ProviderAuthMethod[]>;
  providerAuthPreferredProviderId: string | null;
  providerAuthReturnFocusTarget: ProviderReturnFocusTarget;
  importedCloudProviders: Record<string, CloudImportedProvider>;
  cloudProviderServerSync: CloudProviderServerSyncState | null;
  /**
   * The member's Gateway providers read straight from Den while the engine
   * owns the Gateway catalog (live provider sync). The server sync no longer
   * reports them then, so Settings would otherwise list none. null otherwise.
   */
  liveGatewayProviders: DenUsableGatewayProvider[] | null;
  lastSyncError: Record<string, CloudProviderSyncError>;
};

export type ProviderAuthStore = ReturnType<typeof createProviderAuthStore>;

export function createProviderAuthStore(options: CreateProviderAuthStoreOptions) {
  const listeners = new Set<() => void>();

  let snapshot: ProviderAuthStoreSnapshot;
  let disposed = false;
  let started = false;
  let lastWorkspaceKey = "";

  let state: MutableState = {
    providerLoadState: { status: "idle", error: null },
    providerAuthModalOpen: false,
    providerAuthBusy: false,
    providerAuthError: null,
    providerAuthMethods: {},
    providerAuthPreferredProviderId: null,
    providerAuthReturnFocusTarget: "none",
    importedCloudProviders: {},
    cloudProviderServerSync: null,
    liveGatewayProviders: null,
    lastSyncError: {},
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
   };

  // Providers that are not connected yet, loaded only when the Connect modal
  // opens. The everyday provider list holds connected providers only.
  let providerCatalog: ProviderListItem[] = [];

  const getProviderAuthProviders = (): ProviderAuthProvider[] => {
    const merged = new Map<string, ProviderAuthProvider>();
    const restrictToCloud = options.checkDesktopAppRestriction({ restriction: "allowCustomProviders" });

    for (const provider of [...options.providers(), ...providerCatalog]) {
      const id = provider.id?.trim();
      if (!id || merged.has(id)) continue;
      if (
        !isProviderAllowedByDesktopPolicy({
          providerId: id,
          restrictToCloud,
          checkRestriction: options.checkDesktopAppRestriction,
        })
      ) {
        continue;
      }
      merged.set(id, {
        id,
        name: provider.name?.trim() || id,
        env: Array.isArray(provider.env) ? provider.env : [],
      });
    }


    return Array.from(merged.values()).toSorted(compareProviders);
  };

  const resolveOpenworkConfigTarget = async (mode: "read" | "write") => {
    const openworkSnapshot = options.openworkServer.getSnapshot();
    const openworkClient = openworkSnapshot.openworkServerClient;
    let openworkWorkspaceId = options.runtimeWorkspaceId()?.trim() || null;
    if (!openworkWorkspaceId && openworkSnapshot.openworkServerStatus === "connected" && openworkClient) {
      openworkWorkspaceId = (await options.ensureRuntimeWorkspaceId?.())?.trim() || null;
    }
    const hasOpenworkTarget =
      openworkSnapshot.openworkServerStatus === "connected" &&
      Boolean(openworkClient && openworkWorkspaceId);
    const canUseOpenworkServer =
      hasOpenworkTarget &&
      openworkSnapshot.openworkServerCapabilities?.config?.[mode] !== false;
    return {
      openworkClient,
      openworkWorkspaceId,
      hasOpenworkTarget,
      canUseOpenworkServer,
    };
  };

  const refreshSnapshot = () => {
    snapshot = {
      providerLoadState: state.providerLoadState,
      gatewayUsageProviderScope: null,
      providerAuthModalOpen: state.providerAuthModalOpen,
      providerAuthBusy: state.providerAuthBusy,
      providerAuthError: state.providerAuthError,
      providerAuthMethods: state.providerAuthMethods,
      providerAuthPreferredProviderId: state.providerAuthPreferredProviderId,
      providerAuthProviders: getProviderAuthProviders(),
      importedCloudProviders: state.importedCloudProviders,
      cloudProviderServerSync: state.cloudProviderServerSync,
      liveGatewayProviders: state.liveGatewayProviders,
      lastSyncError: state.lastSyncError,
    };
  };

  const mutateState = (updater: (current: MutableState) => MutableState) => {
    state = updater(state);
    refreshSnapshot();
    emitChange();
  };

  const setStateField = <K extends keyof MutableState>(
    key: K,
    value: MutableState[K],
  ) => {
    if (Object.is(state[key], value)) return;
    mutateState((current) => ({ ...current, [key]: value }));
  };

  // Retired organization APIs keep empty read results for older consumers.
  // Personal and Get3W-managed credentials use the local engine/native bridge.
  const refreshImportedCloudProviders = async (_options?: { strict?: boolean }): Promise<Record<string, CloudImportedProvider>> => ({});

  const readProjectConfigFile = async () => {
    const root = options.selectedWorkspaceRoot().trim();
    const isLocalWorkspace =
      options.selectedWorkspaceDisplay().workspaceType === "local";
    const { openworkClient, openworkWorkspaceId, hasOpenworkTarget, canUseOpenworkServer } =
      await resolveOpenworkConfigTarget("read");

    if (canUseOpenworkServer && openworkClient && openworkWorkspaceId) {
      return await openworkClient.readOpencodeConfigFile(openworkWorkspaceId, "project");
    }

    if (hasOpenworkTarget) {
      throw new Error("Get3W server config API is unavailable for this workspace.");
    }

    if (isLocalWorkspace && isDesktopRuntime() && root) {
      return await readOpencodeConfig("project", root);
    }

    return null;
  };

  const writeProjectConfigFile = async (content: string, isCurrent = () => true) => {
    const root = options.selectedWorkspaceRoot().trim();
    const isLocalWorkspace =
      options.selectedWorkspaceDisplay().workspaceType === "local";
    const { openworkClient, openworkWorkspaceId, hasOpenworkTarget, canUseOpenworkServer } =
      await resolveOpenworkConfigTarget("write");
    if (!isCurrent()) return false;

    if (canUseOpenworkServer && openworkClient && openworkWorkspaceId) {
      const result = await openworkClient.writeOpencodeConfigFile(
        openworkWorkspaceId,
        "project",
        content,
      ) as { ok: boolean; stderr?: string; stdout?: string };
      if (!result.ok) {
        throw new Error(result.stderr || result.stdout || "Failed to write opencode.jsonc");
      }
      return true;
    }

    if (hasOpenworkTarget) {
      throw new Error("Get3W server config API is unavailable for this workspace.");
    }

    if (isLocalWorkspace && isDesktopRuntime() && root) {
      const result = await writeOpencodeConfig("project", root, content) as { ok: boolean; stderr?: string; stdout?: string };
      if (!result.ok) {
        throw new Error(result.stderr || result.stdout || "Failed to write opencode.jsonc");
      }
      return true;
    }

    return false;
  };

  /**
   * Upsert/delete cloud-managed provider entries in the workspace's runtime
   * opencode config (server-side SQLite merged into OPENCODE_CONFIG). Record
   * values upsert, explicit `null` deletes — per-key on the server, so there
   * is no read-modify-write race and no edit of the user's opencode.jsonc.
   */
  const updateProjectConfigFile = async (
    updater: (raw: string) => string,
    fallbackUpdate?: (config: Record<string, unknown>) => Record<string, unknown>,
    isCurrent = () => true,
  ) => {
    const configFile = await readProjectConfigFile() as { content?: string } | null;
    if (!isCurrent()) return false;
    if (configFile) {
      const raw = configFile.content?.trim()
        ? configFile.content
        : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
      const next = updater(raw);
      if (configsAreSemanticallyEqual(raw, next)) {
        return false;
      }
      return await writeProjectConfigFile(next, isCurrent);
    }

    if (!fallbackUpdate) {
      return false;
    }

    const c = options.client();
    const openworkSnapshot = options.openworkServer.getSnapshot();
    const workspaceId = options.runtimeWorkspaceId();
    const workspaceType = options.selectedWorkspaceDisplay().workspaceType;
    const canUseManagedRuntime = Boolean(openworkSnapshot.openworkServerClient && workspaceId?.trim() && workspaceType === "local");
    if (!c && !canUseManagedRuntime) {
      throw new Error(t("providers.not_connected"));
    }
    const config = c ? unwrap(await c.config.get()) : {};
    const next = fallbackUpdate(config);
    await updateManagedDisabledProviders({
      opencodeClient: c,
      openworkClient: openworkSnapshot.openworkServerClient,
      workspaceId,
      workspaceType,
      disabledProviders: next.disabled_providers,
      currentConfig: config,
      removeFallbackKeyWhenEmpty: true,
    });
    return true;
  };

  const normalizeDisabledProviders = (value: unknown) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter(Boolean),
          ),
        ]
      : [];

  const formatConfigWithProviderDisabledState = (
    raw: string,
    providerId: string,
    disabled: boolean,
  ) => {
    const resolvedProviderId = providerId.trim();
    let updated = raw.trim()
      ? raw
      : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
    const parsed = parse(updated) as Record<string, unknown> | undefined;
    const currentDisabled = normalizeDisabledProviders(parsed?.disabled_providers);
    const nextDisabled = disabled
      ? [...currentDisabled.filter((entry) => entry !== resolvedProviderId), resolvedProviderId]
      : currentDisabled.filter((entry) => entry !== resolvedProviderId);

    const disabledEdits = modify(
      updated,
      ["disabled_providers"],
      nextDisabled.length ? nextDisabled : undefined,
      { formattingOptions: { insertSpaces: true, tabSize: 2 } },
    );
    updated = applyEdits(updated, disabledEdits);
    return updated.endsWith("\n") ? updated : `${updated}\n`;
  };

  const ensureProjectProviderDisabledState = async (
    providerId: string,
    disabled: boolean,
  ) => {
    const resolvedProviderId = providerId.trim();
    if (!resolvedProviderId) {
      throw new Error(t("providers.provider_id_required"));
    }

    // Already in the requested state: keep the list as is (order included), so
    // a merged read in another order never looks like a change.
    const nextFrom = (currentDisabled: string[]) => currentDisabled.includes(resolvedProviderId) === disabled
      ? currentDisabled
      : disabled
        ? [...currentDisabled, resolvedProviderId]
        : currentDisabled.filter((entry) => entry !== resolvedProviderId);
    const unchanged = (currentDisabled: string[], nextDisabled: string[]) =>
      nextDisabled.length === currentDisabled.length &&
      nextDisabled.every((entry, index) => entry === currentDisabled[index]);

    // Prefer runtime OPENCODE_CONFIG injection (server SQLite) so OpenCode Zen
    // and other built-in/env-backed providers can be disabled without editing
    // the user's opencode.jsonc. Fall back to project config only when the
    // managed runtime endpoint is unavailable.
    const c = options.client();
    const openworkSnapshot = options.openworkServer.getSnapshot();
    const workspaceId = options.runtimeWorkspaceId();
    const workspaceType = options.selectedWorkspaceDisplay().workspaceType;
    // Before the first workspace exists the client reaches the engine root,
    // whose config belongs to no workspace a person will open. Leave project
    // provider rules alone until there is a workspace to hold them.
    if (!workspaceId?.trim() && !options.selectedWorkspaceRoot().trim()) {
      return false;
    }
    const canUseManagedRuntime = Boolean(
      openworkSnapshot.openworkServerClient && workspaceId?.trim() && workspaceType === "local",
    );

    if (canUseManagedRuntime || c) {
      // Each write replaces the whole list. This store's copy can be stale (the
      // chat route disables OpenCode Zen on every mount, after Settings may
      // have disconnected another provider), and writing it back re-enabled
      // that provider (ENG-994). Build on the current list.
      const currentDisabled = normalizeDisabledProviders(await readManagedDisabledProviders({
        opencodeClient: c,
        openworkClient: openworkSnapshot.openworkServerClient,
        workspaceId,
        workspaceType,
      }).catch(() => options.disabledProviders()));
      const nextDisabled = nextFrom(currentDisabled);
      if (unchanged(currentDisabled, nextDisabled)) {
        if (!unchanged(normalizeDisabledProviders(options.disabledProviders()), currentDisabled)) {
          options.setDisabledProviders(currentDisabled);
        }
        return false;
      }
      const result = await updateManagedDisabledProviders({
        opencodeClient: c,
        openworkClient: openworkSnapshot.openworkServerClient,
        workspaceId,
        workspaceType,
        disabledProviders: nextDisabled,
        removeFallbackKeyWhenEmpty: true,
        markReloadRequired: () => options.markOpencodeConfigReloadRequired(),
      });
      options.setDisabledProviders(result.disabledProviders);
      options.markOpencodeConfigReloadRequired();
      refreshSnapshot();
      emitChange();
      return true;
    }

    const currentDisabled = normalizeDisabledProviders(options.disabledProviders());
    const nextDisabled = nextFrom(currentDisabled);
    if (unchanged(currentDisabled, nextDisabled)) return false;

    const updatedConfig = await updateProjectConfigFile(
      (raw) => formatConfigWithProviderDisabledState(raw, resolvedProviderId, disabled),
      (config) => {
        const nextConfig = { ...config };
        if (nextDisabled.length) {
          nextConfig.disabled_providers = nextDisabled;
        } else {
          delete nextConfig.disabled_providers;
        }
        return nextConfig;
      },
    );

    if (!updatedConfig) {
      throw new Error("Could not update disabled providers for this workspace.");
    }

    options.setDisabledProviders(nextDisabled);
    options.markOpencodeConfigReloadRequired();
    refreshSnapshot();
    emitChange();
    return true;
  };

  const assertProviderAllowedByDesktopPolicy = (providerId: string) => {
    const restrictToCloud = options.checkDesktopAppRestriction({ restriction: "allowCustomProviders" });
    if (
      isDesktopProviderBlocked({
        providerId,
        checkRestriction: options.checkDesktopAppRestriction,
      })
    ) {
      throw new Error(`${providerId} is blocked by your organization desktop policy.`);
    }
    if (
      !isProviderAllowedByDesktopPolicy({
        providerId,
        restrictToCloud,
        checkRestriction: options.checkDesktopAppRestriction,
      })
    ) {
      throw new Error(t("providers.custom_providers_disabled"));
    }
  };

  // Sweep all cloud-managed provider entries (keys matching /^lpr_/) from
  // both the runtime config and opencode.jsonc, regardless of
  // importedCloudProviders state. Returns the list of provider IDs that were
  // removed so callers can also clear their auth credentials.
  // Track whether the provider list has been loaded at least once.
  // The first load (app startup) populates the initial state — we don't
  // want to fire "new provider" events for providers that were already
  // there. After the first load, any new provider IS genuinely new.
  let providerListInitialized = false;

  const applyProviderListState = (value: ProviderListResponse, opts?: { suppressNewProviderEvent?: boolean }) => {
    const prevConnected = new Set(options.providerConnectedIds());
    const nextConnected = value.connected ?? [];
    const nextAll = value.all ?? [];
    options.setProviders(nextAll);
    options.setProviderDefaults(value.default ?? {});
    options.setProviderConnectedIds(nextConnected);
    refreshSnapshot();
    emitChange();

    if (!providerListInitialized) {
      providerListInitialized = true;
      return;
    }

    // Detect newly connected providers and fire a global event so
    // the NewProvidersListener records a notification — regardless of
    // which route is active.
    if (!opts?.suppressNewProviderEvent) {
      const newIds = nextConnected.filter((id) => !prevConnected.has(id));
      if (newIds.length > 0) {
        const infos = newIds.map((id) => {
          const provider = nextAll.find((p) => (p.id ?? "") === id);
          const models = provider?.models ?? {};
          const firstModelId = Object.keys(models)[0];
          return {
            id,
            name: provider?.name ?? id,
            providerId: id,
            firstModelId,
            firstModelName: firstModelId
              ? (models[firstModelId]?.name ?? firstModelId)
              : undefined,
          };
        });
        dispatchNewProviders({ providers: infos, source: "local_config" });
      }
    }
  };

  const removeProviderFromState = (providerId: string) => {
    const resolved = providerId.trim();
    if (!resolved) return;
    options.setProviders(options.providers().filter((provider) => provider.id !== resolved));
    options.setProviderConnectedIds(
      options.providerConnectedIds().filter((id) => id !== resolved),
    );
    options.setProviderDefaults(
      Object.fromEntries(
        Object.entries(options.providerDefaults()).filter(([id]) => id !== resolved),
      ),
    );
    refreshSnapshot();
    emitChange();
  };

  const assertNoClientError = (result: unknown) => {
    const maybe = result as { error?: unknown } | null | undefined;
    if (!maybe || maybe.error === undefined) return;
    throw new Error(describeProviderError(maybe.error, t("providers.request_failed")));
  };

  const removeProviderAuthCredentials = async (providerId: string) => {
    const workspaceId = options.runtimeWorkspaceId();
    if (workspaceId && options.providerBaseUrl().trim()) useProviderCredentialHealth.getState().bindWorkspace(workspaceId, providerCredentialScope(options.providerBaseUrl()));
    const changed = () => { if (workspaceId) useProviderCredentialHealth.getState().changed(workspaceId, providerId); };
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }

    const authClient = c.auth as unknown as {
      remove?: (options: { providerID: string }) => Promise<unknown>;
      set?: (options: { providerID: string; auth: unknown }) => Promise<unknown>;
    };
    if (typeof authClient.remove === "function") {
      const result = await authClient.remove({ providerID: providerId });
      assertNoClientError(result);
      changed();
      return;
    }

    const rawClient = (c as unknown as {
      client?: { delete?: (options: { url: string }) => Promise<unknown> };
    }).client;
    if (rawClient?.delete) {
      assertNoClientError(await rawClient.delete({ url: `/auth/${encodeURIComponent(providerId)}` }));
      changed();
      return;
    }

    if (typeof authClient.set === "function") {
      const result = await authClient.set({ providerID: providerId, auth: null });
      assertNoClientError(result);
      changed();
      return;
    }

    throw new Error(t("providers.removal_unsupported"));
  };

  const describeProviderError = (error: unknown, fallback: string) => {
    const readString = (value: unknown, max = 700) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.length <= max) return trimmed;
      return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
    };

    const records: Record<string, unknown>[] = [];
    const root = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
    if (root) {
      records.push(root);
      if (root.data && typeof root.data === "object") {
        records.push(root.data as Record<string, unknown>);
      }
      if (root.cause && typeof root.cause === "object") {
        const cause = root.cause as Record<string, unknown>;
        records.push(cause);
        if (cause.data && typeof cause.data === "object") {
          records.push(cause.data as Record<string, unknown>);
        }
      }
    }

    const firstString = (keys: string[]) => {
      for (const record of records) {
        for (const key of keys) {
          const value = readString(record[key]);
          if (value) return value;
        }
      }
      return null;
    };

    const firstNumber = (keys: string[]) => {
      for (const record of records) {
        for (const key of keys) {
          const value = record[key];
          if (typeof value === "number" && Number.isFinite(value)) return value;
        }
      }
      return null;
    };

    const status = firstNumber(["statusCode", "status"]);
    const provider = firstString(["providerID", "providerId", "provider"]);
    const code = firstString(["code", "errorCode"]);
    const response = firstString(["responseBody", "body", "response"]);
    const raw =
      (error instanceof Error ? readString(error.message) : null) ||
      firstString(["message", "detail", "reason", "error"]) ||
      (typeof error === "string" ? readString(error) : null);

    const generic = raw && /^unknown\s+error$/i.test(raw);
    const heading = (() => {
      if (status === 401 || status === 403) return t("providers.auth_failed");
      if (status === 429) return t("providers.rate_limit_exceeded");
      if (provider) return t("providers.provider_error", { provider });
      return fallback;
    })();

    const lines = [heading];
    if (raw && !generic && raw !== heading) lines.push(raw);
    if (status && !heading.includes(String(status))) lines.push(`Status: ${status}`);
    if (provider && !heading.includes(provider)) lines.push(`Provider: ${provider}`);
    if (code) lines.push(`Code: ${code}`);
    if (response) lines.push(`Response: ${response}`);
    if (lines.length > 1) return lines.join("\n");

    if (raw && !generic) return raw;
    if (error && typeof error === "object") {
      const serialized = safeStringify(error);
      if (serialized && serialized !== "{}") return serialized;
    }
    return fallback;
  };

  const buildProviderAuthMethods = (
    methods: Record<string, ProviderAuthMethod[]>,
    availableProviders: ProviderAuthProvider[],
  ) => {
    const restrictToCloud = options.checkDesktopAppRestriction({ restriction: "allowCustomProviders" });
    const merged = Object.fromEntries(
      Object.entries(methods ?? {}).map(([id, providerMethods]) => [
        id,
        (providerMethods ?? []).map((method, methodIndex) => ({
          ...method,
          methodIndex,
        })),
      ]),
    ) as Record<string, ProviderAuthMethod[]>;

    for (const provider of availableProviders ?? []) {
      const id = provider.id?.trim();
      if (!id) continue;
      if (
        !isProviderAllowedByDesktopPolicy({
          providerId: id,
          restrictToCloud,
          checkRestriction: options.checkDesktopAppRestriction,
        })
      ) {
        continue;
      }
      if (!Array.isArray(provider.env) || provider.env.length === 0) continue;
      const existing = merged[id] ?? [];
      if (existing.some((method) => method.type === "api")) continue;
      merged[id] = [...existing, { type: "api", label: t("providers.api_key_label") }];
    }

    const availableProvidersById = new Map((availableProviders ?? []).map((provider) => [provider.id, provider]));
    for (const [id, providerMethods] of Object.entries(merged)) {
      if (
        !isProviderAllowedByDesktopPolicy({
          providerId: id,
          restrictToCloud,
          checkRestriction: options.checkDesktopAppRestriction,
        })
      ) {
        delete merged[id];
        continue;
      }
      const provider = availableProvidersById.get(id);
      const normalizedId = id.trim().toLowerCase();
      const normalizedName = provider?.name?.trim().toLowerCase() ?? "";
      const isOpenAiProvider = normalizedId === "openai" || normalizedName === "openai";
      if (!isOpenAiProvider) continue;
      merged[id] = providerMethods.filter((method) => {
        if (method.type !== "oauth") return true;
        // Browser mode can't complete the ChatGPT sign-in flows, so only API keys
        // are offered off-desktop.
        if (!isDesktopRuntime()) return false;
        const label = method.label.toLowerCase();
        return !/headless|device/.test(label);
      });
    }

    return merged;
  };

  // Best effort: without the catalog the modal still offers connected
  // providers, sign-in methods and cloud providers.
  const loadProviderCatalog = async (client: Client) => {
    try {
      const catalog = filterProviderList(
        await ensureProviderCatalogQuery(getReactQueryClient(), {
          client,
          baseUrl: options.providerBaseUrl(),
          directory: options.selectedWorkspaceRoot(),
        }),
        options.disabledProviders(),
      );
      providerCatalog = catalog.all ?? [];
    } catch {
      providerCatalog = [];
    }
  };

  const loadProviderAuthMethods = async () => {
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }
    const [methods] = await Promise.all([
      c.provider.auth().then(unwrap),
      loadProviderCatalog(c),
    ]);
    return buildProviderAuthMethods(
      methods as Record<string, ProviderAuthMethod[]>,
      getProviderAuthProviders(),
    );
  };

  async function startProviderAuth(
    providerId?: string,
    methodIndex?: number,
  ): Promise<ProviderOAuthStartResult> {
    setStateField("providerAuthError", null);
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }
    try {
      const cachedMethods = state.providerAuthMethods;
      const authMethods = Object.keys(cachedMethods).length
        ? cachedMethods
        : await loadProviderAuthMethods();
      const providerIds = Object.keys(authMethods).sort();
      if (!providerIds.length) {
        throw new Error(t("providers.no_providers_available"));
      }

      const resolved = providerId?.trim() ?? "";
      if (!resolved) {
        throw new Error(t("providers.provider_id_required"));
      }
      assertProviderAllowedByDesktopPolicy(resolved);

      const methods = authMethods[resolved];
      if (!methods || !methods.length) {
        throw new Error(`${t("providers.unknown_provider")}: ${resolved}`);
      }

      const oauthIndex =
        methodIndex !== undefined
          ? methodIndex
          : methods.find((method) => method.type === "oauth")?.methodIndex ?? -1;
      if (oauthIndex === -1) {
        throw new Error(
          `${t("providers.no_oauth_prefix")} ${resolved}. ${t("providers.use_api_key_suffix")}`,
        );
      }

      const selectedMethod = methods.find((method) => method.methodIndex === oauthIndex);
      if (!selectedMethod || selectedMethod.type !== "oauth") {
        throw new Error(`${t("providers.not_oauth_flow_prefix")} ${resolved}.`);
      }

      const auth = unwrap(
        await c.provider.oauth.authorize({ providerID: resolved, method: oauthIndex }),
      );
      return { methodIndex: oauthIndex, authorization: auth };
    } catch (error) {
      const message = describeProviderError(error, t("providers.connect_failed"));
      setStateField("providerAuthError", message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  const isIncompatiblePermissionsConfigError = (error: unknown, depth = 0): boolean => {
    if (depth > 5) return false;
    if (typeof error === "string") {
      try {
        const parsed: unknown = JSON.parse(error);
        return isIncompatiblePermissionsConfigError(parsed, depth + 1);
      } catch {
        return error.includes("V2 permissions are not supported by OpenCode V1");
      }
    }
    if (!isRecord(error)) return false;
    return isIncompatiblePermissionsConfigError(error.message, depth + 1)
      || isIncompatiblePermissionsConfigError(error.data, depth + 1)
      || (Array.isArray(error.issues) && error.issues.some(
        (issue) => isRecord(issue) && isIncompatiblePermissionsConfigError(issue.message, depth + 1),
      ));
  };

  let providerRefreshGeneration = 0;

  async function refreshProviders(
    optionsArg?: {
      dispose?: boolean;
      force?: boolean;
      /**
       * The caller just rewrote engine config (for example disabled_providers).
       * Reload even inside the 10s dispose throttle; otherwise the read below
       * returns the pre-change config and undoes the change in the UI.
       */
      configChanged?: boolean;
    },
    isCurrent = () => !disposed,
  ) {
    const c = options.client();
    if (!c || !isCurrent()) return null;
    const generation = ++providerRefreshGeneration;
    const baseUrl = options.providerBaseUrl();
    const directory = options.selectedWorkspaceRoot();
    const isRefreshCurrent = () => !disposed && isCurrent()
      && generation === providerRefreshGeneration
      && baseUrl === options.providerBaseUrl()
      && directory === options.selectedWorkspaceRoot();
    const force = Boolean(optionsArg?.dispose || optionsArg?.force || state.providerLoadState.error);
    setStateField("providerLoadState", { status: "loading", error: state.providerLoadState.error });

    const serverClient = options.openworkServer.getSnapshot().openworkServerClient;
    const liveCatalog = optionsArg?.dispose && serverClient
      ? await serverClient.getEngineV2PreviewStatus().then(status => status.enabled && status.chatRouting).catch(() => false)
      : false;
    if (optionsArg?.dispose && !liveCatalog) {
      const now = Date.now();
      const shouldDispose = Boolean(optionsArg?.configChanged)
        || now - lastGlobalProviderDisposeRefreshAt >= 10_000;
      const shouldUseServerReload = !(
        isDesktopRuntime() && options.selectedWorkspaceDisplay().workspaceType === "local"
      );
      // Prefer the Get3W server engine reload: it disposes the engine AND
      // re-registers runtime-DB MCPs, so non-primary workspaces and pending
      // changes are picked up instead of silently dropping (toggles "turn
      // off").
      let reloaded = false;
      if (shouldDispose) {
        lastGlobalProviderDisposeRefreshAt = now;
        if (shouldUseServerReload) {
          try {
            const openworkSnapshot = options.openworkServer.getSnapshot();
            const openworkClient = openworkSnapshot.openworkServerClient;
            if (openworkSnapshot.openworkServerStatus === "connected" && openworkClient) {
              const workspaceId =
                options.runtimeWorkspaceId()?.trim() ||
                (await options.ensureRuntimeWorkspaceId?.())?.trim() ||
                "";
              if (workspaceId) {
                try {
                  await openworkClient.reloadEngine(workspaceId);
                } catch (error) {
                  const unreachable =
                    error instanceof OpenworkServerError && error.code === "opencode_engine_unreachable";
                  if (!unreachable || !isDesktopRuntime()) {
                    throw error;
                  }
                  await engineRestart({ diagnosticsCause: "provider-auth" });
                }
                reloaded = true;
              }
            }
          } catch {
            // fall back to a direct engine dispose below
          }
        }

        if (!reloaded) {
          try {
            unwrap(await c.instance.dispose());
          } catch {
            // ignore dispose failures and try reading current state anyway
          }
        }
      }

      try {
        await waitForHealthy(options.client() ?? c, { timeoutMs: 8000, pollMs: 250 });
      } catch {
        // ignore health wait failures and still attempt provider reads
      }
    }

    if (!isRefreshCurrent()) return null;
    const activeClient = options.client() ?? c;
    try {
      const disabledProviders = await readManagedDisabledProviders({
        opencodeClient: activeClient,
        openworkClient: options.openworkServer.getSnapshot().openworkServerClient,
        workspaceId: options.runtimeWorkspaceId(),
        workspaceType: options.selectedWorkspaceDisplay().workspaceType,
      });
      if (!isRefreshCurrent()) return null;
      const updated = filterProviderList(
        await ensureProviderListQuery(getReactQueryClient(), {
          client: activeClient,
          baseUrl,
          directory,
          force,
        }),
        disabledProviders,
      );
      if (!isRefreshCurrent()) return null;
      options.setDisabledProviders(disabledProviders);
      applyProviderListState(updated);
      setStateField("providerLoadState", { status: "ready", error: null });
      return updated;
    } catch (error) {
      if (isRefreshCurrent()) {
        setStateField("providerLoadState", {
          status: "error",
          error: t(isIncompatiblePermissionsConfigError(error)
            ? "settings.provider_load_incompatible_permissions"
            : "settings.provider_load_error"),
        });
      }
      return null;
    }
  }

  async function completeProviderAuthOAuth(
    providerId: string,
    methodIndex: number,
    code?: string,
  ) {
    setStateField("providerAuthError", null);
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }

    const resolved = providerId?.trim();
    if (!resolved) {
      throw new Error(t("providers.provider_id_required"));
    }
    assertProviderAllowedByDesktopPolicy(resolved);

    if (!Number.isInteger(methodIndex) || methodIndex < 0) {
      throw new Error(t("providers.oauth_method_required"));
    }

    const waitForProviderConnection = async (timeoutMs = 15000, pollMs = 2000) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        try {
          const updated = await refreshProviders({ dispose: true });
          const connected = new Set(updated?.connected ?? []);
          if (connected.has(resolved)) {
            return true;
          }
        } catch {
          // ignore and retry
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      return false;
    };

    const isPendingOauthError = (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error ?? "");
      return /request timed out/i.test(text) || /ProviderAuthOauthMissing/i.test(text);
    };

    try {
      if (resolved.toLowerCase() === DESKTOP_RESTRICTION_OPENCODE_PROVIDER_ID) {
        await ensureProjectProviderDisabledState(resolved, false);
      }
      const trimmedCode = code?.trim();
      const workspaceId = options.runtimeWorkspaceId();
      const result = await c.provider.oauth.callback({
        providerID: resolved,
        method: methodIndex,
        code: trimmedCode || undefined,
      });
      assertNoClientError(result);
      if (workspaceId) useProviderCredentialHealth.getState().changed(workspaceId, resolved);
      const updated = await refreshProviders({ dispose: true });
      const connectedNow = Array.isArray(updated?.connected) && updated.connected.includes(resolved);
      if (connectedNow) {
        return { connected: true, message: `${t("status.connected")} ${resolved}` };
      }
      const connected = await waitForProviderConnection();
      if (connected) {
        return { connected: true, message: `${t("status.connected")} ${resolved}` };
      }
      return { connected: false, pending: true };
    } catch (error) {
      if (isPendingOauthError(error)) {
        const updated = await refreshProviders({ dispose: true });
        if (Array.isArray(updated?.connected) && updated.connected.includes(resolved)) {
          return { connected: true, message: `${t("status.connected")} ${resolved}` };
        }
        const connected = await waitForProviderConnection();
        if (connected) {
          return { connected: true, message: `${t("status.connected")} ${resolved}` };
        }
        return { connected: false, pending: true };
      }
      const message = describeProviderError(error, t("providers.oauth_failed"));
      setStateField("providerAuthError", message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async function submitProviderApiKey(providerId: string, apiKey: string) {
    setStateField("providerAuthError", null);
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }

    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error(t("providers.api_key_required"));
    }
    assertProviderAllowedByDesktopPolicy(providerId);

    setStateField("providerAuthBusy", true);
    try {
      if (providerId.trim().toLowerCase() === DESKTOP_RESTRICTION_OPENCODE_PROVIDER_ID) {
        await ensureProjectProviderDisabledState(providerId, false);
      }
      const workspaceId = options.runtimeWorkspaceId();
      assertNoClientError(await c.auth.set({ providerID: providerId, auth: { type: "api", key: trimmed } }));
      if (workspaceId) useProviderCredentialHealth.getState().changed(workspaceId, providerId);
      await refreshProviders({ dispose: true });
      // A configured provider can already be listed before a key is saved.
      // Its connected IDs then stay identical, but its engine availability
      // changed; do not leave the old skipped-provider state cached.
      await getReactQueryClient().invalidateQueries({ queryKey: ["local-provider-engine-states"] });
      return `${t("status.connected")} ${providerId}`;
    } catch (error) {
      const message = describeProviderError(error, t("providers.save_api_key_failed"));
      setStateField("providerAuthError", message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setStateField("providerAuthBusy", false);
    }
  }

  const retiredOrganizationProvider = () => {
    throw new Error(t("providers.organization_unavailable"));
  };

  async function connectCloudProvider(_id: string): Promise<string> { return retiredOrganizationProvider(); }
  async function removeCloudProvider(_id: string): Promise<string> { return retiredOrganizationProvider(); }
  function isGatewayModelAvailable(_provider: GatewayConnectProvider, _model: { providerID: string; modelID: string }) { return false; }
  async function startGatewayProviderOAuth(_id: string, _credentialSetId?: string, _signal?: AbortSignal): Promise<{ authorizationUrl: string }> { return retiredOrganizationProvider(); }
  async function runCloudProviderSync(_reason: CloudProviderSyncReason): Promise<void | { outcome: "handled_server_side" | "handled_live" }> {}

  async function disconnectProvider(providerId: string) {
    setStateField("providerAuthError", null);
    const c = options.client();
    if (!c) {
      throw new Error(t("providers.not_connected"));
    }

    const resolved = providerId.trim();
    if (!resolved) {
      throw new Error(t("providers.provider_id_required"));
    }

    const trackedImport = Object.values(state.importedCloudProviders).find(
      (entry) => entry.providerId === resolved,
    );
    if (trackedImport) {
      return await removeCloudProvider(trackedImport.cloudProviderId);
    }

    const workspaceKey = currentWorkspaceKey();
    const baseUrl = options.providerBaseUrl();
    const isCurrentWorkspace = () => !disposed
      && workspaceKey === currentWorkspaceKey()
      && baseUrl === options.providerBaseUrl();
    const requireDiscovery = (updated: ProviderListResponse | null, requireDisconnected = false) => {
      if (!isCurrentWorkspace() || !updated || !Array.isArray(updated.all) || !Array.isArray(updated.connected)
        || (requireDisconnected && updated.connected.includes(resolved))) {
        throw new Error(t("providers.disconnect_unverified"));
      }
      return updated;
    };

    try {
      // OpenCode Zen is built-in / env-backed. Credential removal alone leaves
      // it connected — disable it via runtime OPENCODE_CONFIG injection.
      if (resolved.toLowerCase() === DESKTOP_RESTRICTION_OPENCODE_PROVIDER_ID) {
        try {
          await removeProviderAuthCredentials(resolved);
        } catch {
          // Zen may have no stored credentials; disable still applies.
        }
        if (!isCurrentWorkspace()) throw new Error(t("providers.disconnect_unverified"));
        const configChanged = await ensureProjectProviderDisabledState(resolved, true);
        requireDiscovery(await refreshProviders({ dispose: true, configChanged }, isCurrentWorkspace), true);
        removeProviderFromState(resolved);
        return `${t("providers.disconnected_prefix")} ${resolved}`;
      }

      await removeProviderAuthCredentials(resolved);
      const updated = requireDiscovery(await refreshProviders({ dispose: true }, isCurrentWorkspace));
      if (updated.connected.includes(resolved)) {
        const stillConnected = updated.all.find((provider) => provider.id === resolved);
        if (stillConnected && stillConnected.source !== "env") {
          // The provider definition lives in an opencode config file (for
          // example ~/.config/opencode/opencode.json), so credential removal
          // alone can never disconnect it. Disable it via disabled_providers,
          // exactly like the built-in OpenCode Zen branch above, instead of
          // leaving the Disconnect button a silent no-op.
          const configChanged = await ensureProjectProviderDisabledState(resolved, true);
          requireDiscovery(await refreshProviders({ dispose: true, configChanged }, isCurrentWorkspace), true);
          removeProviderFromState(resolved);
          return `${t("providers.disconnected_prefix")} ${resolved}`;
        }
        // Provider is still connected via env var. Just remove stored
        // credentials; the environment stays operator-owned, so do NOT add
        // it to disabled_providers.
        return `Removed stored credentials for ${resolved}${t("providers.still_connected_suffix")}`;
      }
      removeProviderFromState(resolved);
      return `${t("providers.disconnected_prefix")} ${resolved}`;
    } catch (error) {
      const message = describeProviderError(error, t("providers.disconnect_failed"));
      setStateField("providerAuthError", message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  /**
   * Undo a Disconnect that hid a provider through `disabled_providers` (for
   * example OpenCode Zen, which has no credentials to remove). Once hidden the
   * engine drops it from every list, so this is the only way back in the UI.
   */
  async function enableProvider(providerId: string) {
    setStateField("providerAuthError", null);
    const resolved = providerId.trim();
    if (!resolved) {
      throw new Error(t("providers.provider_id_required"));
    }
    assertProviderAllowedByDesktopPolicy(resolved);
    const workspaceKey = currentWorkspaceKey();
    const baseUrl = options.providerBaseUrl();
    const isCurrentWorkspace = () => !disposed
      && workspaceKey === currentWorkspaceKey()
      && baseUrl === options.providerBaseUrl();
    try {
      const configChanged = await ensureProjectProviderDisabledState(resolved, false);
      await refreshProviders({ dispose: true, configChanged }, isCurrentWorkspace);
      return `${t("providers.enabled_prefix")} ${resolved}`;
    } catch (error) {
      const message = describeProviderError(error, t("providers.enable_failed"));
      setStateField("providerAuthError", message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  function isProviderAddRestricted(providerId?: string | null) {
    return isProviderAddRestrictedByDesktopPolicy({
      providerId,
      checkRestriction: options.checkDesktopAppRestriction,
    });
  }

  async function openProviderAuthModal(optionsArg?: {
    returnFocusTarget?: ProviderReturnFocusTarget;
    preferredProviderId?: string;
  }) {
    if (isProviderAddRestricted(optionsArg?.preferredProviderId)) {
      const message = t("providers.custom_providers_disabled");
      mutateState((current) => ({
        ...current,
        providerAuthReturnFocusTarget: "none",
        providerAuthPreferredProviderId: null,
        providerAuthBusy: false,
        providerAuthModalOpen: false,
        providerAuthError: message,
      }));
      throw new Error(message);
    }

    mutateState((current) => ({
      ...current,
      providerAuthReturnFocusTarget: optionsArg?.returnFocusTarget ?? "none",
      providerAuthPreferredProviderId: optionsArg?.preferredProviderId?.trim() || null,
      providerAuthBusy: true,
      providerAuthError: null,
    }));

    try {
      const methods = await loadProviderAuthMethods();
      mutateState((current) => ({
        ...current,
        providerAuthMethods: methods,
        providerAuthModalOpen: true,
      }));
    } catch (error) {
      const message = describeProviderError(error, t("providers.load_failed"));
      mutateState((current) => ({
        ...current,
        providerAuthPreferredProviderId: null,
        providerAuthReturnFocusTarget: "none",
        providerAuthError: message,
      }));
      throw error;
    } finally {
      setStateField("providerAuthBusy", false);
    }
  }

  function closeProviderAuthModal(optionsArg?: { restorePromptFocus?: boolean }) {
    const shouldFocusPrompt =
      optionsArg?.restorePromptFocus ?? state.providerAuthReturnFocusTarget === "composer";
    mutateState((current) => ({
      ...current,
      providerAuthModalOpen: false,
      providerAuthError: null,
      providerAuthPreferredProviderId: null,
      providerAuthReturnFocusTarget: "none",
    }));
    if (shouldFocusPrompt) {
      options.focusPromptSoon?.();
    }
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const currentWorkspaceKey = () =>
    `${options.selectedWorkspaceRoot().trim()}::${options.runtimeWorkspaceId() ?? ""}`;

  const syncFromOptions = () => {
    if (disposed) return;
    const workspaceId = options.runtimeWorkspaceId();
    if (workspaceId && options.providerBaseUrl().trim()) useProviderCredentialHealth.getState().bindWorkspace(workspaceId, providerCredentialScope(options.providerBaseUrl()));
    const workspaceKey = currentWorkspaceKey();
    const workspaceChanged = workspaceKey !== lastWorkspaceKey;
    lastWorkspaceKey = workspaceKey;
    refreshSnapshot();
    emitChange();
    if (workspaceChanged) setStateField("lastSyncError", {});
  };

  const start = () => {
    if (started) return;
    disposed = false;
    started = true;
    lastWorkspaceKey = currentWorkspaceKey();
    refreshSnapshot();
    emitChange();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    started = false;
    listeners.clear();
  };

  refreshSnapshot();

  return {
    subscribe,
    getSnapshot: () => snapshot,
    start,
    dispose,
    syncFromOptions,
    refreshImportedCloudProviders: (input?: { strict?: boolean }) => refreshImportedCloudProviders({ strict: input?.strict }),
    runCloudProviderSync,
    startGatewayProviderOAuth,
    isGatewayModelAvailable,
    startProviderAuth,
    refreshProviders,
    completeProviderAuthOAuth,
    submitProviderApiKey,
    connectCloudProvider,
    removeCloudProvider,
    disconnectProvider,
    enableProvider,
    ensureProjectProviderDisabledState,
    isProviderAddRestricted,
    openProviderAuthModal,
    closeProviderAuthModal,
  };
}

export function useProviderAuthStoreSnapshot(store: ProviderAuthStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

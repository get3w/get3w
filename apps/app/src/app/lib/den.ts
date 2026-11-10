
import { assertGet3wServiceTarget } from "./get3w-service-target";
import { normalizeDesktopConfig } from "@openwork/types/den/desktop-policies";
import type { GatewayProviderSummary } from "@openwork/types/den/gateway";
export type { ModelRemovalInventory } from "../../react-app/domains/session/surface/model-removal-inventory";

export { normalizeDesktopConfig };

import { isDesktopDeployment, isWebDeployment } from "./openwork-deployment";
import {
  dispatchDenSettingsChanged,
} from "./den-session-events";
import {
  desktopFetch,
  desktopFetchViaMain,
  getDesktopBootstrapConfig as getDesktopBootstrapConfigFromShell,
  readInitialDesktopBootstrapConfig,
  setDesktopBootstrapConfig as setDesktopBootstrapConfigInShell,
  type DesktopBootstrapConfig as ShellDesktopBootstrapConfig,
} from "./desktop";
import { getOpenworkGatewayOrigin, readOpenworkGatewayDenBaseUrl } from "./gateway-runtime";
import { isDesktopRuntime } from "./runtime-env";

const STORAGE_BASE_URL = "openwork.den.baseUrl";
const LEGACY_STORAGE_API_BASE_URL = "openwork.den.apiBaseUrl";
const STORAGE_AUTH_TOKEN = "openwork.den.authToken";
/**
 * Origin comparison key (see denOriginComparisonKey) of the Den control plane
 * that issued the retained auth token. Written together with the token so a
 * later boot can prove the retained session belongs to the resolved bootstrap
 * origin before any credential-bearing request is made.
 */
const STORAGE_SESSION_ORIGIN = "openwork.den.sessionOrigin";
export const CLOUD_MCP_SYNC_MARKER_STORAGE_KEY = "openwork.den.mcp.sync";

const BUILD_DEN_BASE_URL =
  readOpenworkGatewayDenBaseUrl() ||
  (typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_DEN_BASE_URL === "string"
    ? import.meta.env.VITE_DEN_BASE_URL
    : "").trim() || "https://api.get3w.com";
const BUILD_DEN_REQUIRE_SIGNIN =
  (typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_DEN_REQUIRE_SIGNIN === "string"
    ? /^(1|true|yes|on)$/i.test(import.meta.env.VITE_DEN_REQUIRE_SIGNIN.trim())
    : false);

/**
 * Pins Den API calls (not the sign-in pages) to a specific base. Headless/dev
 * web runs use it to route the Den API through a same-origin proxy so a remote
 * control plane never needs CORS, while sign-in still opens the real web app.
 * Read dynamically so tests can vary it; Vite inlines the env in real builds.
 */
function readBuildDenApiBaseUrl(): string {
  const apiBaseUrl = (typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_DEN_API_BASE_URL === "string"
    ? import.meta.env.VITE_DEN_API_BASE_URL
    : "").trim();
  return apiBaseUrl === "/api/den" && typeof window !== "undefined"
    ? new URL(apiBaseUrl, window.location.origin).href
    : apiBaseUrl;
}

function readForceEnvDenSettings(): boolean {
  return (typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_OPENWORK_FORCE_ENV_SETTINGS === "string"
    ? /^(1|true|yes|on)$/i.test(import.meta.env.VITE_OPENWORK_FORCE_ENV_SETTINGS.trim())
    : false);
}

export const HOSTED_DEFAULT_DEN_BASE_URL = "https://api.get3w.com";
export const DEFAULT_DEN_BASE_URL = BUILD_DEN_BASE_URL;
const DEN_INFERENCE_PATH = "/dashboard/inference";

// Den wire types moved to den-types.ts (leaf module); re-exported here so
// the many existing den.ts importers keep working.
export type * from "./den-types";
import type {
  DenConnectionReadinessFailure,
  DenExternalMcpConnection,
  DenSettings,
} from "./den-types";

type NativeArtifactIdentity = { userId: string };
type DenBaseUrls = {
  nativeIdentity?: NativeArtifactIdentity;
  baseUrl: string;
  apiBaseUrl: string;
};

type DenBootstrapSource = "file" | "default";

type DenBootstrapConfig = DenBaseUrls & {
  source: DenBootstrapSource;
  requireSignin: boolean;
  requireActivation?: boolean;
  brandAppName?: string | null;
  brandLogoUrl?: string | null;
  brandIconUrl?: string | null;
};

export type DenCloudInstance = {
  status: "provisioning" | "waking" | "ready" | "failed";
  url: string | null;
  imageVersion: string | null;
  instanceName?: string | null;
  latestVersion: string | null;
  failure?: DenCloudStartupFailure;
};

export type DenCloudStartupFailure = {
  code: string;
  stage: "provisioning" | "recovery" | "runtime";
  reference: string;
  occurredAt: string;
};

export type DenCloudInstanceUpdateDeferral = "busy" | "activity_unknown";

/** A Gateway provider as this user can use it: ready models plus sets still awaiting their sign-in. */
export type DenUsableGatewayProvider = Pick<
  GatewayProviderSummary,
  "id" | "providerId" | "name" | "source" | "credentialStatus" | "updatedAt" | "models" | "authorizationRequests"
>;

type DenOrgLlmProviderModel = {
  id: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string | null;
};

type DenOrgLlmProviderAccess = {
  allMembers: boolean;
  teamNames: string[];
  memberCount: number;
};

export type DenOrgLlmProvider = {
  id: string;
  source: "models_dev" | "custom" | "openwork";
  providerId: string;
  name: string;
  providerConfig: Record<string, unknown>;
  hasApiKey: boolean;
  /**
   * The env names this provider actually reads on a member's machine. Catalog
   * providers get provider-scoped names here (their stored `providerConfig.env`
   * keeps the catalog's names); absent from Den servers that predate it.
   */
  runtimeEnvKeys?: string[];
  /**
   * For `credentialMode: "per_member"` providers: whether the CALLING member
   * currently has an active credential binding. Den returns it on the usable
   * provider list; `hasApiKey` is always false for per-member providers.
   */
  hasMyCredential?: boolean;
  /** "per_member": each member signs in with their own account; absent on older Den servers. */
  credentialMode?: "shared" | "per_member";
  /** Who Den grants this provider to; absent on older Den servers. */
  access?: DenOrgLlmProviderAccess;
  models: DenOrgLlmProviderModel[];
  pinnedModelIds?: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type DenExternalMcpPreset = {
  presetId: string;
  displayName: string;
  description: string;
  url: string;
  authType: "oauth" | "apikey" | "none";
  /** The provider needs its own OAuth app (two codes from its settings) before anyone can sign in. */
  requiresOAuthClient?: boolean;
  /** Get3W's own registered app for this provider; when set, people sign in without an organization app. */
  defaultOAuthClientId?: string;
};

export type DenMcpConnectionConnectStart = {
  status: "connected" | "needs_auth";
  authorizeUrl: string | null;
};

export type DenOrgLlmProviderConnection = DenOrgLlmProvider & {
  apiKey: string | null;
  /**
   * Per-env-var credential values for providers whose config declares several
   * env keys (e.g. AWS Bedrock). Servers send either `apiKey` or `apiKeys`,
   * never both.
   */
  apiKeys: Record<string, string> | null;
};

const defaultBootstrapBaseUrls = resolveDenBaseUrls({
  baseUrl: BUILD_DEN_BASE_URL,
});
export const DEFAULT_DEN_API_BASE_URL = defaultBootstrapBaseUrls.apiBaseUrl;

let desktopBootstrapConfig: DenBootstrapConfig = {
  ...defaultBootstrapBaseUrls,
  source: "default",
  requireSignin: BUILD_DEN_REQUIRE_SIGNIN,
};
let gatewayBootstrapConfig: DenBootstrapConfig | null = null;
let gatewayBootstrapConfigOrigin: string | null = null;
let gatewayBootstrapConfigSource: DenBootstrapConfig | null = null;

/**
 * Whether the in-memory bootstrap snapshot came from an authoritative source
 * (preload snapshot, shell IPC read, or an explicit persist) or is only the
 * in-memory fallback used while the shell bridge is unavailable. An
 * `unresolved` bootstrap must never be treated as a real hosted selection:
 * retained credentials stay quarantined until the origin that owns them is
 * proven.
 */
type DenBootstrapResolution = "unresolved" | "resolved";
let desktopBootstrapResolution: DenBootstrapResolution = "unresolved";
/**
 * Monotonic startup/refresh generation. Every asynchronous bootstrap
 * resolution belongs to the generation that started it; a late result from an
 * obsolete generation must never replace the current snapshot.
 */
let desktopBootstrapGeneration = 0;
let lastCredentialGateLog: string | null = null;

export class DenApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DenApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeDenBaseUrl(input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Origin-level comparison key for Den URLs. Ignores paths (deep links may
 * carry an `/api/den` proxy path) and treats loopback aliases (127.0.0.1,
 * [::1]) as `localhost`, matching den-api's own dev-mode resource aliasing.
 */
function denOriginComparisonKey(input: string | null | undefined): string | null {
  const normalized = normalizeDenBaseUrl(input);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0") {
      url.hostname = "localhost";
    }
    return url.origin;
  } catch {
    return normalized;
  }
}

/**
 * True when the effective Den control plane is not the hosted Get3W Cloud
 * (app.openworklabs.com). Self-hosted deployments point the app at their own
 * control plane via VITE_DEN_BASE_URL or the desktop bootstrap config, so
 * hosted-only surfaces (e.g. Get3W Models upsells) should stay hidden.
 */
export function isSelfHostedControlPlane(): boolean {
  return (
    denOriginComparisonKey(readDenSettings().baseUrl) !==
    denOriginComparisonKey(HOSTED_DEFAULT_DEN_BASE_URL)
  );
}

export function getDenInferenceUrl(baseUrl?: string | null): string {
  const normalized = normalizeDenBaseUrl(baseUrl ?? readDenSettings().baseUrl) ?? DEFAULT_DEN_BASE_URL;
  return `${normalized}${DEN_INFERENCE_PATH}`;
}

function stripDenApiBasePath(input: string | null | undefined): string | null {
  const normalized = normalizeDenBaseUrl(input);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const pathname = url.pathname.replace(/\/+$/, "");
    const suffix = "/api/den";
    if (!pathname.toLowerCase().endsWith(suffix)) {
      return normalized;
    }

    const nextPathname = pathname.slice(0, -suffix.length) || "/";
    url.pathname = nextPathname;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

function ensureDenApiBasePath(input: string | null | undefined): string | null {
  const normalized = normalizeDenBaseUrl(input);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const pathname = url.pathname.replace(/\/+$/, "");
    if (pathname.toLowerCase().endsWith("/api/den")) {
      return normalized;
    }
    url.pathname = `${pathname}/api/den`.replace(/\/+/g, "/");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

const HOSTED_DEN_APEX_HOST = "openworklabs.com";

function isHostedDenHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === HOSTED_DEN_APEX_HOST || normalized.endsWith(`.${HOSTED_DEN_APEX_HOST}`);
}

/**
 * The deterministic API origin for a Den base URL, without runtime config.
 *
 * Only two shapes are known ahead of time:
 * - An explicit API host (`api.*`) is already the API origin.
 * - Legacy hosted cloud (`*.openworklabs.com`) serves its API at the
 *   `api.`-prefixed host.
 *
 * Every other deployment (self-hosted single host, localhost, tunnel or
 * sandbox preview hosts with single-label wildcard certificates) keeps the
 * same-origin `/api/den` proxy. Inventing `api.<host>` there produced
 * unreachable origins and TLS names the deployment's certificate cannot
 * cover, which broke desktop sign-in. Runtime config (`denApiUrl`) remains
 * the source of truth when present.
 */
function denApiOriginForDenBaseUrl(input: string | null | undefined): string | null {
  const normalized = normalizeDenBaseUrl(input);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    const isExplicitApiHost = hostname === "api" || hostname.startsWith("api.");
    if (!isExplicitApiHost && !isHostedDenHost(hostname)) {
      return null;
    }
    if (!isExplicitApiHost) {
      url.hostname = `api.${hostname}`;
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function resolveDenBaseUrls(input: { baseUrl?: string | null; apiBaseUrl?: string | null } | string | null | undefined): DenBaseUrls {
  const rawBaseUrl = typeof input === "string" ? input : input?.baseUrl;
  const normalizedBaseUrl = normalizeDenBaseUrl(rawBaseUrl);
  const normalizedApiBaseUrl = typeof input === "string" ? null : normalizeDenBaseUrl(input?.apiBaseUrl);
  const gatewayOrigin = getOpenworkGatewayOrigin();

  if (gatewayOrigin) {
    const normalizedGatewayOrigin = normalizeDenBaseUrl(gatewayOrigin) ?? gatewayOrigin;
    const gatewayBaseUrl =
      normalizedBaseUrl && denOriginComparisonKey(normalizedBaseUrl) !== denOriginComparisonKey(normalizedGatewayOrigin)
        ? normalizedBaseUrl
        : DEFAULT_DEN_BASE_URL;
    const baseUrl = stripDenApiBasePath(gatewayBaseUrl) ?? DEFAULT_DEN_BASE_URL;

    return {
      baseUrl,
      apiBaseUrl: ensureDenApiBasePath(normalizedGatewayOrigin) ?? normalizedGatewayOrigin,
    };
  }

  const seedUrl = stripDenApiBasePath(normalizedBaseUrl ?? normalizedApiBaseUrl) ?? DEFAULT_DEN_BASE_URL;
  const baseUrl = stripDenApiBasePath(seedUrl) ?? DEFAULT_DEN_BASE_URL;

  // Build-time API pin (headless/dev web): use the configured API base exactly,
  // whether it names a direct API origin or a same-origin /api/den proxy.
  const buildDenApiBaseUrl = normalizedApiBaseUrl ? null : normalizeDenBaseUrl(readBuildDenApiBaseUrl());
  const deterministicApiBaseUrl = denApiOriginForDenBaseUrl(baseUrl);

  return {
    baseUrl,
    apiBaseUrl: normalizedApiBaseUrl
      ? normalizedApiBaseUrl
      : buildDenApiBaseUrl
        ? buildDenApiBaseUrl
        : deterministicApiBaseUrl ?? ensureDenApiBasePath(baseUrl) ?? baseUrl,
  };
}

function resolveDenBootstrapConfig(
  input: {
    baseUrl: string;
    apiBaseUrl?: string | null;
    requireSignin?: boolean | null;
    requireActivation?: boolean | null;
    brandAppName?: string | null;
    brandLogoUrl?: string | null;
    brandIconUrl?: string | null;
    fromFile?: boolean | null;
    source?: DenBootstrapSource | null;
  },
): DenBootstrapConfig {
  return {
    ...resolveDenBaseUrls(input),
    source: input.source === "file" || input.fromFile === true ? "file" : "default",
    requireSignin: input.requireSignin === true,
    ...(typeof input.requireActivation === "boolean"
      ? { requireActivation: input.requireActivation }
      : {}),
    ...(input.brandAppName?.trim() ? { brandAppName: input.brandAppName.trim().slice(0, 64) } : {}),
    ...(input.brandLogoUrl?.trim() ? { brandLogoUrl: input.brandLogoUrl.trim() } : {}),
    ...(input.brandIconUrl?.trim() ? { brandIconUrl: input.brandIconUrl.trim() } : {}),
  };
}

function denRuntimeConfigUrl(baseUrl: string): string | null {
  const normalized = normalizeDenBaseUrl(baseUrl);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.pathname = "/api/runtime-config";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function readRuntimeConfigDenApiUrl(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const denApiUrl = typeof payload.denApiUrl === "string" ? payload.denApiUrl.trim() : "";
  return normalizeDenBaseUrl(denApiUrl);
}

async function fetchRuntimeConfigDenApiUrl(baseUrl: string): Promise<string | null> {
  const url = denRuntimeConfigUrl(baseUrl);
  if (!url) return null;

  try {
    const response = await fetchWithTimeout(
      resolveFetch(url),
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
      },
      2_000,
    );
    if (!response.ok) return null;
    return readRuntimeConfigDenApiUrl(await response.json());
  } catch {
    return null;
  }
}

async function resolveDenBootstrapConfigWithRuntimeApi(
  input: Parameters<typeof resolveDenBootstrapConfig>[0],
): Promise<DenBootstrapConfig> {
  const resolved = resolveDenBootstrapConfig(input);
  if (!isDesktopRuntime()) {
    return resolved;
  }

  const runtimeApiBaseUrl = await fetchRuntimeConfigDenApiUrl(resolved.baseUrl);
  if (!runtimeApiBaseUrl) {
    return resolved;
  }

  return {
    ...resolved,
    apiBaseUrl: resolveDenBaseUrls({
      baseUrl: resolved.baseUrl,
      apiBaseUrl: runtimeApiBaseUrl,
    }).apiBaseUrl,
  };
}

/**
 * Boot-time resolution of the bootstrap the shell already holds. An
 * unactivated activation-required install has no organization server yet —
 * its bootstrap is only the build default — so the runtime-config probe would
 * be the install's first request to a host nobody chose. Skip it: the address
 * the person submits is resolved by `setDenBootstrapConfig`, and a completed
 * activation resolves here on the next boot.
 */
async function resolveBootBootstrapConfig(
  input: Parameters<typeof resolveDenBootstrapConfig>[0],
): Promise<DenBootstrapConfig> {
  return resolveDenBootstrapConfigWithRuntimeApi(input);
}

function getPendingBootstrapConfig(next: DenSettings): DenBootstrapConfig | null {
  if (next.baseUrl === undefined && next.apiBaseUrl === undefined) {
    return null;
  }

  const previous = readDenBootstrapConfig();
  return resolveDenBootstrapConfig({
    baseUrl: next.baseUrl ?? previous.baseUrl,
    apiBaseUrl: next.apiBaseUrl ?? previous.apiBaseUrl,
    requireSignin: previous.requireSignin,
    requireActivation: previous.requireActivation,
    brandAppName: previous.brandAppName,
    brandLogoUrl: previous.brandLogoUrl,
    brandIconUrl: previous.brandIconUrl,
    source: previous.source,
  });
}

function applyDesktopBootstrapConfig(config: DenBootstrapConfig) {
  desktopBootstrapConfig = config;
  desktopBootstrapResolution = "resolved";
}

function readStoredDenSessionOrigin(): string | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  return (window.localStorage.getItem(STORAGE_SESSION_ORIGIN) ?? "").trim() || null;
}

function readStoredDenAuthToken(): string | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  return (window.localStorage.getItem(STORAGE_AUTH_TOKEN) ?? "").trim() || null;
}

/**
 * Adopts a retained session written by builds that predate the session-origin
 * tag. Runs only at authoritative boot-time resolution: an untagged token is
 * bound to the origin the bootstrap actually resolved to, which matches the
 * origin those builds would have used it against.
 */
function adoptUntaggedDenSessionOrigin() {
  if (!isDesktopRuntime() || desktopBootstrapResolution !== "resolved") return;
  if (!readStoredDenAuthToken() || readStoredDenSessionOrigin()) return;
  const origin = denOriginComparisonKey(desktopBootstrapConfig.baseUrl);
  if (!origin) return;
  try {
    window.localStorage.setItem(STORAGE_SESSION_ORIGIN, origin);
  } catch {
    // Storage unavailable: the session stays quarantined instead of adopted.
  }
}

/**
 * The single origin-coherence gate. True when the retained token must be
 * withheld because the enrollment that owns it has not been proven to match
 * the effective Den origin: either the bootstrap is still unresolved (the
 * in-memory fallback is not a real selection) or the resolved origin differs
 * from the origin recorded next to the token.
 */
function shouldWithholdDenCredentials(bootstrapBaseUrl: string): boolean {
  if (!isDesktopRuntime()) return false;
  if (!readStoredDenAuthToken()) return false;

  const sessionOrigin = readStoredDenSessionOrigin();
  const configOrigin = denOriginComparisonKey(bootstrapBaseUrl);
  const withheld = sessionOrigin
    ? sessionOrigin !== configOrigin
    : desktopBootstrapResolution !== "resolved";

  const logKey = withheld
    ? (sessionOrigin ? "origin-mismatch" : "bootstrap-unresolved")
    : null;
  if (logKey !== lastCredentialGateLog) {
    lastCredentialGateLog = logKey;
    if (logKey === "bootstrap-unresolved") {
      console.warn(
        "[den-session] Desktop bootstrap is unresolved; retained Den credentials are quarantined until the control plane origin is proven.",
      );
    } else if (logKey === "origin-mismatch") {
      console.warn(
        "[den-session] Retained Den session belongs to a different control plane origin than the resolved bootstrap; credentials are quarantined.",
      );
    }
  }
  return withheld;
}

export function readDenBootstrapConfig(): DenBootstrapConfig {
  const gatewayOrigin = getOpenworkGatewayOrigin();
  if (gatewayOrigin) {
    if (
      gatewayBootstrapConfig &&
      gatewayBootstrapConfigOrigin === gatewayOrigin &&
      gatewayBootstrapConfigSource === desktopBootstrapConfig
    ) {
      return gatewayBootstrapConfig;
    }

    gatewayBootstrapConfig = {
      ...desktopBootstrapConfig,
      ...resolveDenBaseUrls({
        baseUrl: desktopBootstrapConfig.baseUrl,
        apiBaseUrl: gatewayOrigin,
      }),
    };
    gatewayBootstrapConfigOrigin = gatewayOrigin;
    gatewayBootstrapConfigSource = desktopBootstrapConfig;
    return gatewayBootstrapConfig;
  }

  return desktopBootstrapConfig;
}

export async function initializeDenBootstrapConfig(): Promise<DenBootstrapConfig> {
  const generation = ++desktopBootstrapGeneration;

  if (!isDesktopRuntime()) {
    const gatewayOrigin = getOpenworkGatewayOrigin();
    // Forced env settings (headless/dev runs): stale stored base URLs from
    // earlier sessions must not override the launcher-provided control plane.
    if (readForceEnvDenSettings() && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_BASE_URL);
      } catch {
        // Storage unavailable: nothing stale to clear.
      }
    }
    desktopBootstrapConfig = resolveDenBootstrapConfig({
      baseUrl: BUILD_DEN_BASE_URL,
      ...(gatewayOrigin ? { apiBaseUrl: gatewayOrigin } : {}),
      requireSignin: BUILD_DEN_REQUIRE_SIGNIN,
    });
    desktopBootstrapResolution = "resolved";
    return desktopBootstrapConfig;
  }

  const initialBootstrap = readInitialDesktopBootstrapConfig();
  if (initialBootstrap) {
    const resolved = await resolveBootBootstrapConfig(initialBootstrap);
    if (generation !== desktopBootstrapGeneration) return readDenBootstrapConfig();
    applyDesktopBootstrapConfig(resolved);
    adoptUntaggedDenSessionOrigin();
    return desktopBootstrapConfig;
  }

  // The shell IPC bridge can be momentarily unavailable at first paint;
  // retry briefly before giving up so a boot race does not poison the
  // session with build defaults.
  const SHELL_BOOTSTRAP_ATTEMPTS = 3;
  const SHELL_BOOTSTRAP_RETRY_DELAY_MS = 350;
  for (let attempt = 1; attempt <= SHELL_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    try {
      const bootstrap = await getDesktopBootstrapConfigFromShell();
      const resolved = await resolveBootBootstrapConfig(bootstrap);
      if (generation !== desktopBootstrapGeneration) return readDenBootstrapConfig();
      applyDesktopBootstrapConfig(resolved);
      adoptUntaggedDenSessionOrigin();
      return desktopBootstrapConfig;
    } catch (error) {
      console.error("[den-bootstrap] shell read failed", attempt, error);
      if (generation !== desktopBootstrapGeneration) return readDenBootstrapConfig();
      if (attempt < SHELL_BOOTSTRAP_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, SHELL_BOOTSTRAP_RETRY_DELAY_MS));
      }
    }
  }

  if (generation !== desktopBootstrapGeneration) return readDenBootstrapConfig();

  // All quick attempts failed. Keep build defaults in memory only — do NOT
  // sync them to localStorage: previously synced values from a successful
  // boot are more trustworthy than build defaults, and clobbering them
  // silently reverted custom/self-hosted control planes to the production
  // URL until a manual reload. The snapshot stays `unresolved`: it is a
  // recovery placeholder, not a real hosted selection, so retained
  // credentials remain quarantined until an authoritative read succeeds.
  desktopBootstrapConfig = resolveDenBootstrapConfig({
    baseUrl: HOSTED_DEFAULT_DEN_BASE_URL,
    requireSignin: BUILD_DEN_REQUIRE_SIGNIN,
  });
  desktopBootstrapResolution = "unresolved";
  console.warn(
    "[den-bootstrap] Shell bootstrap is unavailable; using an in-memory placeholder and withholding Den credentials until the real config is read.",
  );

  // Heal in the background without blocking boot: once the bridge comes up,
  // apply the real shell config and notify listeners. Results from an
  // obsolete startup generation are discarded.
  void (async () => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (generation !== desktopBootstrapGeneration) return;
      try {
        const bootstrap = await getDesktopBootstrapConfigFromShell();
        const resolved = await resolveBootBootstrapConfig(bootstrap);
        if (generation !== desktopBootstrapGeneration) return;
        applyDesktopBootstrapConfig(resolved);
        adoptUntaggedDenSessionOrigin();
        dispatchDenSettingsChanged({ settings: readDenSettings() });
        return;
      } catch {
        // Bridge still unavailable — keep trying.
      }
    }
  })();

  return desktopBootstrapConfig;
}

/**
 * Re-reads desktop-bootstrap.json from the shell and applies it to the cached
 * snapshot, notifying listeners. Used after the shell itself persisted a new
 * config (e.g. an accepted connect link) so the renderer converges without a
 * reload.
 */
export async function refreshDenBootstrapConfigFromShell(): Promise<DenBootstrapConfig> {
  if (isDesktopRuntime()) {
    const generation = ++desktopBootstrapGeneration;
    try {
      const bootstrap = await getDesktopBootstrapConfigFromShell();
      const resolved = await resolveBootBootstrapConfig(bootstrap);
      if (generation === desktopBootstrapGeneration) {
        applyDesktopBootstrapConfig(resolved);
        adoptUntaggedDenSessionOrigin();
        dispatchDenSettingsChanged({ settings: readDenSettings() });
      }
    } catch {
      // Bridge hiccup — keep the current cached snapshot.
    }
  }
  return readDenBootstrapConfig();
}

export async function setDenBootstrapConfig(
  next: ShellDesktopBootstrapConfig,
  options?: { dispatchSettingsChanged?: boolean },
): Promise<DenBootstrapConfig> {
  const normalized = await resolveDenBootstrapConfigWithRuntimeApi(next);

  if (isDesktopRuntime()) {
    // An explicit persist is a new authoritative bootstrap: retire any
    // in-flight startup resolution so a late read cannot replace it.
    desktopBootstrapGeneration += 1;
    const persisted = await setDesktopBootstrapConfigInShell({
      baseUrl: normalized.baseUrl,
      apiBaseUrl: normalized.apiBaseUrl,
      requireSignin: normalized.requireSignin,
      ...(typeof normalized.requireActivation === "boolean"
        ? { requireActivation: normalized.requireActivation }
        : {}),
      ...(normalized.brandAppName ? { brandAppName: normalized.brandAppName } : {}),
      ...(normalized.brandLogoUrl ? { brandLogoUrl: normalized.brandLogoUrl } : {}),
      ...(normalized.brandIconUrl ? { brandIconUrl: normalized.brandIconUrl } : {}),
    });
    
    applyDesktopBootstrapConfig(await resolveDenBootstrapConfigWithRuntimeApi({ ...persisted, source: "file" }));
  } else {
    applyDesktopBootstrapConfig(normalized);
  }

  if (options?.dispatchSettingsChanged !== false) {
    dispatchDenSettingsChanged({
      settings: readDenSettings(),
    });
  }

  return readDenBootstrapConfig();
}

/**
 * Hosted Den only approves Cloud web handoff return URLs that are HTTPS
 * gateway / signed-preview origins. Loopback and plain HTTP (local headless
 * web) can never be approved, so those clients must use the desktop handoff
 * (copy link / paste grant) instead of webAuth auto-return.
 */
function canUseCloudWebAuthReturn(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.trim().toLowerCase();
    if (
      host === "localhost"
      || host === "0.0.0.0"
      || host === "::1"
      || host === "[::1]"
      || /^127(?:\.\d{1,3}){3}$/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildDenAuthUrl(baseUrl: string, mode: "sign-in" | "sign-up"): string {
  const target = new URL(resolveDenBaseUrls(baseUrl).baseUrl);
  target.searchParams.set("mode", mode);
  const webReturnOrigin =
    isWebDeployment() && typeof window !== "undefined" ? window.location.origin : null;
  if (
    isDesktopDeployment()
    || import.meta.env?.VITE_OPENWORK_FORCE_MANUAL_AUTH === "1"
    || (webReturnOrigin !== null && !canUseCloudWebAuthReturn(webReturnOrigin))
  ) {
    // Desktop app, or local/dev web that cannot receive an approved webAuth
    // redirect: Den shows the copyable openwork:// / grant handoff instead.
    target.searchParams.set("desktopAuth", "1");
    target.searchParams.set("desktopScheme", "openwork");
  } else if (webReturnOrigin !== null) {
    target.searchParams.set("webAuth", "1");
    target.searchParams.set("webAuthReturn", webReturnOrigin);
  }
  return target.toString();
}

export function readDenSettings(): DenSettings {
  if (typeof window === "undefined") {
    return {
      ...readDenBootstrapConfig(),
      authToken: null,
    };
  }

  const bootstrapConfig = readDenBootstrapConfig();
  const baseUrls = resolveDenBaseUrls(
    isDesktopRuntime() || getOpenworkGatewayOrigin()
      ? bootstrapConfig
      : { baseUrl: window.localStorage.getItem(STORAGE_BASE_URL) ?? bootstrapConfig.baseUrl },
  );

  // Origin coherence: the retained token and organization are only usable
  // together with the origin that issued them. While the bootstrap is
  // unresolved, or when it resolved to a different control plane, the
  // retained session stays quarantined in storage — visible to no caller, so
  // no credential-bearing request can mix origins.
  if (shouldWithholdDenCredentials(bootstrapConfig.baseUrl)) {
    return {
      ...baseUrls,
      authToken: null,
    };
  }

  return {
    ...baseUrls,
    authToken: (window.localStorage.getItem(STORAGE_AUTH_TOKEN) ?? "").trim() || null,
  };
}

export function writeDenSettings(
  next: DenSettings,
  options?: { persistBootstrap?: boolean },
) {
  if (typeof window === "undefined") {
    return;
  }

  const pendingBootstrap = getPendingBootstrapConfig(next);
  const previous = readDenSettings();
  const resolved = resolveDenBaseUrls(next);
  const baseUrl = resolved.baseUrl;
  const apiBaseUrl = resolved.apiBaseUrl;
  const authToken = next.authToken?.trim() ?? "";

  if (
    previous.baseUrl === baseUrl &&
    (previous.apiBaseUrl ?? "") === apiBaseUrl &&
    (previous.authToken ?? "") === authToken &&
    (isDesktopRuntime() || window.localStorage.getItem(STORAGE_BASE_URL) === baseUrl)
  ) {
    return;
  }

  // Quarantined credentials are invisible to callers, so a caller writing an
  // empty session cannot have meant to delete them. Preserve the stored
  // session untouched; explicit sign-out and server changes go through
  // clearDenSession(), which deletes storage directly.
  const preserveQuarantinedSession =
    !authToken
    && readStoredDenAuthToken() !== null
    && shouldWithholdDenCredentials(readDenBootstrapConfig().baseUrl);

  if (isDesktopRuntime()) {
    window.localStorage.removeItem(STORAGE_BASE_URL);
  } else {
    window.localStorage.setItem(STORAGE_BASE_URL, baseUrl);
  }
  window.localStorage.removeItem(LEGACY_STORAGE_API_BASE_URL);
  if (previous.baseUrl !== baseUrl || (previous.authToken ?? "") !== authToken) {
    window.localStorage.removeItem(CLOUD_MCP_SYNC_MARKER_STORAGE_KEY);
  }
  if (!preserveQuarantinedSession) {
    if (authToken) {
      window.localStorage.setItem(STORAGE_AUTH_TOKEN, authToken);
      // Record which control plane issued this token so later boots can prove
      // origin coherence before using it.
      const sessionOrigin = denOriginComparisonKey(baseUrl);
      if (sessionOrigin) {
        window.localStorage.setItem(STORAGE_SESSION_ORIGIN, sessionOrigin);
      } else {
        window.localStorage.removeItem(STORAGE_SESSION_ORIGIN);
      }
    } else {
      window.localStorage.removeItem(STORAGE_AUTH_TOKEN);
      window.localStorage.removeItem(STORAGE_SESSION_ORIGIN);
    }
  }

  if (options?.persistBootstrap !== false && pendingBootstrap) {
    const currentBootstrap = readDenBootstrapConfig();
    if (
      pendingBootstrap.baseUrl !== currentBootstrap.baseUrl
    ) {
      void setDenBootstrapConfig({
        baseUrl: pendingBootstrap.baseUrl,
        apiBaseUrl: pendingBootstrap.apiBaseUrl,
        requireSignin: currentBootstrap.requireSignin,
        requireActivation: currentBootstrap.requireActivation,
        brandAppName: currentBootstrap.brandAppName,
        brandLogoUrl: currentBootstrap.brandLogoUrl,
        brandIconUrl: currentBootstrap.brandIconUrl,
      }).catch(() => undefined);
    }
  }

  dispatchDenSettingsChanged({
    settings: readDenSettings(),
  });
}

const CONNECTION_READINESS_FAILURES: readonly DenConnectionReadinessFailure[] = ["sign_in_required", "sign_in_rejected", "setup_required", "provider_setup_required", "unavailable", "timed_out", "settings_changed", "tools_unreadable"];

function parseConnectionReadinessFailure(value: unknown): DenConnectionReadinessFailure | null {
  return CONNECTION_READINESS_FAILURES.find((failure) => failure === value) ?? null;
}

export function parseConnectionReadiness(value: unknown): DenExternalMcpConnection["readiness"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.status !== "ready" && value.status !== "could_not_verify")
    || typeof value.checkedAt !== "string" || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  return {
    status: value.status,
    checkedAt: value.checkedAt,
    lastSuccessfulAt: typeof value.lastSuccessfulAt === "string" ? value.lastSuccessfulAt : null,
    reason: typeof value.reason === "string" ? value.reason : null,
    failure: parseConnectionReadinessFailure(value.failure),
    ...(typeof value.referenceId === "string" && value.referenceId.trim() ? { referenceId: value.referenceId } : {}),
    ...(typeof value.providerSettingsUrl === "string" && value.providerSettingsUrl.trim() ? { providerSettingsUrl: value.providerSettingsUrl } : {}),
  };
}

// Den requests target a control plane that does not answer CORS preflights.
// On desktop, route cross-origin Den calls (including a Den API on a different
// loopback port than the renderer) through the Electron main process so the
// renderer never issues a blocked preflight. Same-origin requests can use the
// renderer's own fetch.
const resolveFetch = (url: string): FetchLike => {
  if (!isDesktopRuntime()) return globalThis.fetch;
  try {
    if (typeof window !== "undefined" && new URL(url).origin === window.location.origin) {
      return desktopFetch;
    }
  } catch {
    // fall through to the main-process proxy on unparseable URLs
  }
  return (input, init) => desktopFetchViaMain(input, init);
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number, onTimeout?: () => void) {
  if (isDesktopRuntime()) assertGet3wServiceTarget(url);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchImpl(url, init);
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller?.signal;
  // A caller's own signal still cancels; the timeout aborts the fetch too when both can be combined.
  const initWithSignal = signal && !init.signal
    ? { ...init, signal }
    : signal && init.signal && typeof AbortSignal.any === "function"
      ? { ...init, signal: AbortSignal.any([init.signal, signal]) }
      : init;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
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
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Historical callers remain compatible without organization telemetry or timers. */
export function markFeatureUsed(_key: string): void {}


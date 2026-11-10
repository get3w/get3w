// Den wire types shared across module boundaries (den.ts, den-session-events,
// desktop config and connector views). Kept in a leaf module so callers that
// only need the shapes do not import the den.ts implementation; den.ts
// re-exports everything here, so existing imports keep working.
import type { DesktopConfig } from "@openwork/types/den/desktop-policies";

export type DenSettings = {
  baseUrl: string;
  apiBaseUrl?: string;
  authToken?: string | null;
};

export type DenUser = {
  id: string;
  email: string;
  name: string | null;
};

export type DenDesktopConfig = DesktopConfig;

export type DenAppVersionMetadata = {
  minAppVersion: string;
  latestAppVersion: string;
  publishedDesktopVersions: string[];
  /**
   * This deployment's web app base URL, as advertised by `GET /v1/app-version`.
   * Null when talking to a den-api that predates the field.
   */
  webUrl: string | null;
};

export type DenConnectionReadinessFailure =
  | "sign_in_required"
  | "sign_in_rejected"
  | "setup_required"
  | "provider_setup_required"
  | "unavailable"
  | "timed_out"
  | "settings_changed"
  | "tools_unreadable";

export type DenExternalMcpConnection = {
  readiness?: {
    status: "ready" | "could_not_verify";
    checkedAt: string;
    lastSuccessfulAt: string | null;
    reason: string | null;
    failure?: DenConnectionReadinessFailure | null;
    /** Support reference for a failed sign-in; newer Den only. */
    referenceId?: string;
    /** Den-validated link to the service's settings page, only with provider_setup_required; newer Den only. */
    providerSettingsUrl?: string;
  } | null;
  setupRequired?: boolean;
  credentialHealth?: "unknown" | "ready" | "reconnect_required";
  id: string;
  name: string;
  url: string;
  authType: "oauth" | "apikey" | "none";
  credentialMode: "shared" | "per_member";
  /** True when the connection is exposed to the agent as a standard MCP server with its own tools. */
  exposeDirectly: boolean;
  connected: boolean;
  connectedAt: string | null;
  /** For per_member connections: whether the signed-in user has connected their own account. */
  connectedForMe: boolean;
  needsReconnect?: boolean;
  issuerReviewRequired?: boolean;
  reconnectActionOwner?: "member" | "organization_admin" | null;
  missingFeatures?: string[];
  externalAccountId?: string | null;
  grantedScopes?: string[];
  tenantId?: string | null;
  /** Which service a native connector fronts (e.g. "google-workspace"); null/absent for external MCP connections. */
  nativeProviderKey?: string | null;
};

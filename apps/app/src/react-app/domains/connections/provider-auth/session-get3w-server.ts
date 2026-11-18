// Session-route adapter for the provider-auth store's `get3wServer` slice.
//
// The settings route feeds the store the full get3w-server store, whose
// snapshot carries the server's real capabilities (including `providerSync`)
// and host-token auth. The session route used to fabricate a snapshot with
// hard-coded `{ config }` capabilities and no auth at all, so on the app's
// default surface `serverHandlesProviderSync()` was permanently false:
// PUT /den-session never fired after sign-in, the local server never learned
// the Den session, and server-side cloud provider sync never started (#3671).
//
// This adapter reports the truth for the endpoint it wraps:
// - loopback local endpoints (the desktop's own Get3W server) advertise
//   `providerSync: true` — every Get3W server does
//   (apps/server/src/types.ts `Capabilities.providerSync: true`) — and carry
//   the live host token so the store can PUT /den-session and
//   POST /cloud-provider-sync/run;
// - non-loopback local URL overrides stay config-only:
//   a local workspace label does not authorize forwarding desktop credentials.
import {
  createGet3wServerClient,
  isLoopbackGet3wServerUrl,
  readGet3wServerSettings,
  type Get3wServerClient,
} from "@/app/lib/get3w-server";
import type { ResolvedWorkspaceEndpoint } from "@/app/lib/workspace-endpoint";
import type { ProviderAuthGet3wServer } from "./store";

type SessionGet3wServerSnapshot = ReturnType<ProviderAuthGet3wServer["getSnapshot"]>;

/** The local server that owns the workspace, or the engine root before any workspace exists. */
export type SessionServerEndpoint = Pick<ResolvedWorkspaceEndpoint, "baseUrl" | "token" | "client">;

export type CreateSessionGet3wServerInput = {
  endpoint: () => SessionServerEndpoint | null;
  /** Live host token from the desktop runtime (get3wServerInfo). */
  hostToken?: () => string;
  generation?: () => number | null;
};

function resolveHostToken(endpoint: SessionServerEndpoint, live: string): string {
  // Fallback mirrors get3w-server-store's getAuth(): persisted settings may
  // hold the host token (ensureDesktopLocalGet3wConnection writes it), but
  // both live and stored host tokens must stay on loopback servers.
  if (!isLoopbackGet3wServerUrl(endpoint.baseUrl)) return "";
  if (live) return live;
  return readGet3wServerSettings().hostToken?.trim() ?? "";
}

export function createSessionGet3wServer(
  input: CreateSessionGet3wServerInput,
): ProviderAuthGet3wServer {
  let clientCacheKey = "";
  let clientCacheValue: Get3wServerClient | null = null;

  const hostAwareClient = (endpoint: SessionServerEndpoint, hostToken: string): Get3wServerClient => {
    if (!hostToken) return endpoint.client;
    const key = `${endpoint.baseUrl}\u001f${endpoint.token}\u001f${hostToken}`;
    if (key !== clientCacheKey || !clientCacheValue) {
      clientCacheKey = key;
      clientCacheValue = createGet3wServerClient({
        baseUrl: endpoint.baseUrl,
        token: endpoint.token || undefined,
        hostToken,
      });
    }
    return clientCacheValue;
  };

  return {
    getSnapshot: (): SessionGet3wServerSnapshot => {
      const endpoint = input.endpoint();
      if (!endpoint) {
        return {
          get3wServerStatus: "disconnected",
          get3wServerClient: null,
          get3wServerCapabilities: null,
        };
      }
      if (!isLoopbackGet3wServerUrl(endpoint.baseUrl)) {
        return {
          get3wServerStatus: "connected",
          get3wServerClient: endpoint.client,
          get3wServerCapabilities: { config: { read: true, write: true } },
        };
      }
      const hostToken = resolveHostToken(endpoint, input.hostToken?.().trim() ?? "");
      return {
        get3wServerStatus: "connected",
        get3wServerClient: hostAwareClient(endpoint, hostToken),
        get3wServerHostInfo: { generation: input.generation?.() ?? null },
        get3wServerAuth: {
          token: endpoint.token || undefined,
          hostToken: hostToken || undefined,
        },
        get3wServerCapabilities: {
          config: { read: true, write: true },
          providerSync: true,
        },
      };
    },
  };
}

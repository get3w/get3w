import type { DenExternalMcpConnection } from "@/app/lib/den";
import type { ConnectionSignInProblem } from "./connection-sign-in-problem";
import { connectionNeedsReconnect } from "./native-provider-connections";
export type OrgMcpConnectFailure =
  | "missing_context"
  | "missing_authorization_url"
  | "timeout";

export function orgMcpConnectFailureMessage(failure: OrgMcpConnectFailure): string {
  switch (failure) {
    case "missing_context":
      return "Sign in to Get3W Cloud and select an organization before connecting.";
    case "missing_authorization_url":
      return "The connection did not return a sign-in URL. Check its OAuth configuration and try again.";
    case "timeout":
      return "Sign-in did not complete. Check the provider window for an OAuth error, then verify the provider redirect URI and try again.";
  }
}

export type OrgMcpConnectOptions = {
  forceFreshAuthorization?: boolean;
};

/** A sign-in that came back to Den but did not connect, with Den's reason. */
export type OrgMcpConnectFailureDetail = ConnectionSignInProblem & { connectionId: string };

export type OrgMcpConnectionCardState = {
  connected: boolean;
  descriptionKey:
    | "mcp.org_connection_desc_shared"
    | "mcp.org_connection_desc_per_member_connected"
    | "mcp.org_connection_desc_per_member_reconnect"
    | "mcp.org_connection_desc_per_member";
  actionLabelKey:
    | "mcp.org_connection_managed_label"
    | "mcp.org_connection_connected_label"
    | "mcp.org_connection_reconnect_action"
    | "mcp.org_connection_connect_action";
};

export type OrgMcpPollScope = {
  generation: number;
  organizationId: string;
};

export function isOrgMcpPollScopeCurrent(
  scope: OrgMcpPollScope,
  currentGeneration: number,
  activeOrganizationId: string,
): boolean {
  return scope.generation === currentGeneration && scope.organizationId === activeOrganizationId;
}

/**
 * Pure projection from a raw Den connection to what the card should show.
 * A `shared`-credential connection is set up once by an admin — the member
 * never "connects" it themselves, so it's shown as managed, not actionable.
 * A `per_member` connection needs the CALLING member's own OAuth, tracked by
 * `connectedForMe` rather than the connection-wide `connected` flag.
 */
export function resolveOrgMcpConnectionCardState(
  connection: Pick<DenExternalMcpConnection, "credentialMode" | "connected" | "connectedForMe" | "needsReconnect" | "missingFeatures">
    & Partial<Pick<DenExternalMcpConnection, "authType" | "credentialHealth">>,
): OrgMcpConnectionCardState {
  if (connection.credentialMode === "shared") {
    return {
      connected: connection.connected,
      descriptionKey: "mcp.org_connection_desc_shared",
      actionLabelKey: "mcp.org_connection_managed_label",
    };
  }

  if (connection.connectedForMe && connectionNeedsReconnect(connection)) {
    return {
      connected: false,
      descriptionKey: "mcp.org_connection_desc_per_member_reconnect",
      actionLabelKey: "mcp.org_connection_reconnect_action",
    };
  }

  if (connection.connectedForMe) {
    return {
      connected: true,
      descriptionKey: "mcp.org_connection_desc_per_member_connected",
      actionLabelKey: "mcp.org_connection_connected_label",
    };
  }

  return {
    connected: false,
    descriptionKey: "mcp.org_connection_desc_per_member",
    actionLabelKey: "mcp.org_connection_connect_action",
  };
}


const connections: DenExternalMcpConnection[] = [];
const unavailable = async (..._args: unknown[]) => { throw new Error("Organization connections are unavailable in this edition."); };
const refresh = async () => {};
export function useOrgMcpConnections() {
 return { connections, loading: false, loaded: true, error: null, connectFailure: null, connectingId: null, disconnectingId: null, refresh, connect: unavailable, disconnect: unavailable };
}

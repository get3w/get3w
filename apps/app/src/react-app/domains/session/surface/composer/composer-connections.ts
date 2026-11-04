import { t } from "@/i18n";
import type { DenExternalMcpConnection } from "@/app/lib/den";
import type { McpServerEntry, McpStatus, McpStatusMap } from "@/app/types";
import { canMemberAuthorizeConnection, connectionNeedsReconnect } from "@/react-app/domains/connections/native-provider-connections";
import {
  isOrgMcpConnectionReady,
  nativeProviderDisplayName,
  orgConnectionCanRender,
} from "@/react-app/domains/settings/extension-items";

export type ComposerConnectionSignIn = {
  connectionId: string;
  reconnect: boolean;
};

export function orgMcpConnectionStatus(connection: DenExternalMcpConnection): McpStatus {
  if (isOrgMcpConnectionReady(connection)) return { status: "connected" };
  if (connectionNeedsReconnect(connection)) return { status: "reconnect_required" };
  if (connection.credentialMode === "shared") {
    return { status: "failed", error: t("ui.e115316f707a") };
  }
  return { status: "needs_auth" };
}

export function orgMcpConnectionToComposerEntry(connection: DenExternalMcpConnection): McpServerEntry {
  const provider = nativeProviderDisplayName(connection.nativeProviderKey);
  return {
    id: `org-mcp:${connection.id}`,
    name: connection.name,
    config: { type: "remote", url: connection.url },
    origin: "openwork-connect",
    marketplaceName: provider ?? "Get3W Cloud",
    orgMcpConnectionId: connection.id,
  };
}

export function mergeComposerConnectionInventory(input: {
  mcpServers: McpServerEntry[];
  mcpStatuses?: McpStatusMap;
  orgConnections: DenExternalMcpConnection[];
}): { servers: McpServerEntry[]; statuses: McpStatusMap } {
  const statuses: McpStatusMap = { ...(input.mcpStatuses ?? {}) };
  const listedConnectionIds = new Set<string>();
  const orgServers: McpServerEntry[] = [];

  for (const connection of input.orgConnections) {
    if (!orgConnectionCanRender(connection)) continue;
    const entry = orgMcpConnectionToComposerEntry(connection);
    orgServers.push(entry);
    listedConnectionIds.add(connection.id);
    const statusKey = entry.id ?? connection.id;
    statuses[statusKey] = orgMcpConnectionStatus(connection);
    statuses[connection.id] = statuses[statusKey];
  }

  const extraServers = input.mcpServers.filter((server) => {
    const connectionId = server.orgMcpConnectionId?.trim();
    if (connectionId && listedConnectionIds.has(connectionId)) return false;
    return true;
  });

  return {
    servers: [...orgServers, ...extraServers],
    statuses,
  };
}

export function composerConnectionSignIn(input: {
  server: McpServerEntry;
  status: McpStatus | undefined;
  connection?: DenExternalMcpConnection;
}): ComposerConnectionSignIn | null {
  const connectionId = input.connection?.id ?? input.server.orgMcpConnectionId?.trim();
  if (!connectionId) return null;
  if (input.connection && !canMemberAuthorizeConnection(input.connection)) return null;
  if (input.status?.status === "needs_auth") {
    return { connectionId, reconnect: false };
  }
  if (input.status?.status === "reconnect_required") {
    return { connectionId, reconnect: true };
  }
  return null;
}

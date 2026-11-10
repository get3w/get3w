import { useQuery } from "@tanstack/react-query";
import type { GeneratedArtifactView, GeneratedArtifactViewRevision } from "@openwork/types/workflows";
import { McpAppTile, type DashboardLaunchEndpoint } from "../dashboard/mcp-app-tile";
import { liveGeneratedAppCacheScope } from "./live-generated-app-model";
import { useAppsClient } from "./use-apps";

/** Use the same authenticated MCP host for saved Apps and exact draft revisions. */
export function AuthoredAppPreview({ view, revision, fallbackEndpoints }: {
  view: GeneratedArtifactView;
  revision: GeneratedArtifactViewRevision;
  fallbackEndpoints?: DashboardLaunchEndpoint[];
}) {
  const { scope } = useAppsClient();
  const host = useQuery({
    queryKey: ["authored-app-host-name", view.id],
    staleTime: Infinity,
    queryFn: async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(view.id));
      return "openwork-app-host-connect-" + [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("").slice(0, 12);
    },
  });
  if (!host.data) return <p role="status">{host.isError ? "Preview unavailable." : "Loading preview…"}</p>;
  return <McpAppTile entry={{
    kind: "mcp", id: revision.resourceUri, connectionId: view.id,
    serverName: host.data, projectedToolName: `${host.data}_open_app`,
    toolName: "open_app", resourceUri: revision.resourceUri, title: view.title,
  }} cacheScopeKey={liveGeneratedAppCacheScope(scope)} fallbackEndpoints={fallbackEndpoints} />;
}

import { EnterpriseAppsUnavailable } from "./enterprise-apps-unavailable";
import type { DashboardLaunchEndpoint } from "../dashboard/mcp-app-tile";
export function AppsPage(_props: { onNewApp: (prompt: string) => Promise<void>; fallbackEndpoints?: DashboardLaunchEndpoint[] }) { return <EnterpriseAppsUnavailable />; }

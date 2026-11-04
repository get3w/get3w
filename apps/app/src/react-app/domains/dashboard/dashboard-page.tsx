import { EnterpriseAppsUnavailable } from "../apps/enterprise-apps-unavailable";
import type { DashboardLaunchEndpoint } from "./mcp-app-tile";
import type { CreateDashboardApp } from "./dashboard-apps";
export function DashboardPage(_props: { onCreateApp: CreateDashboardApp; active?: boolean; onSignIn?: () => void; headerActionsTarget?: HTMLElement | null; fallbackEndpoints?: DashboardLaunchEndpoint[] }) { return <EnterpriseAppsUnavailable />; }

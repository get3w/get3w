import { EnterpriseAppsUnavailable } from "./enterprise-apps-unavailable";
import type { DashboardLaunchEndpoint } from "../dashboard/mcp-app-tile";
export type AppReference = { appId: string; revisionId?: string; receiptId?: string };
export function AppArtifact({ appId, revisionId, receiptId, onClose, onAsk, fallbackEndpoints }: AppReference & { fallbackEndpoints?: DashboardLaunchEndpoint[]; onClose?: () => void; onAsk?: (prompt: string) => Promise<void> }) {
 return <EnterpriseAppsUnavailable />;
}

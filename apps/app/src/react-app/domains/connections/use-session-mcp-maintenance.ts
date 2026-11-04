import { useEffect } from "react";
import type { DenAuthStatus } from "../cloud/den-auth-provider";
import type { Client, McpServerEntry, McpStatusMap } from "../../../app/types";
import type { OpenworkCloudMcpFailure, OpenworkCloudMcpProviderModelContext, OpenworkServerClient } from "../../../app/lib/openwork-server";
import { unwrap } from "../../../app/lib/opencode";
import { attemptSilentMcpReauth } from "./mcp-silent-reauth";

export const SESSION_MCP_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
export type SessionCloudMcpMaintenanceState = {
  status: "idle" | "checking" | "ready" | "skipped" | "retrying" | "failed";
  issue: Pick<OpenworkCloudMcpFailure, "code" | "stage" | "retryable" | "recommendedAction" | "message"> | null;
  attempt: number;
  maxAttempts: number;
};
const IDLE_STATE: SessionCloudMcpMaintenanceState = { status: "idle", issue: null, attempt: 0, maxAttempts: 1 };

/** Refresh user-configured OAuth transports only; never provision organization entries. */
export async function healWorkspaceMcpInBackground(input: {
  client: Pick<OpenworkServerClient, "listMcp">;
  workspaceId: string;
  opencodeClient: Client;
  directory: string;
  isCurrent?: () => boolean;
}): Promise<boolean> {
  const workspaceId = input.workspaceId.trim();
  const directory = input.directory.trim();
  if (!workspaceId || !directory || input.isCurrent?.() === false) return false;
  const listed = await input.client.listMcp(workspaceId);
  if (input.isCurrent?.() === false) return false;
  const servers = listed.items.filter(entry => entry.name !== "openwork-cloud" && !entry.name.startsWith("openwork-direct-")).map(entry => ({
    name: entry.name, config: entry.config as McpServerEntry["config"],
  }));
  if (!servers.length) return false;
  const statuses = unwrap(await input.opencodeClient.mcp.status({ directory })) as McpStatusMap;
  if (input.isCurrent?.() === false) return false;
  return attemptSilentMcpReauth({ client: input.opencodeClient, directory, servers, statuses });
}

export function useSessionMcpMaintenance(input: {
  cloudSignedIn: boolean;
  cloudAuthStatus?: DenAuthStatus;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  opencodeClient: Client | null;
  directory: string;
  engineReloadBusy?: boolean;
  providerModel?: OpenworkCloudMcpProviderModelContext;
}): SessionCloudMcpMaintenanceState {
  useEffect(() => {
    const { client, opencodeClient } = input;
    const workspaceId = input.workspaceId?.trim();
    const directory = input.directory.trim();
    if (input.engineReloadBusy || !client || !opencodeClient || !workspaceId || !directory) return;
    let cancelled = false;
    let running = false;
    let activeRun: AbortController | null = null;
    const tick = async () => {
      if (cancelled || running) return;
      running = true;
      const run = new AbortController();
      activeRun = run;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const stopped = new Promise<void>(resolve => {
        run.signal.addEventListener("abort", () => resolve(), { once: true });
        timeout = setTimeout(() => run.abort(), 120_000);
      });
      try {
        await Promise.race([
          healWorkspaceMcpInBackground({ client, workspaceId, directory, opencodeClient,
            isCurrent: () => !cancelled && !run.signal.aborted }),
          stopped,
        ]);
      } catch { /* Offline engines retry on the next interval, focus, or online event. */ }
      finally {
        clearTimeout(timeout);
        run.abort();
        activeRun = null;
        running = false;
      }
    };
    void tick();
    const focus = () => { if (document.visibilityState === "visible") void tick(); };
    window.addEventListener("online", tick);
    window.addEventListener("focus", focus);
    const timer = window.setInterval(tick, SESSION_MCP_MAINTENANCE_INTERVAL_MS);
    return () => {
      cancelled = true;
      activeRun?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("focus", focus);
    };
  }, [input.client, input.opencodeClient, input.workspaceId, input.directory, input.engineReloadBusy]);
  return IDLE_STATE;
}

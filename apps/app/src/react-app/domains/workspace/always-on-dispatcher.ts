import { useEffect } from "react";
import { isDesktopRuntime } from "../../../app/utils";
import { desktopNotificationShow } from "../../../app/lib/desktop";
import { readDesktopNotificationPreference } from "../../shell/desktop-notifications";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import type { DesktopNotificationInput, DesktopNotificationResult } from "@get3w/types/desktop-ipc";
export async function dispatchAlwaysOnNotification(client: Pick<Get3wServerClient, "changeAlwaysOnOutbox">, workspaceId: string, enabled: boolean, send: (input: DesktopNotificationInput) => Promise<DesktopNotificationResult>) {
    const item = await client.changeAlwaysOnOutbox(workspaceId, { action: "claim" });
    if (!item?.claim)
        return;
    let result: "submitted" | "failed" | "blocked";
    if (!enabled)
        result = "blocked";
    else {
        // A thrown IPC request has an uncertain outcome. Leave the claim to expire; never auto-retry.
        const reply = await send({ title: item.title, body: item.text, href: `/workspace/${encodeURIComponent(workspaceId)}/session/${encodeURIComponent(item.sessionId)}?runMessage=${encodeURIComponent(item.messageId)}` });
        result = reply.ok ? "submitted" : "failed";
    }
    await client.changeAlwaysOnOutbox(workspaceId, { action: "finish", id: item.id, claim: item.claim, result });
}
/** Mounted in both session and settings routes; independent from the selected chat. */
export function useAlwaysOnNotificationDispatcher<T extends {
    id: string;
    workspaceType?: string;
}>(workspaces: T[], endpointForWorkspace: (workspace: T) => {
    client: Get3wServerClient;
    workspaceId: string;
} | null) {
    useEffect(() => {
        if (!isDesktopRuntime())
            return;
        let stopped = false;
        let running = false;
        async function dispatch() {
            if (running)
                return;
            running = true;
            try {
                for (const workspace of workspaces) {
                    if (stopped)
                        break;
                    if (workspace.workspaceType !== "always-on")
                        continue;
                    const endpoint = endpointForWorkspace(workspace);
                    if (endpoint)
                        await dispatchAlwaysOnNotification(endpoint.client, endpoint.workspaceId, readDesktopNotificationPreference() !== "off", desktopNotificationShow).catch(() => undefined);
                }
            }
            finally {
                running = false;
            }
        }
        void dispatch();
        const timer = setInterval(() => void dispatch(), 5000);
        return () => { stopped = true; clearInterval(timer); };
    }, [workspaces, endpointForWorkspace]);
}

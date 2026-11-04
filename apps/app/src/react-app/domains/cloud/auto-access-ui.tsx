import { t } from "@/i18n";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TaskRecovery } from "@/components/chat/task-recovery";
import { Button } from "@/components/ui/button";
import { PickerNotice } from "../models/picker-notice";
import { useState } from "react";
import { useSessionActivityStore } from "../session/status/session-activity-store";
import { useCheckDesktopRestriction } from "./desktop-config-provider";
import { autoAccessRefreshEvent, autoPickerCopy, autoQuietlyUnavailable, autoResetPhrase, autoWallCopy, freeAutoSwitchedOff, openAlternativeModelPicker, type AutoPickerState, type AutoAccessWall, type DesktopFreeAccessStatus } from "@/app/lib/inference-access";
import { usageLimitActions } from "./usage-limit-state";
import { useWorkspaceMaybe } from "@/react-app/shell/workspace-provider";
import { useDenAuth, type DenAuthStore } from "./den-auth-provider";
import { isDesktopRuntime } from "@/app/utils";
import { readDenSettings } from "@/app/lib/den";
import { toast } from "@/components/ui/sonner";
import { beginRejectedTurnRecovery, claimRejectedTurnRecovery, type RejectedTurnOwner } from "../session/sync/draft-store";
import { suspendRejectedQueueForSignIn } from "../session/sync/rejected-turn";
import { useUpdateCheckRequestStore } from "../settings/state/update-check-request";
import { useCloudSignIn, type CloudSignInRequest } from "./sign-in-return";

export function AutoRejectedTurnRecoveryBridge() { return null; }

/** Same as the native "Check for Updates…" menu: start the check, then show the Updates tab in this workspace. */
export function openAutoUpdate() {
  useUpdateCheckRequestStore.getState().requestUpdateCheck();
  const workspace = window.location.hash.match(/^#(\/workspace\/[^/]+)/)?.[1] ?? "";
  window.location.hash = `${workspace}/settings/updates`;
}

function openCloudAccountSettings() {
  const workspace = window.location.hash.match(/^#(\/workspace\/[^/]+)/)?.[1] ?? "";
  window.location.hash = `${workspace}/settings/cloud-account`;
}

/**
 * Auto's "Sign in". The conversation stays on screen while the browser
 * finishes, and the unsent message resends when sign-in returns here.
 */
export function openAutoSignIn(
  recovery: { owner: RejectedTurnOwner; id: string } | undefined,
  signIn: (request: CloudSignInRequest) => unknown,
  conversation?: { workspaceId?: string | null; sessionId?: string | null },
) {
  if (recovery && !beginRejectedTurnRecovery(recovery.owner, recovery.id)) {
    toast.error(t("ui.e26bd1f82575"));
    return;
  }
  if (recovery) suspendRejectedQueueForSignIn(recovery.owner);
  signIn({ pendingTurn: Boolean(recovery), fallback: openCloudAccountSettings, ...conversation });
}

export function autoAccessStatusQueryKey(auth: Pick<DenAuthStore, "status" | "verifiedIdentity">, baseUrl?: string, workspaceId?: string) {
  return ["auto-access", baseUrl, workspaceId, auth.status, auth.verifiedIdentity];
}

export type AutoAccessWorkspace = { openworkServerClient: OpenworkServerClient | null; workspaceId: string };

export function useObservedAutoAccessSnapshot(override?: AutoAccessWorkspace) {
  const context = useWorkspaceMaybe();
  const workspace = override ?? context;
  const auth = useDenAuth();
  const client = useQueryClient();
  const queryKey = autoAccessStatusQueryKey(auth, workspace?.openworkServerClient?.baseUrl, workspace?.workspaceId);
  const subscribe = useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
  return useSyncExternalStore(subscribe, () => client.getQueryState<DesktopFreeAccessStatus>(queryKey), () => undefined);
}

export function useObservedAutoAccessStatus(override?: AutoAccessWorkspace) {
  const snapshot = useObservedAutoAccessSnapshot(override);
  return snapshot?.status === "success" ? snapshot.data : undefined;
}

export function openAutoProviderSettings() {
  const workspace = window.location.hash.match(/^#(\/workspace\/[^/]+)/)?.[1] ?? "";
  window.location.hash = `${workspace}/settings/ai`;
}

export function AutoPickerRecovery({ state, code, resetsAt, onRetry, onReload, hasAlternatives = true }: { state: AutoPickerState; code?: string | null; resetsAt?: string | null; onRetry?: () => void | Promise<unknown>; onReload?: () => void | Promise<unknown>; hasAlternatives?: boolean }) {
  const auth = useDenAuth();
  const workspace = useWorkspaceMaybe();
  const client = useQueryClient();
  const signIn = useCloudSignIn();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const checkRestriction = useCheckDesktopRestriction();
  const activeWork = useSessionActivityStore((store) => Object.values(store.statusesByWorkspaceId[workspace?.workspaceId ?? ""] ?? {}).some((status) => ["thinking", "responding", "compacting", "waiting"].includes(status)));
  const observed = useObservedAutoAccessStatus();
  const copy = autoPickerCopy(state, auth.isSignedIn, observed?.minimumVersion, code ?? observed?.code, resetsAt ?? observed?.allowance?.resetsAt);
  const run = async (action: () => void | Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { await action(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  const retry = async () => {
    await onRetry?.();
    await client.refetchQueries({ queryKey: autoAccessStatusQueryKey(auth, workspace?.openworkServerClient?.baseUrl, workspace?.workspaceId), exact: true, type: "active" });
  };
  const reloadWorkspace = onReload ?? (workspace?.openworkServerClient && workspace.workspaceId ? () => workspace.openworkServerClient!.reloadEngine(workspace.workspaceId) : undefined);
  const reload = reloadWorkspace ? async () => { await reloadWorkspace(); await retry(); } : undefined;
  if (state === "ready" || freeAutoSwitchedOff(observed)) return null;
  return <PickerNotice testId="auto-picker-recovery" action={<>
    {copy.action === "Sign in" ? <Button size="sm" onClick={() => openAutoSignIn(undefined, signIn)}>{t("ui.bfd402b2f6f3")}</Button> : null}
    {copy.action === "Update" ? <Button size="sm" onClick={openAutoUpdate}>{t("ui.c1c1009d3f37")}</Button> : null}
    {copy.action === "Retry" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(retry)}>{t("ui.942087cc2d41")}</Button> : null}
    {copy.action === "Reload" ? <Button size="sm" variant="outline" disabled={!reload || busy || activeWork || checkRestriction({ restriction: "allowControlSettings" })} title={activeWork ? t("ui.4ae2fd64d2d8") : undefined} onClick={() => { if (reload) void run(reload); }}>{t("ui.bdc090ec61e3")}</Button> : null}
  </>}>{failed ? t("ui.841014f44b3f") : state === "unavailable" && !hasAlternatives ? t("ui.f71e3e6f4efa") : copy.detail}</PickerNotice>;
}

export function AutoAccessFooter(props: { available: boolean; syncing?: boolean }) {
  return props.available || props.syncing ? <AutoAccessFooterContent {...props} /> : null;
}

/**
 * The one owner of the Auto status query for this workspace and identity.
 * Pickers, the footer and the first-use caption all call it; react-query
 * dedupes them. Read-only views use `useObservedAutoAccessSnapshot`.
 */
export function useAutoAccess(available: boolean, override?: AutoAccessWorkspace) {
  const context = useWorkspaceMaybe();
  const workspace = override ?? context;
  const auth = useDenAuth();
  const client = workspace?.openworkServerClient;
  const query = useQuery({
    queryKey: autoAccessStatusQueryKey(auth, client?.baseUrl, workspace?.workspaceId),
    enabled: available && isDesktopRuntime() && Boolean(client),
    queryFn: () => client!.desktopFreeStatus(),
    retry: false,
    staleTime: 15_000,
  });
  useEffect(() => {
    if (!available || !client) return;
    const refresh = () => { void query.refetch(); };
    window.addEventListener(autoAccessRefreshEvent, refresh);
    return () => window.removeEventListener(autoAccessRefreshEvent, refresh);
  }, [available, client, query.refetch]);
  return { query, auth };
}

function AutoAccessFooterContent({ available, syncing = false }: { available: boolean; syncing?: boolean }) {
  const { query, auth } = useAutoAccess(available);
  const signIn = useCloudSignIn();
  if ((!available && !syncing) || freeAutoSwitchedOff(query.data) || autoQuietlyUnavailable(query.data)) return null;
  // Every other Auto state has its own notice above the picker footer (Paper "Availability and recovery").
  const status = !syncing && query.data?.state === "ready" && auth.status === "signed_out" ? t("ui.80f14d18d6f0") : null;
  if (!status) return null;
  return <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
    <span role="status">{status}</span>
    {auth.status === "signed_out" ? <Button size="sm" variant="ghost" onClick={() => openAutoSignIn(undefined, signIn)}>{t("ui.821a78fb2044")}</Button> : null}
  </div>;
}

export function AutoAccessNotice(props: { wall: AutoAccessWall; sessionId: string; workspaceId?: string; recovery?: { owner: RejectedTurnOwner; id: string } }) {
  return <AutoAccessWallNotice {...props} />;
}

function AutoAccessWallNotice({ wall, sessionId, workspaceId, recovery }: { wall: AutoAccessWall; sessionId: string; workspaceId?: string; recovery?: { owner: RejectedTurnOwner; id: string } }) {
  const auth = useDenAuth();
  const signIn = useCloudSignIn();
  const copy = autoWallCopy(wall, auth.isSignedIn);
  // Signing in raises the free limit; offer it wherever the notice reads as the limit.
  const offerSignIn = auth.status === "signed_out" && ["limit", "update", "not_offered"].includes(wall.state)
    && wall.code !== "free_not_enrolled" && wall.code !== "managed_models_disabled_for_dpa";
  return <div data-testid="auto-access-wall" data-state={wall.state}>
    <TaskRecovery compact state="paused" title={copy.title} description={copy.detail} technicalDetails={copy.technicalDetails}
      actions={<>
        {offerSignIn ? <Button size="xs" variant="outline" onClick={() => openAutoSignIn(recovery, signIn, { workspaceId, sessionId })}>{t("ui.bfd402b2f6f3")}</Button> : null}
        <Button size="xs" variant="ghost" onClick={() => openAlternativeModelPicker(sessionId)}>{t("ui.78a7ab5e314a")}</Button>
      </>} />
  </div>;
}

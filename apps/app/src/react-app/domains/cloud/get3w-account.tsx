import { t } from "@/i18n";
import { Get3wModelUsage, type ModelUsageSnapshot } from "./get3w-model-usage";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Get3wOrganizations, type OrganizationSnapshot } from "./get3w-organizations";
import { Get3wManagedModels } from "./get3w-managed-models";
import { Get3wBalance, type BalanceSnapshot } from "./get3w-balance";
import { Get3wSettings } from "./get3w-settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Snapshot = {
  status: "signed_out" | "signed_in" | "unavailable";
  user: { id: string; name: string; avatar_url?: string | null } | null;
  pending: boolean;
  error: string | null;
};
import type { SettingsDocument } from "./get3w-settings-policy";
import type { ToolAccessPage } from "./get3w-tool-access";
type ToolAccessIdentity = {userId:string;organizationId:string};
export type ConnectorProvider = "google" | "microsoft";
export type ConnectorSnapshot = {connectors:{provider:ConnectorProvider;configured:boolean;connected:boolean}[]};
export type OrganizationInvitation = {invitation_id:string;organization_id:string;recipient_id:string;role:"admin"|"member"|"viewer";status:string;created_at:number;expires_at:number;organization_name?:string};
export type MembershipInput = {userId:string;organizationId?:string;action:"inbox"|"list"|"invite"|"accept"|"decline"|"revoke"|"remove"|"leave";recipientId?:string;role?:string;invitationId?:string;memberId?:string;after?:string};
type AccountBridge = {
  modelUsage: {
    (input:{userId:string;organizationId?:string;action:"read";after?:string}):Promise<ModelUsageSnapshot>;
    (input:{userId:string;organizationId?:string;action:"limit";memberId:string;limit:number}):Promise<{ok:boolean}>;
  };
  membership: {
    (input:MembershipInput & {action:"inbox"|"list"}):Promise<{invitations:OrganizationInvitation[];next_cursor:string|null}>;
    (input:MembershipInput):Promise<{ok:boolean}>;
  };
  connectors: {
    (input:ToolAccessIdentity & {action:"status"}):Promise<ConnectorSnapshot>;
    (input:ToolAccessIdentity & {action:"authorize"|"disconnect";provider:ConnectorProvider}):Promise<{ok:boolean}>;
  };
  toolAccess: {
    (input:ToolAccessIdentity & {action:"read";memberId:string;after?:string}):Promise<ToolAccessPage>;
    (input:ToolAccessIdentity & ({action:"publish"}|{action:"publishConnector";provider:ConnectorProvider}|{action:"grant";memberId:string;capability:string;enabled:boolean})):Promise<{ok:boolean}>;
  };
  createOrganization: (input:{userId:string;name:string})=>Promise<OrganizationSnapshot>;
  managedMcp: (input:{userId:string;organizationId?:string;workspaceId:string;action:"status"|"enable"|"disable"})=>Promise<{enabled:boolean;state:string}>;
  managedModels: (input:{userId:string;action:"enable"|"disable"|"status"})=>Promise<{enabled:boolean;state:string}>;
  models: (input:{userId:string})=>Promise<{models:{id:string;owned_by:string;protocols:string[]}[]}>;
  balance: (input:{userId:string})=>Promise<BalanceSnapshot>;
  organizations: (input:{userId:string;organizationId?:string|null})=>Promise<OrganizationSnapshot>;
  updateMember: (input:{userId:string;organizationId:string;memberId:string;role:string;active:boolean})=>Promise<{ok:boolean}>;
  members: (input:{userId:string})=>Promise<{organization_id:string;members:{user_id:string;role:string}[]}>;
  settings: (input: { userId: string; value?: SettingsDocument }) => Promise<SettingsDocument> } & Record<"status" | "begin" | "poll" | "cancel" | "logout", () => Promise<Snapshot>>;
declare global { interface Window { __OPENWORK_ACCOUNT__?: AccountBridge } }
const empty: Snapshot = { status: "signed_out", user: null, error: null, pending: false };
let current = empty;
const listeners = new Set<() => void>();
function publish(next: Snapshot) { current = next; for (const listener of listeners) listener(); }
export function useGet3wAccount() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => empty);
}
export const openworkSignInEvent = "openwork:sign-in";
export function openGet3wSignIn(): boolean {
  if (!window.__OPENWORK_ACCOUNT__) return false;
  window.dispatchEvent(new Event(openworkSignInEvent));
  return true;
}

export function Get3wAccount() {
  const bridge = window.__OPENWORK_ACCOUNT__;
  const [open, setOpen] = useState(false);
  const snapshot = useGet3wAccount();
  const setSnapshot = publish;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: "status" | "begin" | "poll" | "cancel" | "logout") {
    if (!bridge) return;
    setBusy(true); setError(null);
    try { setSnapshot(await bridge[action]()); }
    catch (e) { setError(e instanceof Error ? e.message : t("ui.4c468a5e8fa3")); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!bridge) return;
    void run("status");
    const show = () => setOpen(true);
    window.addEventListener(openworkSignInEvent, show);
    return () => window.removeEventListener(openworkSignInEvent, show);
  }, [bridge]);
  useEffect(() => {
    if (!bridge) return;
    const refresh = () => { void run("status"); };
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); };
  }, [bridge]);
  useEffect(() => {
    if (!snapshot.pending || !bridge) return;
    let current = true, inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void bridge.poll().then(next => { if (current) { setSnapshot(next); setError(null); } })
        .catch(() => { if (current) setError(t("ui.365767323393")); })
        .finally(() => { inFlight = false; });
    }, 3000);
    return () => { current = false; window.clearInterval(timer); };
  }, [snapshot.pending, bridge]);
  if (!bridge) return null;
  return <>
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next && snapshot.pending) void run("cancel"); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>{t("ui.ddf6f9a613af")}</DialogTitle>
        <p className="text-sm text-muted-foreground" role="status">
          {snapshot.pending ? t("ui.d5368ee88fd6") : snapshot.user ? `${snapshot.user.name} · ${snapshot.status === "unavailable" ? t("ui.a1794783aab7") : t("ui.ca566c8968e7")}` : t("ui.71513c6f6861")}
        </p>
        {error || snapshot.error ? <p role="alert" className="text-sm text-destructive">{error || snapshot.error}</p> : null}
        {snapshot.user ? <Get3wManagedModels key={`models-${snapshot.user.id}`} userId={snapshot.user.id}/> : null}
        {snapshot.user ? <Get3wModelUsage key={`usage-${snapshot.user.id}`} userId={snapshot.user.id}/> : null}
        {snapshot.user ? <Get3wBalance key={`balance-${snapshot.user.id}`} userId={snapshot.user.id}/> : null}
        {snapshot.user ? <Get3wOrganizations key={`org-${snapshot.user.id}`} userId={snapshot.user.id}/> : null}
        {snapshot.user ? <Get3wSettings key={snapshot.user.id} userId={snapshot.user.id} /> : null}
        <div className="flex gap-2">
          {snapshot.pending ? <Button variant="outline" onClick={() => void run("cancel")} disabled={busy}>{t("ui.9effa0b74884")}</Button> : snapshot.user ? <>
            <Button variant="outline" onClick={() => void run("status")} disabled={busy}>{t("ui.bf8a9eab9e7e")}</Button>
            <Button onClick={() => void run("logout")} disabled={busy}>{t("ui.f4c2d8f107ec")}</Button>
          </> : <Button onClick={() => void run("begin")} disabled={busy}>{t("ui.71513c6f6861")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

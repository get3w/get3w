import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { cachedTaskCatalog, resetTaskCatalog, loadTaskCatalog } from "./task-catalog-store";
import { Get3wBalance } from "./get3w-balance";
import { Get3wConnectors } from "./get3w-connectors";
import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
import { t, useLocale } from "@/i18n";
import type { ModelUsageSnapshot } from "./get3w-model-usage";
import type { BalanceSnapshot } from "./get3w-balance";
import { openDesktopUrlWithStatus } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getReactQueryClient } from "@/react-app/infra/query-client";
import { refreshProviderListQueries } from "@/react-app/infra/provider-list-query";

export type Snapshot = {
  status: "checking" | "signed_out" | "signed_in" | "unavailable";
  user: { id: string; name: string; avatar_url?: string | null } | null;
  pending: boolean;
  error: string | null;
  managedModels?: { enabled?: boolean; state: string; error?: string };
};
import { settingsErrorMessage } from "./get3w-settings-policy";
import type { SettingsDocument } from "./get3w-settings-policy";
type AccountIdentity = {userId:string};
const get3wMark = resolveExtensionIconSrc("/get3w-mark.svg");

export type ConnectorProvider = "google" | "microsoft";
export type ConnectorSnapshot = {connectors:{provider:ConnectorProvider;configured:boolean;connected:boolean}[]};
export type TaskCatalogModel = {
  model_id: string;
  name: string;
  provider_id: string;
  description: string;
  type: string;
  run_type_title: string;
  category: string;
  catalog_version: string;
  base_price: number | null;
  currency: string;
  billing_unit: string | null;
  output_schema: Record<string, unknown> | null;
  api_schema: {api_schemas: {request_schema: Record<string, unknown>; api_path: string}[]};
};
export type TaskCatalogSnapshot = {
  catalog_version: string;
  desktop_defaults?: {schema_version: number; version: string; tasks: Record<string, {slug: string | null; fields: Record<string,string>}>};
  models: TaskCatalogModel[];
  expiresAt: number;
  offline: boolean;
  executionAllowed?: false;
};
export type ModelApproval = { id: string; workspaceId: string; modelTask: {quoteId: string; slug: string; sessionId: string; amountUsd: string; expiresAt: number; budget?:{committedUsd:string;projectedUsd:string;limit:CostPolicy|null}} };
export type OutputFile = {fileId?:string;missing?:boolean;sessionId?:string;rootPath?:string;path:string;mimeType:string;sizeBytes:number;updatedAt?:number};
export type OutputEntry = {id:string;userId:string;workspaceId:string;sessionId:string|null;messageId:string|null;requestId:string|null;slug:string|null;status:string;files:OutputFile[];plannedFiles?:{fileId:string;path:string;rootPath:string}[];outputs:unknown[];structured:unknown;charged:number|string|null;createdAt:number;updatedAt:number;downloadError?:string|null};
export type ModelTask = {submittedAt?:number;estimatedDuration?:number;reservedUsd?:string|null;chargedUsd?:string|null;error?:{code?:string}|null;messageId?:string|null;createdAt?:number;key:string;slug:string;status:string;requestId:string|null;updatedAt:number;sessionId?:string;outputs:unknown[];outputEntry?:OutputEntry|null};
export type CostPolicy = {enabled:boolean;amount:string|null;currency:"USD"|"CNY"};
export type TaskPermissionMode = "default" | "full_access";
export type TaskPermissionSnapshot = { mode: TaskPermissionMode; defaultMode: TaskPermissionMode; grants: {permission: string; patterns: string[]}[]; cost?:{policy:CostPolicy}; costRun?:{messageId:string;committedUsd:string;policy:CostPolicy}|null };
type AccountBridge = {
  taskPermissions?: (input: { action: "read" | "set" | "revoke" | "cost-set"; workspaceId?: string; sessionId?: string; mode?: TaskPermissionMode; confirmed?: boolean; index?: number; policy?:CostPolicy; grant?: {permission: string; patterns: string[]} }) => Promise<TaskPermissionSnapshot>;
  eventSources?: (input: {userId:string;path:string;method:string;body?:unknown}) => Promise<{ok:boolean;status:number;json:unknown;serviceOrigin?:string}>;
  automations?: (input: {userId:string;path:string;method:string;body?:unknown}) => Promise<{ok:boolean;status:number;json:unknown}>;
  artifacts?: (input: {userId:string;path:string;method:string;body?:unknown}) => Promise<{ok:boolean;status:number;json:unknown}>;
  modelTasks?: (input: {userId:string;workspaceId:string;sessionId?:string;action:"list"|"listAll"|"detach"|"retrieve"|"retryDownload"|"refreshResult";key?:string})=>Promise<{items:ModelTask[]}>;
  outputs?: {
    (input:{userId:string;workspaceId:string;action:"index"}):Promise<{items:OutputFile[];truncated:boolean}>;
    (input:{userId:string;workspaceId:string;sessionId?:string;action:"read";path:string;fileId?:string}):Promise<{dataBase64:string;mimeType:string;sizeBytes:number}>;
  };
  modelApprovals?: (input: {workspaceId: string; sessionId: string; action: "list" | "respond"; id?: string; reply?: "allow" | "deny"}) => Promise<{items: ModelApproval[]}>;
  taskCatalog?: (input: {userId: string; offline?: boolean; refresh?: boolean}) => Promise<TaskCatalogSnapshot>;
  modelUsage: (input:{userId:string;action:"read";after?:string})=>Promise<ModelUsageSnapshot>;
  connectors: {
    (input:AccountIdentity & {action:"status"}):Promise<ConnectorSnapshot>;
    (input:AccountIdentity & {action:"authorize"|"disconnect";provider:ConnectorProvider}):Promise<{ok:boolean}>;
  };
  managedMcp: (input:{userId:string;workspaceId:string;sessionId?:string;action:"status"|"enable"|"disable"})=>Promise<{enabled:boolean;state:string}>;
  managedModels: (input:{userId:string;action:"enable"|"disable"|"status"})=>Promise<{enabled:boolean;state:string}>;
  models: (input:{userId:string})=>Promise<{models:{id:string;owned_by:string;protocols:string[]}[]}>;
  balance: (input:{userId:string})=>Promise<BalanceSnapshot>;
  settings: (input: { userId: string; value?: SettingsDocument }) => Promise<SettingsDocument> } & Record<"status" | "begin" | "poll" | "cancel" | "logout", () => Promise<Snapshot>>;
declare global { interface Window { __GET3W_ACCOUNT__?: AccountBridge } }
const empty: Snapshot = { status: "checking", user: null, error: null, pending: false };
let current = empty;
export function readGet3wAccount() { return current; }
const listeners = new Set<() => void>();
function publish(next: Snapshot) {
  const userId = next.status === "signed_in" || next.status === "unavailable" ? next.user?.id : undefined;
  resetTaskCatalog(userId);
  current = next;
  const queryClient = getReactQueryClient();
  // Native auth reconciles the model proxy before returning. A query may have
  // cached an empty catalog before that PATCH/reload, or missed its SSE event.
  // Revalidate after every successful reconciliation, including focus/online
  // recovery for the same account. Do not depend on legacy Den/live-sync flags.
  if (next.status === "signed_in" && next.managedModels?.state === "connected") {
    void refreshProviderListQueries(queryClient).catch(() => {});
  }
  if(userId) void loadTaskCatalog(userId).catch(() => {});
  for (const listener of listeners) listener();
}
export function useGet3wAccount() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => empty);
}
export const get3wSignInEvent = "get3w:sign-in";
export function openGet3wSignIn(): boolean {
  if (!window.__GET3W_ACCOUNT__) return false;
  window.dispatchEvent(new Event(get3wSignInEvent));
  return true;
}

/** Gate before consuming a draft or touching the engine. Self-hosted web has no native account bridge. */
export function requireGet3wSignIn(): boolean {
  if (!window.__GET3W_ACCOUNT__ && !isDesktopRuntime()) return true;
  if (current.status === "signed_in" && current.user) {
    if (cachedTaskCatalog(current.user.id)?.offline) {
      toast.error(t("personal.errors.unavailable"));
      void loadTaskCatalog(current.user.id,true).catch(() => {});
      return false;
    }
    return true;
  }
  openGet3wSignIn();
  return false;
}

/** Register the signed-in account tools before the engine accepts a turn. */
export async function ensureGet3wTaskTools(workspaceId: string, sessionId: string) {
  const bridge = window.__GET3W_ACCOUNT__;
  if (!bridge) return;
  const account = readGet3wAccount();
  if (account.status !== "signed_in" || !account.user) throw new Error("请先登录 Get3W。");
  const userId = account.user.id;
  const assertIdentity = () => {
    const latest = readGet3wAccount();
    if (window.__GET3W_ACCOUNT__ !== bridge || latest.status !== "signed_in" || latest.user?.id !== userId) {
      throw new Error("Get3W 账号已变更，请重试。");
    }
  };
  // Startup authentication can succeed before the model proxy has been applied
  // to the engine. Never consume the draft or register tools against that state.
  const models = await bridge.managedModels({ userId, action: "status" });
  assertIdentity();
  if (!models.enabled || models.state !== "connected") throw new Error("Get3W 模型连接未就绪，请稍后重试。");
  const result = await bridge.managedMcp({ userId, workspaceId, sessionId, action: "enable" });
  assertIdentity();
  if (!result.enabled || result.state !== "configured") throw new Error("Get3W 模型工具未就绪，请稍后重试。");
}

export function DesktopAccountGate({ children }: { children: ReactNode }) {
  const snapshot = useGet3wAccount();
  if (!isDesktopRuntime()) return children;
  return <>
    <Get3wAccount />
    {snapshot.user && (snapshot.status === "signed_in" || snapshot.status === "unavailable") ? children : null}
  </>;
}

export function Get3wAccount() {
  useLocale();
  const bridge = window.__GET3W_ACCOUNT__;
  const [open, setOpen] = useState(false);
  const snapshot = useGet3wAccount();
  const setSnapshot = publish;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration=useRef(0);
  async function run(action: "status" | "begin" | "poll" | "cancel" | "logout") {
    if (!bridge) return;
    const generation=++requestGeneration.current;
    setBusy(true); setError(null);
    try { const next=await bridge[action](); if(generation===requestGeneration.current)setSnapshot(next); }
    catch (e) { if(generation===requestGeneration.current)setError(settingsErrorMessage(e)); }
    finally { if(generation===requestGeneration.current)setBusy(false); }
  }
  useEffect(() => {
    if (!bridge) return;
    void run("status");
    const show = () => setOpen(true);
    window.addEventListener(get3wSignInEvent, show);
    return () => window.removeEventListener(get3wSignInEvent, show);
  }, [bridge]);
  useEffect(() => {
    if (isDesktopRuntime() && bridge && !snapshot.pending && !snapshot.user && snapshot.status === "signed_out") setOpen(true);
    if (snapshot.user) setOpen(false);
  }, [bridge, snapshot.pending, snapshot.status, snapshot.user]);
  useEffect(() => {
    if (!bridge) return;
    let refreshing = false;
    const refresh = () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      void run("status").finally(() => { refreshing = false; });
    };
    // Web profile edits share the same account record. Refresh on return and
    // while visible so another browser/device's edits reach the sidebar too.
    const timer = window.setInterval(() => {
      if (readGet3wAccount().user) refresh();
    }, 60_000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [bridge]);
  useEffect(() => {
    if (!bridge || snapshot.status !== "signed_in" || !snapshot.user
      || !snapshot.managedModels || snapshot.managedModels.state === "connected") return;
    // The account can be verified while the local engine is still starting or
    // deferring its reload. Recover without requiring Settings or a manual click.
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const retry = async () => {
      await run("status");
      if (!disposed && ++attempts < 5) timer = setTimeout(retry, 3000);
    };
    timer = setTimeout(retry, 3000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [bridge, snapshot.status, snapshot.user?.id, snapshot.managedModels?.state]);
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
  const required = isDesktopRuntime() && (!snapshot.user || (snapshot.status !== "signed_in" && snapshot.status !== "unavailable"));
  if (!bridge && !required) return null;
  if (required) return (
    <main data-testid="desktop-sign-in" aria-labelledby="desktop-sign-in-title" className="fixed inset-0 flex min-h-0 flex-col overflow-y-auto bg-background text-foreground">
      <div aria-hidden="true" className="titlebar-drag absolute inset-x-0 top-0 h-14" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-24">
        <div aria-hidden="true" style={{ maskImage: `url(${get3wMark})` }} className="mb-9 size-32 bg-foreground/80 [mask-repeat:no-repeat] [mask-position:center] [mask-size:contain] sm:size-40" />
        <h1 id="desktop-sign-in-title" className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t("desktop.sign_in.headline")}</h1>
        <div className="mt-10 flex w-full max-w-64 flex-col items-center gap-4">
          {snapshot.pending || snapshot.status === "signed_out" ? <Button className="h-11 w-full rounded-full bg-foreground text-base font-medium text-background hover:bg-foreground/90" disabled={busy || !bridge} onClick={() => void run(snapshot.pending ? "cancel" : "begin")}>
            {snapshot.pending ? t("ui.9effa0b74884") : t("ui.71513c6f6861")}
          </Button> : <p role="status" className="flex h-11 items-center text-base text-muted-foreground">{t("desktop.sign_in.loading")}</p>}
          <div className="min-h-10 text-center text-sm text-muted-foreground" aria-live="polite">
            {error || snapshot.error ? <p role="alert" className="text-destructive">{error || settingsErrorMessage(new Error(snapshot.error ?? ""))}</p>
              : snapshot.pending ? <p role="status">{t("ui.d5368ee88fd6")}</p> : null}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-center gap-4 px-6 pb-10 text-xs text-muted-foreground sm:pb-14">
        <a href="https://get3w.com/static/privacy" onClick={event => { event.preventDefault(); void openDesktopUrlWithStatus(event.currentTarget.href).catch(() => setError(t("ui.4c468a5e8fa3"))); }} className="transition-colors hover:text-foreground">{t("desktop.sign_in.privacy")}</a>
        <span aria-hidden="true" className="h-3 w-px bg-border" />
        <a href="https://get3w.com/static/terms" onClick={event => { event.preventDefault(); void openDesktopUrlWithStatus(event.currentTarget.href).catch(() => setError(t("ui.4c468a5e8fa3"))); }} className="transition-colors hover:text-foreground">{t("desktop.sign_in.terms")}</a>
      </footer>
    </main>
  );
  return <>
    <Dialog open={required || open} onOpenChange={(next, details) => {
      if (required && !next) { details.cancel(); return; }
      setOpen(next); if (!next && snapshot.pending) void run("cancel");
    }}>
      <DialogContent showCloseButton={!required} className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>{t("ui.ddf6f9a613af")}</DialogTitle>
        <p className="text-sm text-muted-foreground" role="status">
          {snapshot.pending ? t("ui.d5368ee88fd6") : snapshot.user ? `${snapshot.user.name} · ${snapshot.status === "unavailable" ? t("ui.a1794783aab7") : t("ui.ca566c8968e7")}` : t("ui.71513c6f6861")}
        </p>
        {error || snapshot.error ? <p role="alert" className="text-sm text-destructive">{error || settingsErrorMessage(new Error(snapshot.error ?? ""))}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm">{t("personal.account.web_settings")}</span>
          <Button variant="outline" onClick={() => {
            setError(null);
            void openDesktopUrlWithStatus("https://get3w.com/settings").catch(() => setError(t("ui.4c468a5e8fa3")));
          }}>
            {t("ui.ed077f3d8125")}
            <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-4 text-muted-foreground" />
          </Button>
        </div>
        {snapshot.user ? <div key={snapshot.user.id} className="space-y-3"><Get3wBalance userId={snapshot.user.id}/><Get3wConnectors userId={snapshot.user.id}/></div> : null}
        <div className="flex gap-2">
          {snapshot.pending ? <Button variant="outline" onClick={() => void run("cancel")} disabled={busy}>{t("ui.9effa0b74884")}</Button> : snapshot.user ? <>
            <Button variant="outline" onClick={() => void run("status")} disabled={busy}>{t("ui.bf8a9eab9e7e")}</Button>
            <Button onClick={() => void run("logout")} disabled={busy}>{t("ui.f4c2d8f107ec")}</Button>
          </> : <Button onClick={() => void run("begin")} disabled={busy || !bridge}>{t("ui.71513c6f6861")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

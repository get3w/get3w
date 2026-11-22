import { TaskCostControl } from "./task-cost-control";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/i18n/money";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FullAccessConfirmation } from "./full-access-confirmation";
import { t, useLocale } from "@/i18n";
import type { TaskPermissionMode, TaskPermissionSnapshot } from "../../cloud/get3w-account";

export function TaskPermissionControl({ workspaceId, sessionId }: {workspaceId?: string; sessionId?: string}) {
  useLocale();
  const [snapshot, setSnapshot] = useState<TaskPermissionSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const revision = useRef(0);
  const bridge = window.__GET3W_ACCOUNT__?.taskPermissions;
  useEffect(() => {
    const current = ++generation.current;
    saving.current = false;
    revision.current++;
    setSnapshot(null); setError(false); setConfirm(false); setBusy(false);
    if (!bridge) return;
    const refresh = async () => {
      const started = revision.current;
      try { const result = await bridge({ action: "read", workspaceId, sessionId }); if (generation.current === current && !saving.current && started === revision.current) { setSnapshot(result); setError(false); } }
      catch { if (generation.current === current && !saving.current && started === revision.current) setError(true); }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => { generation.current++; clearInterval(timer); };
  }, [bridge, workspaceId, sessionId]);
  async function update(mode?: TaskPermissionMode, index?: number) {
    if (!bridge || busy) return;
    const current = generation.current;
    revision.current++;
    saving.current = true;
    setBusy(true); setError(false);
    try {
      const result = await bridge({ action: index === undefined ? "set" : "revoke", workspaceId, sessionId, mode, confirmed: mode === "full_access", index, ...(index === undefined ? {} : {grant: snapshot?.grants[index]}) });
      if (current === generation.current) { setSnapshot(result); setConfirm(false); }
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { saving.current = false; setBusy(false); } }
  }
  if (!bridge) return null;
  const full = snapshot?.mode === "full_access";
  const policy = snapshot?.cost?.policy;
  const permissionSummary = snapshot && !error ? t(full ? "permissions.full" : "permissions.default") : t("permissions.unverified");
  const costSummary = policy?.enabled && policy.amount
    ? t("cost.limit_summary", { amount: formatMoney(policy.amount, policy.currency) })
    : t(policy ? "cost.manual_summary" : "cost.unverified");
  const summary = `${permissionSummary} · ${costSummary}`;
  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
      <TooltipTrigger render={<PopoverTrigger aria-label={t("permissions.settings")} type="button" className="inline-flex h-9 min-w-0 items-center gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" disabled={!snapshot && !error}/>} >
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5}/><span className="truncate">{t("permissions.settings")}</span><ChevronDown aria-hidden="true" className="size-3 shrink-0"/>
      </TooltipTrigger>
      <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-80">
        <section aria-label={t("permissions.section")} className="space-y-3">
        <h3 className="text-sm font-medium">{t("permissions.section")}</h3>
        <label className="flex items-center justify-between gap-4">
          {t("permissions.enable")}<Switch aria-label={t("permissions.enable")} checked={full} disabled={busy || !snapshot || error} onCheckedChange={value => { if (value) {setConfirm(true);setOpen(false);} else void update("default"); }}/>
        </label>
        <p className="text-xs text-muted-foreground">{t(full ? "permissions.full_description" : "permissions.default_description")}</p>
        {sessionId && snapshot?.grants.length ? <details><summary>{t("permissions.grants")}</summary><div className="divide-y divide-border">{snapshot.grants.map((grant, index) => <div key={`${grant.permission}:${index}`} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 break-all text-xs">{grant.patterns.join(", ")}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => void update(undefined, index)}>{t("permissions.revoke")}</Button></div>)}</div></details> : null}
        {error ? <div role="alert"><p className="text-destructive">{t("permissions.error")}</p><Button variant="outline" size="sm" disabled={busy} onClick={async () => {const current=generation.current;try { const result=await bridge({action:"read",workspaceId,sessionId});if(current===generation.current){setSnapshot(result);setError(false);}} catch {if(current===generation.current)setError(true);} }}>{t("permissions.retry")}</Button></div> : null}
        </section>
        <TaskCostControl workspaceId={workspaceId} sessionId={sessionId}/>
      </PopoverContent>
    </Popover>
    <FullAccessConfirmation open={confirm} onOpenChange={setConfirm} busy={busy} error={error} onConfirm={() => void update("full_access")} />
  </>;
}

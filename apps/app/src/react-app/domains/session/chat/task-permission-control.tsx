import { useEffect, useRef, useState } from "react";
import { ChevronDown, Folder, Globe, ShieldAlert, ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { t, useLocale } from "@/i18n";
import type { TaskPermissionMode, TaskPermissionSnapshot } from "../../cloud/get3w-account";

export function TaskPermissionControl({ workspaceId, sessionId }: {workspaceId?: string; sessionId?: string}) {
  useLocale();
  const [snapshot, setSnapshot] = useState<TaskPermissionSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
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
    setSnapshot(null); setError(false); setConfirm(false); setAccepted(false); setBusy(false);
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
      const result = await bridge({ action: index === undefined ? "set" : "revoke", workspaceId, sessionId, mode, confirmed: mode === "full_access" && accepted, index, ...(index === undefined ? {} : {grant: snapshot?.grants[index]}) });
      if (current === generation.current) { setSnapshot(result); setConfirm(false); setAccepted(false); }
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { saving.current = false; setBusy(false); } }
  }
  if (!bridge) return null;
  const full = snapshot?.mode === "full_access";
  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger type="button" className="inline-flex h-9 min-w-0 items-center gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" disabled={!snapshot && !error}>
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5}/><span className="truncate">{snapshot ? t(full ? "permissions.full" : "permissions.default") : t("permissions.unverified")}</span><ChevronDown aria-hidden="true" className="size-3 shrink-0"/>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80">
        <p className="text-muted-foreground">{t(full ? "permissions.full_description" : "permissions.default_description")}</p>
        <label className="flex items-center justify-between gap-4 border-t border-border pt-3">
          {t("permissions.enable")}<Switch aria-label={t("permissions.enable")} checked={full} disabled={busy || !snapshot || error} onCheckedChange={value => { if (value) {setAccepted(false);setConfirm(true);setOpen(false);} else void update("default"); }}/>
        </label>
        {sessionId && snapshot?.grants.length ? <details><summary>{t("permissions.grants")}</summary><div className="divide-y divide-border">{snapshot.grants.map((grant, index) => <div key={`${grant.permission}:${index}`} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 break-all text-xs">{grant.patterns.join(", ")}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => void update(undefined, index)}>{t("permissions.revoke")}</Button></div>)}</div></details> : null}
        {error ? <div role="alert"><p className="text-destructive">{t("permissions.error")}</p><Button variant="outline" size="sm" disabled={busy} onClick={async () => {const current=generation.current;try { const result=await bridge({action:"read",workspaceId,sessionId});if(current===generation.current){setSnapshot(result);setError(false);}} catch {if(current===generation.current)setError(true);} }}>{t("permissions.retry")}</Button></div> : null}
      </PopoverContent>
    </Popover>
    <Dialog open={confirm} onOpenChange={value => { if (!busy) {setConfirm(value);setAccepted(false);} }}>
      <DialogContent className="lg:max-w-xl" showCloseButton={!busy}>
        <DialogTitle className="flex items-center gap-3"><ShieldAlert className="text-destructive" size={20}/>{t("permissions.confirm")}</DialogTitle>
        <DialogDescription>{t("permissions.impact")}</DialogDescription>
        <div className="space-y-4 rounded-2xl bg-muted p-4">
          {[{Icon:Folder,key:"files"},{Icon:Terminal,key:"commands"},{Icon:Globe,key:"internet"}].map(({Icon,key}) => <div key={key} className="flex gap-3"><Icon size={18} className="mt-0.5 shrink-0"/><div><p className="font-medium">{t(`permissions.${key}`)}</p><p className="mt-1 text-muted-foreground">{t(`permissions.${key}_detail`)}</p></div></div>)}
        </div>
        <p className="text-muted-foreground">{t("permissions.limits")}</p>
        <label className="flex items-center gap-3"><Checkbox checked={accepted} disabled={busy} onCheckedChange={value => setAccepted(value === true)} aria-label={t("permissions.acknowledge")}/>{t("permissions.acknowledge")}</label>
        {error ? <p role="alert" className="text-destructive">{t("permissions.error")}</p> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => {setConfirm(false);setAccepted(false);}}>{t("permissions.cancel")}</Button><Button variant="destructive" disabled={!accepted || busy} onClick={() => void update("full_access")}>{t("permissions.enable")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

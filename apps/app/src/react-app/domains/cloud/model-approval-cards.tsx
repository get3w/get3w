import { formatMoney } from "@/i18n/money";
import {t,useLocale} from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ModelApproval } from "./get3w-account";

/** Trusted host quotes only; mounted independently for each chat pane. */
export function ModelApprovalCards({workspaceId, sessionId}: {workspaceId: string; sessionId: string}) {
  useLocale();
  const generation=useRef(0);
  const [items, setItems] = useState<ModelApproval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    generation.current++;setItems([]);setError(null);setBusy(false);
    const bridge = window.__GET3W_ACCOUNT__?.modelApprovals;
    if (!bridge) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await window.__GET3W_ACCOUNT__?.modelApprovals?.({workspaceId, sessionId, action: "list"});
        if (!result) return;
        if (!stopped) { setItems(result.items); setError(null); }
      } catch {
        if (!stopped) setError("personal.approval.error");
      } finally {
        if (!stopped) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    void refresh();
    return () => { generation.current++;stopped = true; clearTimeout(timer); };
  }, [workspaceId, sessionId]);
  async function respond(id: string, reply: "allow" | "deny") {
    const started=generation.current;
    setBusy(true);
    try {
      const bridge = window.__GET3W_ACCOUNT__?.modelApprovals;
      if (!bridge) throw new Error("unavailable");
      const result = await bridge({workspaceId, sessionId, action: "respond", id, reply});
      if(started===generation.current){setItems(result.items); setError(null);}
    } catch { if(started===generation.current)setError("personal.approval.respond_error"); }
    finally { if(started===generation.current)setBusy(false); }
  }
  if (!items.length) return error?<p role="alert" className="mx-auto max-w-3xl px-4 text-sm text-destructive">{t(error)}</p>:null;
  return <section aria-label={t("personal.approval.title")} className="mx-auto mb-2 w-full max-w-3xl space-y-3 px-4" aria-live="polite">
    {items.map(item => <div key={item.id} className="space-y-2 border-t border-border py-3 text-sm">
      <p className="font-medium">{t("personal.approval.run",{model:item.modelTask.slug,amount:formatMoney(item.modelTask.amountUsd,"USD")})}</p>
      <p className="text-muted-foreground">{t("personal.approval.consent")}</p>
      {error ? <p role="alert" className="text-destructive">{t(error)}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || Boolean(error)} onClick={() => void respond(item.id, "allow")}>{t("personal.approval.allow")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void respond(item.id, "deny")}>{t("personal.approval.deny")}</Button>
      </div>
    </div>)}
  </section>;
}

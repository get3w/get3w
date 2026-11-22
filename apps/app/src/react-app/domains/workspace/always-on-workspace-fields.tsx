import type { AlwaysOnSettings } from "@get3w/types/workspace";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FullAccessConfirmation } from "../session/chat/full-access-confirmation";
import { t } from "../../../i18n";

/** Draft settings; permissions become effective only after workspace creation. */
export function AlwaysOnWorkspaceFields({ disabled, value, onChange }: { disabled: boolean; value: AlwaysOnSettings; onChange: (value: AlwaysOnSettings) => void }) {
  const id = useId();
  const setFullAccess = (fullAccess: boolean) => onChange({ ...value, fullAccess });
  const [confirmFullAccess, setConfirmFullAccess] = useState(false);
  const setCostAuto = (costAuto: boolean) => onChange({ ...value, costAuto });
  const instructions = [value.goal, value.criteria, value.behavior].filter(text => text?.trim()).join("\n\n");
  return <section className="grid gap-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-label={t("workspace.always_on")}>
    <div className="min-w-0 space-y-3">
    <div className="space-y-2">
      <label htmlFor={`${id}-goal`} className="block text-sm font-medium">{t("workspace.goal")}</label>
      <Textarea id={`${id}-goal`} disabled={disabled} value={instructions} onChange={event => onChange({ ...value, goal: event.currentTarget.value, criteria: "", behavior: "" })} rows={10} className="min-h-64 resize-y" />
    </div>
    </div>
    <div className="min-w-0 space-y-4 sm:border-l sm:border-border sm:pl-6">
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("permissions.section")}</h3>
      <label className="flex min-h-10 items-center justify-between gap-3 text-sm">
        {t("permissions.enable")}<Switch checked={value.fullAccess} aria-label={t("permissions.enable")} onCheckedChange={value => { if (value) setConfirmFullAccess(true); else setFullAccess(false); }} disabled={disabled} />
      </label>
    </div>
    <div className="space-y-2 border-t border-border pt-4">
      <label htmlFor={`${id}-interval`} className="block text-sm font-medium">{t("workspace.check_interval")}</label>
      <div className="flex items-center gap-3"><Input id={`${id}-interval`} type="number" min={1} max={10080} value={value.intervalMinutes} disabled={disabled} onChange={event => onChange({ ...value, intervalMinutes: Number(event.currentTarget.value) })}/><span className="shrink-0 text-sm text-muted-foreground">{t("workspace.minutes")}</span></div>
    </div>
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">{t("cost.section")}</h3>
      <label className="flex min-h-10 items-center justify-between gap-3 text-sm">
        <span>{t("workspace.cost_auto")}</span><Switch checked={value.costAuto} onCheckedChange={setCostAuto} disabled={disabled} />
      </label>
      <label htmlFor={`${id}-limit`} className="block text-sm text-muted-foreground">{t("cost.limit")}</label>
      <div className="flex items-center gap-3"><Input id={`${id}-limit`} value={value.costLimit} onChange={event => onChange({ ...value, costLimit: event.currentTarget.value })} inputMode="decimal" disabled={disabled || !value.costAuto} /><span className="text-sm text-muted-foreground">CNY</span></div>
    </div>
    </div>
    <FullAccessConfirmation open={confirmFullAccess} onOpenChange={setConfirmFullAccess} impact={t("workspace.full_access_impact")} onConfirm={() => { setFullAccess(true); setConfirmFullAccess(false); }} />
  </section>;
}

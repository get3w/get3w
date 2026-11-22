import { alwaysOnErrorText } from "./always-on-error";
import { useEffect, useState } from "react";
import type { AlwaysOnTimers } from "@get3w/types/workspace";
import { nextCalendarOccurrence } from "@get3w/types/workspace-calendar";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { ArrowLeft, CalendarClock, Check, Clock3, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateTimePicker, TimePicker, localDateTime } from "@/components/ui/date-time-picker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { t } from "../../../i18n";

export function AlwaysOnTimersPage({ client, workspaceId, onClose, onOpenSettings, onOpenEvent }: { client: Pick<Get3wServerClient, "alwaysOnTimers" | "addAlwaysOnFollowup" | "cancelAlwaysOnFollowup"> & Partial<Pick<Get3wServerClient,"confirmAlwaysOnFollowup">> | null; workspaceId: string; onClose: () => void; onOpenSettings: () => void; onOpenEvent: (id: string) => void }) {
  const [data, setData] = useState<AlwaysOnTimers | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => {
    let active = true; let fetching = false;

    async function load() {
      if (fetching) return; fetching = true;
      try {
        if (!client) throw new Error(t("workspace.settings_unavailable"));
        const result = await client.alwaysOnTimers(workspaceId);
        if (active) { setData(result); setError(""); }
      } catch (error) { if (active) setError(alwaysOnErrorText(error)); }
      finally { fetching = false; }
    }
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, refresh]);
  const status = data?.status;
  const [text, setText] = useState("");
  const [repeat, setRepeat] = useState("");
  const [daily, setDaily] = useState(false);
  const [dailyAt, setDailyAt] = useState("09:00");
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [policy, setPolicy] = useState("once");
  const [when, setWhen] = useState("");
  const [taskId, setTaskId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [visible, setVisible] = useState(3);
  const followups = [...(data?.followups ?? [])].sort((a, b) => (a.state === "scheduled" ? 0 : 1) - (b.state === "scheduled" ? 0 : 1) || (a.state === "scheduled" ? a.dueAt - b.dueAt : b.createdAt - a.createdAt));
  async function confirm(id:string) {
    if(!client?.confirmAlwaysOnFollowup || busy)return;setBusy(true);
    try{await client.confirmAlwaysOnFollowup(workspaceId,id);setRefresh(value=>value+1);}
    catch(error){setError(alwaysOnErrorText(error));}finally{setBusy(false);}
  }
  async function cancel(id: string) {
    if (!client || busy) return; setBusy(true);
    try { await client.cancelAlwaysOnFollowup(workspaceId, id); setRefresh(value => value + 1); }
    catch (error) { setError(alwaysOnErrorText(error)); }
    finally { setBusy(false); }
  }
  const next = status?.nextRunAt;
  const nextLabel = error ? t("workspace.unverified") : status?.paused ? "—" : next ? new Date(next).toLocaleString() : t("workspace.timers.after_run");
  const sections=["business","followup","suggestions"] as const;
  return <section aria-label={t("workspace.menu_timers")} className="mx-auto w-full max-w-4xl space-y-8 px-5 py-6 sm:px-8">
    <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.overview.back")}</Button></div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{t("workspace.overview.reload")}</Button></div> : null}
    {!status && !error ? <div className="h-36 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-busy="true" /> : null}
    {status ? <section className="space-y-5" aria-label={t("workspace.timers.periodic")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><h2 className="text-sm font-medium">{t("workspace.timers.periodic")}</h2><span className={`flex items-center gap-1.5 text-xs ${error ? "text-muted-foreground" : status.paused ? "text-amber-500" : "text-muted-foreground"}`}><span className="size-1.5 rounded-full bg-current" />{t(`workspace.${error ? "unverified" : status.paused ? "paused" : status.phase}`)}</span></div>
        <Button variant="ghost" size="sm" onClick={onOpenSettings}><SlidersHorizontal className="size-4" />{t("workspace.inbox.settings")}</Button>
      </div>
      <dl className="grid gap-6 rounded-xl bg-muted/30 p-5 sm:grid-cols-2 sm:gap-8">
        <div className="space-y-3"><dt className="text-xs text-muted-foreground">{t("workspace.timers.cadence")}</dt><dd className="flex items-baseline gap-2"><span className="text-3xl font-medium tracking-tight tabular-nums">{status.settings.intervalMinutes}</span><span className="text-sm text-muted-foreground">{t("workspace.minutes")}</span></dd></div>
        <div className="space-y-3 sm:border-l sm:border-border sm:pl-8"><dt className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />{t("workspace.next_check")}</dt><dd className="pt-1 text-sm font-medium tabular-nums">{nextLabel}</dd>{status.retryAt && !status.paused ? <dd className="text-xs text-amber-500">{t("workspace.next_retry")} {new Date(status.retryAt).toLocaleString()}</dd> : null}</div>
      </dl><p className="text-xs text-muted-foreground">{t("workspace.timers.check_policy")}</p>
    </section> : null}
    {sections.map(section=><section key={section} className="space-y-4" aria-label={t(`workspace.timers.${section}`)}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 className="text-sm font-medium">{t(`workspace.timers.${section}`)}</h2></div>{section!=="suggestions" ? <Button size="sm" variant="outline" disabled={!data || busy} onClick={() => { setRequestId(crypto.randomUUID()); setText(""); setDaily(false); setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); setRepeat(section==="business"?"1440":"");setPolicy("once"); setTaskId(data?.currentTaskId ?? ""); setWhen(localDateTime(new Date(Date.now() + 3600000))); setDialogError(""); setEditorOpen(true); }}><Plus className="size-4" />{t(section==="business"?"workspace.timers.add_business":"workspace.timers.add")}</Button> : null}</div>
      <ul className="divide-y divide-border border-y border-border">{followups.filter(item=>section==="suggestions"?item.state==="suggested":item.state!=="suggested" && Boolean(item.repeatMinutes || item.calendar)===(section==="business")).slice(0, visible).map(item => {
        const key = item.state === "scheduled" ? "pending" : item.state;
        const Icon = key === "pending" || key === "suggested" ? Clock3 : key === "triggered" ? Check : X;
        const color = key === "pending" || key === "suggested" ? "text-amber-500" : key === "triggered" ? "text-emerald-500" : "text-muted-foreground";
        return <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-4 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_6rem]">
          <span className={`flex size-8 items-center justify-center rounded-full bg-muted/50 ${color}`}><Icon className="size-4" /></span>
          <div className="min-w-0"><p className={`break-words whitespace-pre-wrap ${key === "cancelled" ? "text-muted-foreground" : "font-medium"}`}>{item.text}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{new Date(item.dueAt).toLocaleString()}</p>{item.calendar ? <p className="mt-1 text-xs text-muted-foreground">{t("workspace.timers.daily")} {item.calendar.at} · {item.calendar.timeZone}</p> : null}{item.repeatMinutes ? <p className="mt-1 text-xs text-muted-foreground">{t("workspace.timers.every")} {item.repeatMinutes} {t("workspace.minutes")}</p>:null}<p className="mt-1 text-xs text-muted-foreground">{t(item.missedPolicy==="skip"?"workspace.timers.skip_policy":"workspace.timers.once_policy")}</p>{item.taskId && data?.tasks?.some(task=>task.id===item.taskId) ? <p className="mt-1 truncate text-xs text-muted-foreground">{t("workspace.timers.related_task")} · {data.tasks.find(task=>task.id===item.taskId)?.title}</p> : null}</div>
          <span className={`col-start-2 text-xs sm:col-start-auto ${color}`}>{t(`workspace.timers.${key}`)}</span>
          <div className="col-start-2 sm:col-start-auto sm:justify-self-end">{key==="suggested" ? <Button size="sm" disabled={busy || !client?.confirmAlwaysOnFollowup || item.dueAt<=Date.now()} onClick={()=>void confirm(item.id)}>{t("workspace.timers.confirm")}</Button>:null}{key !== "cancelled" && key!=="skipped" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (key === "pending" || key==="suggested") void cancel(item.id); else if (item.eventId) onOpenEvent(item.eventId); }}>{t(key === "pending" || key==="suggested" ? item.repeatMinutes || item.calendar?"workspace.timers.cancel_business":"workspace.timers.cancel" : "workspace.timers.event")}</Button> : null}</div>
        </li>;
      })}</ul>
      {data && !followups.some(item=>section==="suggestions"?item.state==="suggested":item.state!=="suggested" && Boolean(item.repeatMinutes || item.calendar)===(section==="business")) ? <p className="py-6 text-sm text-muted-foreground">{t("workspace.timers.empty")}</p> : null}
      {followups.filter(item=>section==="suggestions"?item.state==="suggested":item.state!=="suggested" && Boolean(item.repeatMinutes || item.calendar)===(section==="business")).length > visible ? <Button variant="outline" size="sm" className="w-full" onClick={() => setVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
    </section>)}
    <Dialog open={editorOpen} onOpenChange={open => { if (!busy) setEditorOpen(open); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t(repeat?"workspace.timers.add_business":"workspace.timers.add")}</DialogTitle><form className="min-w-0 space-y-5" onSubmit={async event => {
      event.preventDefault(); if (!client || busy) return;
      let dueAt = new Date(when).getTime();
      const calendar: import("@get3w/types/workspace").AlwaysOnFollowup["calendar"] = daily ? {kind: "daily", at:dailyAt, timeZone:timeZone.trim()} : undefined;
      if(calendar) {
        try { if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(calendar.at))throw Error("Invalid time"); dueAt=nextCalendarOccurrence(calendar,Date.now()); }
        catch { setDialogError(t("workspace.timers.invalid_calendar")); return; }
      }
      if (!text.trim() || !Number.isFinite(dueAt) || dueAt <= Date.now() || repeat && (!Number.isInteger(Number(repeat)) || Number(repeat)<1 || Number(repeat)>525600)) { setDialogError(t("workspace.timers.invalid")); return; }
      setBusy(true); setDialogError("");
      try { await client.addAlwaysOnFollowup(workspaceId, { id: requestId, text, dueAt, taskId: taskId || undefined,calendar,repeatMinutes:repeat && !daily?Number(repeat):undefined,missedPolicy:policy==="skip"?"skip":"once" }); setEditorOpen(false); setRefresh(value => value + 1); }
      catch (error) { setDialogError(alwaysOnErrorText(error)); }
      finally { setBusy(false); }
    }}>{data?.tasks?.length ? <label className="flex flex-col gap-2 text-sm">{t("workspace.timers.related_task")}<Select value={taskId} onValueChange={value=>setTaskId(value ?? "")}><SelectTrigger className="w-full min-w-0" aria-label={t("workspace.timers.related_task")}><SelectValue className="truncate">{data.tasks.find(task=>task.id===taskId)?.title ?? t("workspace.timers.current_task")}</SelectValue></SelectTrigger><SelectContent>{data.tasks.map(task=><SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}</SelectContent></Select></label> : null}<label className="flex flex-col gap-2 text-sm">{t("workspace.timers.task")}<Textarea required maxLength={16000} disabled={busy} value={text} onChange={event => setText(event.target.value)} className="min-h-28 resize-none" /></label>{repeat ? <label className="flex flex-col gap-2 text-sm">{t("workspace.timers.recurrence")}<Select value={daily?"daily":"interval"} onValueChange={value=>setDaily(value==="daily")}><SelectTrigger aria-label={t("workspace.timers.recurrence")}><SelectValue>{t(daily?"workspace.timers.daily":"workspace.timers.interval")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="interval">{t("workspace.timers.interval")}</SelectItem><SelectItem value="daily">{t("workspace.timers.daily")}</SelectItem></SelectContent></Select></label>:null}{daily ? <div className="grid gap-3 sm:grid-cols-2"><fieldset className="flex flex-col gap-2 text-sm"><legend className="mb-2">{t("workspace.timers.daily_time")}</legend><TimePicker value={dailyAt} onChange={setDailyAt} disabled={busy}/></fieldset><label className="flex flex-col gap-2 text-sm">{t("workspace.timers.timezone")}<Input required value={timeZone} onChange={event=>setTimeZone(event.target.value)} disabled={busy}/></label></div>:null}{repeat && !daily ? <label className="flex flex-col gap-2 text-sm">{t("workspace.timers.repeat_minutes")}<Input type="number" min={1} max={525600} required value={repeat} disabled={busy} onChange={event=>setRepeat(event.target.value)} /></label>:null}<label className="flex flex-col gap-2 text-sm">{t("workspace.timers.missed")}<Select value={policy} onValueChange={value=>setPolicy(value ?? "once")}><SelectTrigger aria-label={t("workspace.timers.missed")}><SelectValue>{t(policy==="skip"?"workspace.timers.skip_policy":"workspace.timers.once_policy")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="once">{t("workspace.timers.once_policy")}</SelectItem><SelectItem value="skip">{t("workspace.timers.skip_policy")}</SelectItem></SelectContent></Select></label>{!daily ? <fieldset className="space-y-2"><legend className="mb-2 text-sm">{t("workspace.timers.when")}</legend><DateTimePicker disabled={busy} value={when} onChange={setWhen} /></fieldset>:null}{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<div className="flex justify-end border-t border-border pt-4"><Button type="submit" disabled={busy}>{t(repeat?"workspace.timers.save_business":"workspace.timers.save")}</Button></div></form></DialogContent></Dialog>
  </section>;
}

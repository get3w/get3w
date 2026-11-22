import { ConnectorEventSources } from "./connector-event-sources";
import { EventSourceCatalog } from "./event-source-catalog";
import { GitHubEventSources } from "./github-event-sources";
import { AlwaysOnResult } from "./always-on-result";
import { alwaysOnErrorText } from "./always-on-error";
import { useEffect, useState } from "react";
import type { AlwaysOnInbox, AlwaysOnRun, AlwaysOnSource } from "@get3w/types/workspace";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { ArrowLeft, ChevronRight, Clock3, Folder, Globe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "../../../i18n";

function plain(value: string) { return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*`#]/g, ""); }

type Client = Pick<Get3wServerClient, "alwaysOnInbox" | "reviewAlwaysOnResult" | "saveAlwaysOnSource" | "controlAlwaysOnSource" | "receiveAlwaysOnEvent">;
export function AlwaysOnInboxPage({ client, eventId, workspaceId, onClose, onOpenSettings, onOpenSession }: { eventId?: string; client: Client | null; workspaceId: string; onClose: () => void; onOpenSettings: () => void; onOpenSession: (sessionId: string, messageId: string) => void }) {
  const [data, setData] = useState<AlwaysOnInbox | null>(null);
  const [error, setError] = useState(""); const [visible, setVisible] = useState({ pending: 3, processing: 3, done: 3 }); const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ id?: string; name: string; kind: "files" | "webhook"; scope: string } | null>(null);
  const [removed, setRemoved] = useState<AlwaysOnSource | null>(null);
  const [sending, setSending] = useState<AlwaysOnSource | null>(null); const [eventText, setEventText] = useState(""); const [eventKey, setEventKey] = useState(""); const [eventTaskKey,setEventTaskKey]=useState("");
  const [dialogError, setDialogError] = useState("");
  useEffect(() => {
    let active = true; let fetching = false;
    async function load() {
      if (!client || fetching) return; fetching = true;
      try { const result = await client.alwaysOnInbox(workspaceId, 0, eventId);
        while (result.history.length < visible.done && result.nextOffset !== null) {
          const page = await client.alwaysOnInbox(workspaceId, result.nextOffset);
          if (!active) return;
          const ids = new Set(result.history.map(run => run.id));
          result.history.push(...page.history.filter(run => !ids.has(run.id)));
          if (page.nextOffset === result.nextOffset) break;
          result.nextOffset = page.nextOffset;
        }
        if (active) { setData(result); setError(""); } }
      catch (error) { if (active) setError(alwaysOnErrorText(error)); }
      finally { fetching = false; }
    }
    if (!client) setError(t("workspace.settings_unavailable"));
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, visible.done, revision, eventId]);
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setDialogError("");
    try { await action(); setRevision(value => value + 1); return true; }
    catch (error) { const text = alwaysOnErrorText(error); if (editor || removed || sending) setDialogError(text); else setError(text); return false; }
    finally { setBusy(false); }
  }
  const groups = [{ key: "pending", color: "text-amber-500", events: data?.pending ?? [], total: data?.pending.length ?? 0 }, { key: "processing", color: "text-blue-500", events: data?.processing ?? [], total: data?.processing.length ?? 0 }, { key: "done", color: "text-emerald-500", events: data?.history ?? [], total: data?.historyTotal ?? 0 }];
  const listGroups = groups.map(group => {
    const selected = data?.focusedRun;
    const selectedInGroup = selected && (group.key === "pending" ? selected.phase === "queued" : group.key === "processing" ? ["creating", "submitting", "running", "waiting"].includes(selected.phase) : ["done", "error", "interrupted"].includes(selected.phase));
    return { ...group, events: group.events.filter(run => run.id !== selected?.id), total: group.total - (selectedInGroup ? 1 : 0) };
  });
  function card(run: AlwaysOnRun, group: typeof groups[number]) {
    const failed = run.phase === "error" || run.phase === "interrupted";
    const color = failed ? "text-destructive" : run.phase === "waiting" ? "text-amber-500" : group.color;
    const content = plain(run.text || run.summary || data?.status.settings.goal || "");
    const summary = plain(run.summary || "");
    const hasDetails = Boolean(summary && summary !== content);
    const canOpenChat = Boolean(run.sessionId && run.phase !== "queued" && run.phase !== "creating");
    const showStatus = failed || run.phase === "waiting";
    return <article key={run.id} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="min-w-0 break-words text-muted-foreground">{run.sourceName ?? t(`workspace.overview.trigger_${run.kind}`)}</span>{showStatus ? <span className={color}>{t(`workspace.overview.phase_${run.phase}`)}</span> : null}</div>
      {run.batchSize && run.batchSize>1 ? <p className="text-xs text-muted-foreground">{t("workspace.inbox.batch_count").replace("{count}",String(run.batchSize))}</p>:null}
      <p className="line-clamp-3 break-words text-sm font-medium">{content}</p>
      <time className="block text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</time>
      {group.key === "pending" && data?.status.paused ? <p className="text-xs text-amber-500">{t("workspace.inbox.state_pending")}</p> : null}
      {hasDetails ? <details className="group border-t border-border pt-3 text-xs text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-1"><ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />{t("workspace.inbox.details")}</summary><p className="mt-3 break-words whitespace-pre-wrap">{summary}</p></details> : null}
      <AlwaysOnResult run={run.batchId?{...run,id:run.batchId}:run} client={client} workspaceId={workspaceId} canReview={data?.status.event?.id === (run.batchId ?? run.id)} onUpdated={() => setRevision(value => value + 1)} />
      {canOpenChat ? <Button size="sm" variant="outline" onClick={() => { if (run.sessionId) onOpenSession(run.sessionId, run.messageId); }}>{t("workspace.overview.chat")}</Button> : null}
    </article>;
  }
  return <section className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6 sm:px-8" aria-label={t("workspace.menu_inbox")}>
    <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.overview.back")}</Button></div>
    {error ? <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={() => setRevision(value => value + 1)}>{t("workspace.overview.reload")}</Button></div> : null}
    {!data && !error ? <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-busy="true" /> : null}
    {data ? <Tabs defaultValue="inbox">
      <TabsList variant="line" aria-label={t("workspace.menu_inbox")}><TabsTrigger value="inbox">{t("workspace.inbox.tab")}{data.pending.length + data.processing.length ? <span className="text-muted-foreground">{data.pending.length + data.processing.length}</span> : null}</TabsTrigger><TabsTrigger value="sources">{t("workspace.inbox.sources")}</TabsTrigger></TabsList>
      <TabsContent value="inbox" className="pt-5">{eventId ? <section className="mb-6 space-y-3" aria-label={t("workspace.timers.selected_event")}><h2 className="text-sm font-medium">{t("workspace.timers.selected_event")}</h2>{data.focusedRun ? card(data.focusedRun, groups[data.focusedRun.phase === "queued" ? 0 : ["done", "error", "interrupted"].includes(data.focusedRun.phase) ? 2 : 1]!) : <p className="text-sm text-muted-foreground">{t("workspace.timers.event_missing")}</p>}</section> : null}<div className="grid items-start gap-4 lg:grid-cols-3">{listGroups.map(group => <section key={group.key} aria-label={t(`workspace.inbox.${group.key}`)} className="min-w-0 space-y-3"><h2 className="mb-4 flex items-center gap-2 border-b border-border pb-3 text-sm font-medium"><span className={`size-2 rounded-full bg-current ${group.color}`} />{t(`workspace.inbox.${group.key}`)}<span className="ml-auto text-muted-foreground">{group.total}</span></h2>{group.events.slice(0, visible[group.key === "pending" ? "pending" : group.key === "processing" ? "processing" : "done"]).map(run => card(run, group))}{!group.events.length ? <p className="py-6 text-xs text-muted-foreground">{t("workspace.inbox.empty")}</p> : null}{group.total > visible[group.key === "pending" ? "pending" : group.key === "processing" ? "processing" : "done"] ? <Button size="sm" variant="outline" className="w-full" onClick={() => setVisible(value => group.key === "pending" ? { ...value, pending: value.pending + 3 } : group.key === "processing" ? { ...value, processing: value.processing + 3 } : { ...value, done: value.done + 3 })}>{t("workspace.inbox.load_more")}</Button> : null}</section>)}</div>{data.unreadableCount ? <p className="mt-4 text-xs text-destructive">{t("workspace.overview.unreadable")} ({data.unreadableCount})</p> : null}</TabsContent>
      <TabsContent value="sources" className="space-y-8 pt-5">
        {data.sources.length ? <section aria-label={t("workspace.inbox.merge")}><h2 className="mb-3 text-sm font-medium">{t("workspace.inbox.merge")}</h2><div className="divide-y border-y border-border">{data.sources.map(source=><div key={source.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 truncate text-sm">{source.name}</span><Select value={String(source.mergeWindowSeconds ?? 0)} disabled={busy} onValueChange={value=>{if(value!==null)void mutate(()=>client!.saveAlwaysOnSource(workspaceId,{...source,mergeWindowSeconds:Number(value)},source.id));}}><SelectTrigger className="w-40" aria-label={`${source.name} · ${t("workspace.inbox.merge")}`}><SelectValue>{source.mergeWindowSeconds?t("workspace.inbox.merge_seconds").replace("{seconds}",String(source.mergeWindowSeconds)):t("workspace.inbox.merge_off")}</SelectValue></SelectTrigger><SelectContent>{[0,5,15,30,60].map(seconds=><SelectItem key={seconds} value={String(seconds)}>{seconds?t("workspace.inbox.merge_seconds").replace("{seconds}",String(seconds)):t("workspace.inbox.merge_off")}</SelectItem>)}</SelectContent></Select></div>)}</div></section>:null}


        <section><h2 className="mb-3 text-sm font-medium">{t("workspace.inbox.builtin")}</h2><div className="flex items-center gap-3 border-y border-border py-4"><Clock3 className="size-4 text-muted-foreground" /><span className="flex-1 text-sm">{t("workspace.overview.trigger_timer")}</span><Button size="sm" variant="ghost" onClick={onOpenSettings}>{t("workspace.inbox.settings")}</Button></div></section>
        <EventSourceCatalog onAdd={kind=>{setDialogError("");setEditor({name:"",kind,scope:""});}}/>
        <ConnectorEventSources localSources={data.sources} workspaceId={workspaceId} client={client!} onUpdated={()=>setRevision(v=>v+1)}/><GitHubEventSources localSources={data.sources} workspaceId={workspaceId} client={client!} onUpdated={()=>setRevision(v=>v+1)}/><section><h2 className="mb-3 flex items-center gap-2 text-sm font-medium">{t("workspace.inbox.external")}<span className="text-muted-foreground">{data.sources.filter(s=>!["github","connector"].includes(s.kind)).length}</span></h2><div className="space-y-4">{data.sources.filter(source=>!["github","connector"].includes(source.kind)).map(source => <article key={source.id} className="space-y-4 rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><h3 className="flex min-w-0 items-center gap-2 text-sm font-medium">{source.kind === "files" ? <Folder className="size-4 shrink-0" /> : <Globe className="size-4 shrink-0" />}<span className="break-words">{source.name}</span></h3><span className={`shrink-0 text-xs ${source.enabled ? "text-emerald-500" : "text-muted-foreground"}`}>{t(source.enabled ? "workspace.inbox.enabled" : "workspace.inbox.disabled")}</span></div><dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm"><dt className="text-muted-foreground">{t("workspace.inbox.receive")}</dt><dd className="break-all">{source.kind === "files" ? source.scope || "." : t("workspace.inbox.auth_webhook")}</dd><dt className="text-muted-foreground">{t("workspace.inbox.last_received")}</dt><dd>{source.lastReceived ? new Date(source.lastReceived).toLocaleString() : "—"}</dd></dl>{source.kind === "webhook" ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t("workspace.inbox.endpoint")}</summary><code className="mt-2 block break-all">POST /workspaces/{workspaceId}/always-on/sources/{source.id}/events</code><p className="mt-2">{t("workspace.inbox.payload")}</p></details> : null}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setDialogError(""); setEditor({ id: source.id, kind: source.kind === "files" ? "files" : "webhook", name: source.name, scope: source.scope }); }}>{t("workspace.inbox.edit")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate(() => client!.controlAlwaysOnSource(workspaceId, source.id, source.enabled ? "disable" : "enable"))}>{t(source.enabled ? "workspace.inbox.disable" : "workspace.inbox.enable")}</Button>{source.kind === "webhook" ? <Button size="sm" variant="outline" disabled={busy || !source.enabled} onClick={() => { setSending(source); setEventText("");setEventTaskKey(""); setEventKey(crypto.randomUUID()); setDialogError(""); }}>{t("workspace.inbox.send")}</Button> : null}<Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDialogError(""); setRemoved(source); }}><Trash2 className="size-4" />{t("workspace.inbox.delete")}</Button></div></article>)}{!data.sources.some(s=>!["github","connector"].includes(s.kind)) ? <p className="py-6 text-sm text-muted-foreground">{t("workspace.inbox.no_sources")}</p> : null}</div></section>
      </TabsContent>
    </Tabs> : null}
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t(editor?.id ? "workspace.inbox.edit" : "workspace.inbox.add")}</DialogTitle>{editor ? <form className="flex flex-col gap-5" onSubmit={async event => { event.preventDefault(); if (client && await mutate(() => client.saveAlwaysOnSource(workspaceId, editor, editor.id))) setEditor(null); }}><Tabs value={editor.kind} onValueChange={value => { if (!editor.id && (value === "files" || value === "webhook")) setEditor({ ...editor, kind: value }); }}><TabsList aria-label={t("workspace.inbox.source_kind")}><TabsTrigger value="files" disabled={Boolean(editor.id)}>{t("workspace.inbox.source_files")}</TabsTrigger><TabsTrigger value="webhook" disabled={Boolean(editor.id)}>Webhook</TabsTrigger></TabsList></Tabs><label className="flex flex-col gap-2"><span>{t("workspace.inbox.name")}</span><Input required maxLength={80} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>{editor.kind === "files" ? <label className="flex flex-col gap-2"><span>{t("workspace.inbox.directory")}</span><Input placeholder="." maxLength={200} value={editor.scope} onChange={event => setEditor({ ...editor, scope: event.target.value })} /></label> : <p className="text-xs text-muted-foreground">{t("workspace.inbox.auth_webhook")}</p>}{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<div className="flex justify-end border-t border-border pt-4"><Button type="submit" disabled={busy}>{t("workspace.inbox.save")}</Button></div></form> : null}</DialogContent></Dialog>
    <Dialog open={removed !== null} onOpenChange={open => { if (!open && !busy) setRemoved(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t("workspace.inbox.delete")}</DialogTitle><p className="text-sm">{removed?.name} · {t("workspace.inbox.delete_effect")}</p>{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<Button variant="destructive" disabled={busy} onClick={async () => { if (client && removed && await mutate(() => client.controlAlwaysOnSource(workspaceId, removed.id, "delete"))) setRemoved(null); }}>{t("workspace.inbox.delete")}</Button></DialogContent></Dialog>
    <Dialog open={sending !== null} onOpenChange={open => { if (!open && !busy) setSending(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t("workspace.inbox.send")}</DialogTitle><form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (client && sending && await mutate(() => client.receiveAlwaysOnEvent(workspaceId, sending.id, eventText, eventKey,eventTaskKey.trim() || undefined))) setSending(null); }}><label className="flex flex-col gap-2 text-sm">{t("workspace.inbox.task_key")}<Input maxLength={200} value={eventTaskKey} onChange={event=>setEventTaskKey(event.target.value)} /></label><Textarea required maxLength={16000} aria-label={t("workspace.inbox.content")} value={eventText} onChange={event => setEventText(event.target.value)} />{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<Button type="submit" disabled={busy}>{t("workspace.inbox.send")}</Button></form></DialogContent></Dialog>
  </section>;
}

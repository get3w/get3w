import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Download, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { AlwaysOnMemory, AlwaysOnMemoryChange, AlwaysOnDelivery } from "@get3w/types/workspace";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Get3wServerError, type Get3wServerClient, type Get3wWorkspaceFileContent } from "../../../app/lib/get3w-server";
import { alwaysOnErrorText } from "./always-on-error";
import { t } from "../../../i18n";

type Client = Pick<Get3wServerClient, "alwaysOnStatus" | "readWorkspaceFile" | "alwaysOnMemory" | "changeAlwaysOnMemory"> & Partial<Pick<Get3wServerClient, "alwaysOnOutbox" | "markAlwaysOnReplyViewed">>;
const checkpointPath = ".get3w/always-on/checkpoint.md";
function memoryActions(note: AlwaysOnMemory["notes"][number]): ("enable" | "disable" | "lock" | "unlock" | "delete")[] { return [note.enabled ? "disable" : "enable", note.locked ? "unlock" : "lock", "delete"]; }
const categories = ["all", "notes", "progress", "reported"];

export function AlwaysOnMemoryPage({ client, workspaceId, onClose, onOpenSettings, onOpenSession }: {
  client: Client | null; workspaceId: string; onClose: () => void; onOpenSettings: () => void; onOpenSession?: (sessionId: string, messageId: string) => void;
}) {
  const [data, setData] = useState<{ checkpoint: Get3wWorkspaceFileContent | null; memory: AlwaysOnMemory } | null>(null);
  const [deliveries, setDeliveries] = useState<AlwaysOnDelivery[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(3);
  const [editor, setEditor] = useState<{ id?: string; text: string; revision: number; suggestion?: string; title?: string; sourceUrl?: string; observedAt?: string } | null>(null);
  const [reportedVisible, setReportedVisible] = useState(3);
  const [historyVisible, setHistoryVisible] = useState(3);
  const [blockedVisible, setBlockedVisible] = useState(3);
  const [reviewVisible, setReviewVisible] = useState(3);
  const [clearRevision, setClearRevision] = useState<number | null>(null);
  const [exported, setExported] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialogError, setDialogError] = useState("");
  async function change(input: AlwaysOnMemoryChange) {
    if (!client || busy) return false;
    generation.current++; setBusy(true); setActionError("");
    try { const memory = await client.changeAlwaysOnMemory(workspaceId, input); setData(previous => previous ? { ...previous, memory } : previous); return true; }
    catch (error) { const message = alwaysOnErrorText(error); setActionError(message); setDialogError(message); return false; }
    finally { generation.current++; setBusy(false); }
  }
  useEffect(() => {
    let active = true; let fetching = false;
    setData(null); setError("");
    async function load() {
      if (fetching) return; fetching = true; const currentGeneration = generation.current;
      try {
        if (!client) throw new Error(t("workspace.settings_unavailable"));
        // Validate the workspace type before reading its continuity data.
        await client.alwaysOnStatus(workspaceId);
        const memory = await client.alwaysOnMemory(workspaceId);
        const communication = await client.alwaysOnOutbox?.(workspaceId) ?? [];
        if (active && currentGeneration === generation.current) setDeliveries(communication);
        let checkpoint: Get3wWorkspaceFileContent | null = null;
        try { checkpoint = await client.readWorkspaceFile(workspaceId, checkpointPath, { fileScope: "workspace" }); }
        catch (error) { if (!(error instanceof Get3wServerError && error.status === 404 && error.code === "file_not_found")) throw error; }
        if (active && currentGeneration === generation.current) { setData({ checkpoint, memory }); setError(""); }
      } catch (error) { if (active && currentGeneration === generation.current) setError(alwaysOnErrorText(error)); }
      finally { fetching = false; }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, refresh]);
  const checkpoint = data?.checkpoint;
  const exists = Boolean(checkpoint?.content.trim());
  const matches = exists && (category === "all" || category === "progress") &&
    `${t("workspace.memory.checkpoint")} ${checkpoint?.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const notes = (data?.memory.notes ?? []).filter(note => (category === "all" || category === "notes") && note.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const reported = (data?.memory.reported ?? []).filter(item => (category === "all" || category === "reported") && item.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const blocked = busy || Boolean(error);
  async function exportMemory() {
    if (!client || busy) return;
    setBusy(true); setActionError(""); setExported(false);
    try {
      const memory = await client.alwaysOnMemory(workspaceId);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "get3w-workspace-memory", version: 1, workspaceId, exportedAt: new Date().toISOString(), memory }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `get3w-memory-${workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.json`;
      document.body.append(link);
      try { link.click(); setExported(true); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) { setActionError(alwaysOnErrorText(error)); }
    finally { setBusy(false); }
  }
  return <section aria-label={t("workspace.menu_memory")} className="mx-auto w-full max-w-4xl space-y-5 px-5 py-6 sm:px-8">
    <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.overview.back")}</Button></div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{t("workspace.unverified")} · {error}<Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{t("workspace.overview.reload")}</Button></div> : null}
    {actionError ? <p role="alert" className="text-sm text-destructive">{actionError}</p> : null}
    {!data && !error ? <div aria-busy="true" className="h-36 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" /> : null}
    {data ? <Tabs defaultValue="memory" className="gap-6">
      <TabsList variant="line" aria-label={t("workspace.menu_memory")}>
        <TabsTrigger value="memory">{t("workspace.memory.tab")}</TabsTrigger>
        <TabsTrigger value="review">{t("workspace.memory.review")}{data.memory.suggestions?.length ? <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{data.memory.suggestions.length}</span> : null}</TabsTrigger>
        <TabsTrigger value="settings">{t("workspace.memory.settings")}</TabsTrigger>
      </TabsList>
      <TabsContent value="memory" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Input aria-label={t("workspace.memory.search")} placeholder={t("workspace.memory.search")} value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1" /><Button disabled={blocked} variant="outline" onClick={() => { setEditor({ text: "", revision: data.memory.revision }); setDialogError(""); }}>{t("workspace.memory.add")}</Button></div>
        <div role="group" aria-label={t("workspace.memory.category")} className="flex flex-wrap gap-2">{categories.map(value => <Button key={value} variant={category === value ? "secondary" : "ghost"} size="sm" aria-pressed={category === value} onClick={() => { setCategory(value); setVisible(3); }}>{t(`workspace.memory.${value}`)}</Button>)}</div>
        {notes.slice(0, visible).map(note => <article key={note.id} className="space-y-3 border-t border-border py-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{t("workspace.memory.notes")} · {t(note.enabled && data.memory.useNotes ? "workspace.memory.enabled" : "workspace.memory.disabled")}{note.locked ? ` · ${t("workspace.memory.locked")}` : ""}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={blocked} onClick={() => { setEditor({ id: note.id, text: note.text, title: note.title, sourceUrl: note.sourceUrl, observedAt: note.observedAt, revision: data.memory.revision }); setDialogError(""); }}>{t("workspace.memory.edit")}</Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={blocked} />}>{t("workspace.memory.more")}</DropdownMenuTrigger><DropdownMenuContent align="end">{memoryActions(note).map(action => <DropdownMenuItem key={action} onClick={() => { if (action === "delete") { setDeleting(note.id); setDialogError(""); } else void change({ action, id: note.id, revision: data.memory.revision }); }}>{t(`workspace.memory.${action}`)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div></div>
          {note.title ? <h3 className="text-sm font-medium">{note.title}</h3> : null}<p className="whitespace-pre-wrap break-words text-sm">{note.text}</p>{note.sourceUrl ? <p className="break-all text-xs text-muted-foreground">{note.sourceUrl}{note.observedAt ? ` · ${note.observedAt}` : ""}</p> : null}<p className="text-xs text-muted-foreground">{t("workspace.memory.user_source")} · {new Date(note.updatedAt).toLocaleString()}</p>
        </article>)}
        {notes.length > visible ? <Button variant="outline" size="sm" className="w-full" onClick={() => setVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
        {reported.slice(0, reportedVisible).map(item => <article key={item.messageId} className="space-y-3 border-t border-border py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{t("workspace.memory.replied")} · {new Date(item.completedAt).toLocaleString()}</span>{onOpenSession ? <Button variant="ghost" size="sm" onClick={() => onOpenSession(item.sessionId, item.messageId)}>{t("workspace.memory.view_source")}</Button> : null}</div><p className="whitespace-pre-wrap break-words text-sm">{item.text}</p><div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{t("workspace.memory.notification_state")} · {deliveries.find(row => row.resultId === item.eventId)?.status === "submitted" ? t("workspace.delivery.submitted") : t("workspace.memory.not_confirmed")}</span><span>{item.viewedAt ? `${t("workspace.memory.viewed")} · ${new Date(item.viewedAt).toLocaleString()}` : t("workspace.memory.view_unknown")}</span>{!item.viewedAt && client?.markAlwaysOnReplyViewed ? <Button size="sm" variant="ghost" disabled={blocked} onClick={async () => { try { const memory = await client.markAlwaysOnReplyViewed?.(workspaceId, item.eventId); if (memory) setData(previous => previous ? { ...previous, memory } : previous); } catch (error) { setActionError(alwaysOnErrorText(error)); } }}>{t("workspace.memory.mark_viewed")}</Button> : null}</div>{item.truncated ? <p className="text-xs text-muted-foreground">{t("workspace.memory.excerpt")}</p> : null}</article>)}
        {reported.length > reportedVisible ? <Button variant="outline" size="sm" className="w-full" onClick={() => setReportedVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
        {matches && checkpoint ? <article className="space-y-3 border-y border-border py-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">{t("workspace.memory.checkpoint")}</h2><span className="text-xs text-muted-foreground">{t("workspace.memory.readonly")}</span></div>
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{checkpoint.content}</p>
          <p className="text-xs text-muted-foreground">{t("workspace.memory.saved")} {new Date(checkpoint.updatedAt).toLocaleString()}</p>
          <details className="group"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground"><ChevronRight className="size-3.5 group-open:rotate-90" />{t("workspace.memory.details")}</summary><div className="mt-3 space-y-3"><p className="break-all text-xs text-muted-foreground">{t("workspace.memory.source")} · {checkpointPath}</p><p className="whitespace-pre-wrap break-words text-sm">{checkpoint.content}</p><p className="text-xs text-muted-foreground">{t("workspace.memory.checkpoint_boundary")}</p></div></details>
        </article> : !notes.length && !reported.length ? <div className="space-y-2 py-10 text-center text-sm text-muted-foreground"><p>{t(category === "reported" ? "workspace.memory.reported_empty" : query ? "workspace.memory.no_match" : category === "notes" ? "workspace.memory.notes_empty" : "workspace.memory.empty")}</p>{!exists && !query && category === "all" ? <Button variant="link" size="sm" onClick={onClose}>{t("workspace.overview.back")}</Button> : null}</div> : null}
        {category === "reported" ? <p className="text-xs text-muted-foreground">{t("workspace.memory.reported_boundary")}</p> : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{t("workspace.memory.boundary")}</p>
      </TabsContent>
      <TabsContent value="review" className="space-y-4">
        {(data.memory.suggestions ?? []).slice(0, reviewVisible).map(item => <article key={item.id} className="space-y-3 border-b border-border py-4">
          <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{t("workspace.memory.proposed")} · {new Date(item.createdAt).toLocaleString()}</span>{onOpenSession ? <Button variant="ghost" size="sm" onClick={() => onOpenSession(item.sessionId, item.messageId)}>{t("workspace.memory.view_source")}</Button> : null}</div>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={blocked} onClick={() => void change({ action: "accept", id: item.id, revision: data.memory.revision })}>{t("workspace.memory.accept")}</Button><Button variant="outline" size="sm" disabled={blocked} onClick={() => { setEditor({ text: item.text, suggestion: item.id, revision: data.memory.revision }); setDialogError(""); }}>{t("workspace.memory.edit_accept")}</Button><Button variant="ghost" size="sm" disabled={blocked} onClick={() => void change({ action: "reject", id: item.id, revision: data.memory.revision })}>{t("workspace.memory.reject")}</Button></div>
        </article>)}
        {(data.memory.suggestions?.length ?? 0) > reviewVisible ? <Button variant="outline" size="sm" className="w-full" onClick={() => setReviewVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
        {!data.memory.suggestions?.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t("workspace.memory.review_empty")}</p> : null}
      </TabsContent>
      <TabsContent value="settings" className="space-y-5">
        {exported ? <p role="status" className="text-xs text-muted-foreground">{t("workspace.memory.exported")}</p> : null}
        <div className="divide-y divide-border border-y border-border">
          <div className="flex items-center justify-between gap-4 py-3 text-sm"><span>{t("workspace.goal")}</span><Button variant="ghost" size="sm" onClick={onOpenSettings}>{t("workspace.memory.open_settings")}</Button></div>
          <div className="flex items-center justify-between gap-4 py-4 text-sm"><label htmlFor="memory-use-notes">{t("workspace.memory.use_notes")}</label><Switch id="memory-use-notes" checked={data.memory.useNotes} disabled={blocked} onCheckedChange={useNotes => void change({ action: "settings", useNotes, revision: data.memory.revision })} /></div>
          <div className="flex items-center justify-between gap-4 py-4 text-sm"><label htmlFor="memory-extract">{t("workspace.memory.extract_review")}</label><Switch id="memory-extract" checked={data.memory.extract ?? true} disabled={blocked} onCheckedChange={extract => void change({ action: "settings", extract, revision: data.memory.revision })} /></div>
          <div className="flex items-center justify-between gap-4 py-3 text-sm"><span>{t("workspace.memory.export")}</span><Button variant="outline" size="sm" disabled={blocked} onClick={() => void exportMemory()}><Download className="size-4" />{t("workspace.memory.export")}</Button></div>
          <div className="flex items-center justify-between gap-4 py-3 text-sm"><span>{t("workspace.memory.clear")}</span><Button variant="outline" size="sm" disabled={blocked} onClick={() => { setClearRevision(data.memory.revision); setDialogError(""); }}><Trash2 className="size-4" />{t("workspace.memory.clear")}</Button></div>
        </div>
        <details className="group"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm"><ChevronRight className="size-4 group-open:rotate-90" />{t("workspace.memory.history")}</summary>
          <ul className="mt-3 divide-y divide-border">{(data.memory.history ?? []).slice(0, historyVisible).map(item => <li key={item.id} className="space-y-2 py-3 text-sm"><p>{t(`workspace.memory.action_${item.action}`)} <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></p>{item.before ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{t("workspace.memory.before")} · {item.before}</p> : null}{item.after ? <p className="whitespace-pre-wrap break-words">{t("workspace.memory.after")} · {item.after}</p> : null}</li>)}</ul>
          {!data.memory.history?.length ? <p className="py-4 text-sm text-muted-foreground">{t("workspace.memory.history_empty")}</p> : null}
          {(data.memory.history?.length ?? 0) > historyVisible ? <Button size="sm" variant="outline" onClick={() => setHistoryVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
        </details>
        <details className="group"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm"><ChevronRight className="size-4 group-open:rotate-90" />{t("workspace.memory.usage")}</summary>
          {(data.memory.usage ?? []).map((item, index) => <article key={`${item.messageId}:${item.kind}:${item.submittedAt}:${index}`} className="space-y-2 border-b border-border py-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{t(item.kind === "read" ? "workspace.memory.read_body" : item.kind === "index" ? "workspace.memory.index_submitted" : "workspace.memory.submitted")} · {new Date(item.submittedAt).toLocaleString()}</span>{onOpenSession ? <Button variant="ghost" size="sm" onClick={() => onOpenSession(item.sessionId, item.messageId)}>{t("workspace.memory.view_source")}</Button> : null}</div>{item.notes.length ? item.notes.map(note => <p key={note.id} className="whitespace-pre-wrap break-words">{note.text}</p>) : <p className="text-muted-foreground">{t("workspace.memory.snapshot_empty")}</p>}</article>)}
          {!data.memory.usage?.length ? <p className="py-4 text-sm text-muted-foreground">{t("workspace.memory.usage_empty")}</p> : null}
        </details>
        <details className="group"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm"><ChevronRight className="size-4 group-open:rotate-90" />{t("workspace.memory.blocked")} <span className="text-xs text-muted-foreground">{data.memory.blocked?.length ?? 0}</span></summary>
          {(data.memory.blocked ?? []).slice(0, blockedVisible).map(hash => { const item = data.memory.blockedEntries?.find(item => item.hash === hash); return <div key={hash} className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm"><p className="min-w-0 whitespace-pre-wrap break-words">{item?.text ?? t("workspace.memory.legacy_block")}</p><Button variant="outline" size="sm" disabled={blocked} onClick={() => void change({ action: "unblock", hash, revision: data.memory.revision })}>{t("workspace.memory.unblock")}</Button></div>; })}
          {!data.memory.blocked?.length ? <p className="py-4 text-sm text-muted-foreground">{t("workspace.memory.blocked_empty")}</p> : null}
          {(data.memory.blocked?.length ?? 0) > blockedVisible ? <Button size="sm" variant="outline" onClick={() => setBlockedVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
        </details>
        <p className="text-xs text-muted-foreground">{t("workspace.memory.retention")}</p>
      </TabsContent>
    </Tabs> : null}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t(editor?.suggestion ? "workspace.memory.edit_accept" : editor?.id ? "workspace.memory.edit" : "workspace.memory.add")}</DialogTitle><form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (!editor || !data) return; if (await change(editor.suggestion ? { action: "accept", revision: editor.revision, id: editor.suggestion, text: editor.text } : { action: "save", revision: editor.revision, id: editor.id, text: editor.text, title: editor.title || undefined, sourceUrl: editor.sourceUrl || undefined, observedAt: editor.observedAt || undefined })) setEditor(null); }}>{!editor?.suggestion ? <><Input aria-label={t("workspace.memory.title")} placeholder={t("workspace.memory.title")} maxLength={120} value={editor?.title ?? ""} onChange={event => setEditor(previous => previous ? { ...previous, title: event.target.value } : previous)} /><Input type="url" aria-label={t("workspace.memory.source_url")} placeholder={t("workspace.memory.source_url")} value={editor?.sourceUrl ?? ""} onChange={event => setEditor(previous => previous ? { ...previous, sourceUrl: event.target.value } : previous)} /><Input aria-label={t("workspace.memory.observed_at")} placeholder={t("workspace.memory.observed_at")} value={editor?.observedAt ?? ""} onChange={event => setEditor(previous => previous ? { ...previous, observedAt: event.target.value } : previous)} /></> : null}<Textarea aria-label={t("workspace.memory.content")} required maxLength={2000} value={editor?.text ?? ""} disabled={busy} onChange={event => setEditor(previous => previous ? { ...previous, text: event.target.value } : previous)} className="min-h-36" />{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<div className="flex justify-end"><Button disabled={busy || !editor?.text.trim()} type="submit">{t("workspace.memory.save")}</Button></div></form></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t("workspace.memory.delete")}</DialogTitle><p className="text-sm text-muted-foreground">{t("workspace.memory.delete_boundary")}</p>{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>{t("workspace.memory.cancel")}</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (deleting && data && await change({ action: "delete", id: deleting, revision: data.memory.revision })) setDeleting(null); }}>{t("workspace.memory.delete")}</Button></div></DialogContent></Dialog>
    <Dialog open={clearRevision !== null} onOpenChange={open => { if (!open && !busy) setClearRevision(null); }}><DialogContent aria-describedby={undefined}><DialogTitle>{t("workspace.memory.clear")}</DialogTitle><p className="text-sm text-muted-foreground">{t("workspace.memory.clear_boundary")}</p>{dialogError ? <p role="alert" className="text-sm text-destructive">{dialogError}</p> : null}<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setClearRevision(null)}>{t("workspace.memory.cancel")}</Button><Button variant="outline" disabled={busy} onClick={() => void exportMemory()}>{t("workspace.memory.export")}</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (clearRevision !== null && await change({ action: "clear", revision: clearRevision })) setClearRevision(null); }}>{t("workspace.memory.clear")}</Button></div></DialogContent></Dialog>
  </section>;
}

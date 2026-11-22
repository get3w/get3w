import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "../../../i18n";

import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { alwaysOnErrorText } from "./always-on-error";

export type DeliveryPreviewStatus = "pending" | "sending" | "submitted" | "failed" | "cancelled" | "unconfirmed" | "blocked";
export interface DeliveryPreviewResult {
  id: string; title: string; summary: string; createdAt: number; files: { path: string; content?: string }[]; sessionId?: string | null; messageId?: string;
}
export interface DeliveryPreviewRecord {
  id: string; resultId: string; title: string; text: string; status: DeliveryPreviewStatus; createdAt: number;
  error?: string; sessionId?:string; messageId?:string; attempts: number; lastAttemptAt?: number; notBefore?: number; expiresAt?: number; submittedAt?: number;
}
// Sample records are only supplied by isolated UI fixtures. Live results use durable workspace receipts.
export function AlwaysOnDeliveryPage({ onClose, preview, client, workspaceId, onOpenSession }: {
  onClose: () => void;
  client?: Pick<Get3wServerClient, "alwaysOnDeliverables" | "readWorkspaceFile"> & Partial<Pick<Get3wServerClient,"alwaysOnOutbox"|"changeAlwaysOnOutbox">> | null; workspaceId?: string;
  onOpenSession?: (sessionId: string, messageId: string) => void;
  preview?: { results: DeliveryPreviewResult[]; deliveries: DeliveryPreviewRecord[] };
}) {
  const [liveDeliveries, setLiveDeliveries] = useState<DeliveryPreviewRecord[]>([]);
  const [deliveryError, setDeliveryError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [confirm, setConfirm] = useState<{id:string;action:"retry"|"cancel"|"resolve_sent"|"resolve_cancel"}|null>(null);
  const [tab, setTab] = useState("results");
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(3);
  const [resultVisible, setResultVisible] = useState(3);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [file, setFile] = useState<DeliveryPreviewResult["files"][number] | null>(null);
  const [liveResults, setLiveResults] = useState<DeliveryPreviewResult[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [unreadable, setUnreadable] = useState(0);
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const fileGeneration = useRef(0);
  useEffect(() => {
    if (preview) return;
    let active = true; let fetching = false;
    async function load() {
      if (fetching) return; fetching = true; setBusy(true);
      try {
        if (!client || !workspaceId) throw Error(t("workspace.settings_unavailable"));
        const rows: DeliveryPreviewResult[] = []; let offset: number | null = 0; let unreadableCount = 0;
        for (let page = 0; page < pageCount && offset !== null; page++) {
          const result = await client.alwaysOnDeliverables(workspaceId, offset);
          for (const item of result.results) if (!rows.some(row => row.id === item.id)) rows.push({ ...item, title: item.artifacts[0]?.split("/").pop() ?? t("workspace.delivery.conclusion"), files: item.artifacts.map(path => ({ path })) });
          offset = result.nextOffset; unreadableCount = result.unreadableCount;
        }
        if (active) { setLiveResults(rows); setNextOffset(offset); setUnreadable(unreadableCount); setError(""); setConfirmedAt(Date.now()); }
      } catch (error) { if (active) setError(alwaysOnErrorText(error)); }
      finally { fetching = false; if (active) setBusy(false); }
    }
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, preview, refresh, pageCount]);
  useEffect(() => () => { fileGeneration.current++; }, [client, workspaceId]);
  async function openFile(item: DeliveryPreviewResult["files"][number]) {
    const generation = ++fileGeneration.current;
    setFile(item); setFileError("");
    if (preview) return;
    setFileBusy(true);
    try {
      if (!client || !workspaceId) throw Error(t("workspace.settings_unavailable"));
      const result = await client.readWorkspaceFile(workspaceId, item.path, { fileScope: "workspace" });
      if (fileGeneration.current === generation) setFile({ path: item.path, content: result.content });
    } catch (error) { if (fileGeneration.current === generation) setFileError(alwaysOnErrorText(error)); }
    finally { if (fileGeneration.current === generation) setFileBusy(false); }
  }
  useEffect(() => {
    if (preview || !client?.alwaysOnOutbox || !workspaceId) return;
    let active=true;
    const fetchOutbox=client.alwaysOnOutbox; const id=workspaceId;
    async function load(){try{const items=await fetchOutbox(id);if(active){setLiveDeliveries(items);setDeliveryError("");}}catch(e){if(active)setDeliveryError(alwaysOnErrorText(e));}}
    void load();const timer=setInterval(()=>void load(),5000);return()=>{active=false;clearInterval(timer);};
  },[client,workspaceId,preview,refresh]);
  async function control(){
    if(!confirm||!client?.changeAlwaysOnOutbox||!workspaceId)return;
    setActionBusy(true);setDeliveryError("");
    try{await client.changeAlwaysOnOutbox(workspaceId,confirm);setConfirm(null);setRefresh(v=>v+1);}catch(e){setDeliveryError(alwaysOnErrorText(e));}finally{setActionBusy(false);}
  }
  const results = preview?.results ?? liveResults;
  const deliveries = preview?.deliveries ?? liveDeliveries;
  const filtered = deliveries.filter(item => (filter === "all" || item.status === filter) && (!selectedResult || item.resultId === selectedResult));
  const states: DeliveryPreviewStatus[] = ["pending", "sending", "submitted", "failed", "unconfirmed", "blocked", "cancelled"];
  const statusClass = (status: DeliveryPreviewStatus) => status === "failed" ? "text-destructive" : status === "unconfirmed" ? "text-amber-600" : "text-muted-foreground";
  return <section aria-label={t("workspace.menu_delivery")} className="mx-auto w-full max-w-4xl space-y-5 px-5 py-6 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{t(preview ? "workspace.delivery.sample" : "workspace.delivery.desktop")}</span><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.overview.back")}</Button></div>
    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <TabsList variant="line" aria-label={t("workspace.menu_delivery")}><TabsTrigger value="results">{t("workspace.delivery.results")}</TabsTrigger><TabsTrigger value="deliveries">{t("workspace.delivery.records")}</TabsTrigger></TabsList>
      <TabsContent value="results" className="space-y-1">
        {error ? <div role="alert" className="space-y-2 py-3 text-sm text-destructive"><p>{error}</p>{confirmedAt ? <p className="text-xs text-muted-foreground">{t("workspace.delivery.last_confirmed")} {new Date(confirmedAt).toLocaleString()}</p> : null}<Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>{t("workspace.overview.reload")}</Button></div> : null}
        {!preview && busy && !results.length ? <div aria-busy="true" className="h-40 animate-pulse rounded bg-muted motion-reduce:animate-none" /> : null}

        {(preview ? results.slice(0, resultVisible) : results).map(result => {
          const related = deliveries.filter(item => item.resultId === result.id);
          return <article key={result.id} className="space-y-3 border-b border-border py-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-all text-sm font-medium">{result.title}</h2><span className="text-xs text-muted-foreground">{t("workspace.delivery.saved")}</span></div>
            <p className="whitespace-pre-wrap break-words text-sm">{result.summary}</p>
            <time className="block text-xs text-muted-foreground">{new Date(result.createdAt).toLocaleString()}</time>
            {related.length ? <p className={`text-xs ${statusClass(related[0]!.status)}`}>{t("workspace.delivery.notification")} · {t(`workspace.delivery.${related[0]!.status}`)}</p> : null}
            <div className="flex flex-wrap gap-2">{result.files.map(item => <Button key={item.path} size="sm" variant="outline" className="max-w-full truncate" title={item.path} onClick={() => void openFile(item)}>{item.path.split("/").pop()}</Button>)}<Button size="sm" variant="ghost" disabled={!onOpenSession || !result.sessionId || !result.messageId} onClick={() => { if (onOpenSession && result.sessionId && result.messageId) onOpenSession(result.sessionId, result.messageId); }}>{t("workspace.delivery.conversation")}</Button>{related.length ? <Button size="sm" variant="ghost" onClick={() => { setSelectedResult(result.id); setFilter("all"); setVisible(3); setTab("deliveries"); }}>{t("workspace.delivery.view_records")}</Button> : null}</div>
          </article>;
        })}
        {!results.length && !busy && !error ? <div className="space-y-3 py-12 text-center"><p className="text-sm text-muted-foreground">{t(preview ? "workspace.delivery.results_unconnected" : "workspace.delivery.empty")}</p><Button variant="outline" size="sm" onClick={onClose}>{t("workspace.overview.back")}</Button></div> : null}
        {(preview ? results.length > resultVisible : nextOffset !== null) ? <Button size="sm" variant="outline" className="mt-4 w-full" disabled={busy} onClick={() => { if (preview) setResultVisible(value => value + 3); else setPageCount(value => value + 1); }}>{t("workspace.inbox.load_more")}</Button> : null}
        {unreadable ? <p role="status" className="py-3 text-xs text-destructive">{t("workspace.overview.unreadable")} ({unreadable})</p> : null}
      </TabsContent>
      <TabsContent value="deliveries" className="space-y-4">
        {deliveryError ? <p role="alert" className="text-sm text-destructive">{deliveryError}</p> : null}
        <div role="group" aria-label={t("workspace.delivery.filter")} className="flex flex-wrap gap-2">{["all", ...states].map(value => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" aria-pressed={filter === value} onClick={() => { setFilter(value); setVisible(3); }}>{t(`workspace.delivery.${value}`)}</Button>)}</div>
        {selectedResult ? <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{results.find(item => item.id === selectedResult)?.title}</span><Button size="sm" variant="ghost" onClick={() => { setSelectedResult(null); setVisible(3); }}>{t("workspace.delivery.show_all")}</Button></div> : null}
        {filtered.slice(0, visible).map(item => <article key={item.id} className="space-y-3 border-b border-border py-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-sm font-medium">{item.title}</h2><span className={`text-xs ${statusClass(item.status)}`}>{t(`workspace.delivery.${item.status}`)}</span></div>
          <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>
          <p className="text-xs text-muted-foreground">{t("workspace.delivery.desktop")} · {new Date(item.createdAt).toLocaleString()}</p>
          {item.notBefore || item.expiresAt || item.submittedAt ? <dl className="space-y-2 text-xs text-muted-foreground">{([
            ["scheduled_at",item.notBefore], ["expires_at",item.expiresAt], ["submitted_at",item.submittedAt],
          ] as const).map(([label,at])=>at ? <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{t(`workspace.delivery.${label}`)}</dt><dd><time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString()}</time></dd></div>:null)}</dl>:null}
          {item.error ? <p className={`text-xs ${statusClass(item.status)}`}>{t(`workspace.delivery.error_${item.error}`)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {item.status === "failed" ? <Button size="sm" variant="outline" disabled={Boolean(preview)||!client?.changeAlwaysOnOutbox||actionBusy} onClick={()=>setConfirm({id:item.id,action:"retry"})}>{t("workspace.delivery.retry")}</Button> : null}
            {item.status === "pending" || item.status === "failed" || item.status === "blocked" ? <Button size="sm" variant="ghost" disabled={Boolean(preview)||!client?.changeAlwaysOnOutbox||actionBusy} onClick={()=>setConfirm({id:item.id,action:"cancel"})}>{t("workspace.delivery.cancel")}</Button> : null}
            {item.status === "unconfirmed" ? <Button size="sm" variant="outline" disabled={Boolean(preview)||!client?.changeAlwaysOnOutbox||actionBusy} onClick={()=>setConfirm({id:item.id,action:"resolve_sent"})}>{t("workspace.delivery.check")}</Button> : null}
            {item.status === "blocked" ? <Button size="sm" variant="outline" disabled={Boolean(preview)||!client?.changeAlwaysOnOutbox||actionBusy} onClick={()=>setConfirm({id:item.id,action:"retry"})}>{t("workspace.delivery.retry")}</Button> : null}
            <Button size="sm" variant="ghost" disabled={!results.some(result=>result.id===item.resultId)&&!onOpenSession} onClick={() => { if(!results.some(result=>result.id===item.resultId)&&item.sessionId&&item.messageId&&onOpenSession){onOpenSession(item.sessionId,item.messageId);return;}setTab("results"); setResultVisible(Math.max(3, results.findIndex(result => result.id === item.resultId) + 1)); }}>{t("workspace.delivery.view_result")}</Button>
          </div>
          <details className="group"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground"><ChevronRight className="size-3.5 group-open:rotate-90" />{t("workspace.delivery.attempts")}</summary><dl className="mt-3 space-y-2 text-xs text-muted-foreground"><div className="flex justify-between gap-3"><dt>{t("workspace.delivery.attempt_count")}</dt><dd>{item.attempts}</dd></div>{item.lastAttemptAt ? <div className="flex justify-between gap-3"><dt>{t("workspace.delivery.last_attempt")}</dt><dd>{new Date(item.lastAttemptAt).toLocaleString()}</dd></div> : null}{item.status === "submitted" ? <p>{t("workspace.delivery.submitted_boundary")}</p> : null}</dl></details>
        </article>)}
        {!filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t(deliveryError ? "workspace.unverified" : deliveries.length ? "workspace.delivery.no_match" : "workspace.delivery.records_empty")}</p> : null}
        {filtered.length > visible ? <Button size="sm" variant="outline" className="w-full" onClick={() => setVisible(value => value + 3)}>{t("workspace.inbox.load_more")}</Button> : null}
      </TabsContent>
    </Tabs>
    <Dialog open={Boolean(confirm)} onOpenChange={open=>{if(!open&&!actionBusy)setConfirm(null);}}><DialogContent aria-describedby={undefined}><DialogTitle>{t(confirm?.action==="retry"?"workspace.delivery.retry":confirm?.action==="cancel"?"workspace.delivery.cancel":"workspace.delivery.check")}</DialogTitle><p className="text-sm text-muted-foreground">{t(confirm?.action==="retry"?"workspace.delivery.retry_boundary":confirm?.action==="cancel"?"workspace.delivery.cancel_boundary":"workspace.delivery.check_boundary")}</p>{deliveryError?<p role="alert" className="text-sm text-destructive">{deliveryError}</p>:null}<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={actionBusy} onClick={()=>setConfirm(null)}>{t("workspace.memory.cancel")}</Button>{confirm?.action==="resolve_sent"?<Button variant="outline" disabled={actionBusy} onClick={()=>setConfirm({...confirm,action:"resolve_cancel"})}>{t("workspace.delivery.resolve_cancel")}</Button>:null}<Button disabled={actionBusy} onClick={()=>void control()}>{t(confirm?.action==="retry"?"workspace.delivery.retry":confirm?.action==="cancel"||confirm?.action==="resolve_cancel"?"workspace.delivery.cancel":"workspace.delivery.resolve_sent")}</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(file)} onOpenChange={open => { if (!open) { fileGeneration.current++; setFile(null); setFileBusy(false); } }}><DialogContent aria-describedby={undefined}><DialogTitle>{file?.path.split("/").pop()}</DialogTitle><p className="break-all text-xs text-muted-foreground">{preview ? t("workspace.delivery.sample_file") : file?.path}</p>{fileError ? <div role="alert" className="space-y-3 text-sm text-destructive"><p>{fileError}</p><Button variant="outline" size="sm" onClick={() => { if (file) void openFile(file); }}>{t("workspace.overview.reload")}</Button></div> : null}{fileBusy ? <div aria-busy="true" className="h-32 animate-pulse rounded bg-muted motion-reduce:animate-none" /> : null}<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{file?.content}</pre></DialogContent></Dialog>
  </section>;
}

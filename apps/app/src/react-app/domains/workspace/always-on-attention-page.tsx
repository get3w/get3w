import { useEffect, useState } from "react";
import { ArrowLeft, CircleHelp, LockKeyhole, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n";

import type { AlwaysOnAttention } from "@get3w/types/workspace";
import type { Get3wServerClient } from "@/app/lib/get3w-server";
import { AlwaysOnResult } from "./always-on-result";
import { alwaysOnErrorText } from "./always-on-error";

export interface AttentionPreviewRequest {
  id: string;
  kind: "permission" | "expense" | "question";
  title: string;
  task: string;
  detail: string;
  status: "pending" | "approved" | "rejected" | "answered" | "stale";
  options?: string[];
}

// Sample records belong to isolated UI fixtures. This batch never replies to the engine.
export function AlwaysOnAttentionPage({ onClose, preview, client, workspaceId, onOpenSession }: {
  onClose: () => void; preview?: AttentionPreviewRequest[];
  client?: Pick<Get3wServerClient, "alwaysOnAttention"> & Partial<Pick<Get3wServerClient, "answerAlwaysOnQuestion" | "cancelAlwaysOnQuestion" | "reviewAlwaysOnResult">> | null; workspaceId?: string;
  onOpenSession?: (sessionId: string, messageId: string) => void;
}) {
  if (!preview && client && workspaceId) return <LiveAttention key={workspaceId} client={client} workspaceId={workspaceId} onClose={onClose} onOpenSession={onOpenSession} />;
  return <AttentionPreview onClose={onClose} preview={preview} />;
}

function AttentionPreview({ onClose, preview }: { onClose: () => void; preview?: AttentionPreviewRequest[] }) {
  const [tab, setTab] = useState("pending");
  const [visible, setVisible] = useState(3);
  const rows = preview?.filter(item => tab === "pending" ? item.status === "pending" : item.status !== "pending") ?? [];
  return <section className="mx-auto w-full max-w-3xl space-y-5 px-6 py-6" aria-label={t("workspace.menu_attention")}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{t(preview ? "workspace.attention.preview" : "workspace.attention.not_connected")}</span>
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.attention.back")}</Button>
    </div>
    <Tabs value={tab} onValueChange={value => { setTab(value); setVisible(3); }}>
      <TabsList aria-label={t("workspace.menu_attention")}><TabsTrigger value="pending">{t("workspace.attention.pending")}</TabsTrigger><TabsTrigger value="history">{t("workspace.attention.history")}</TabsTrigger></TabsList>
      <TabsContent value={tab} className="mt-4">
        {!preview ? <p className="py-10 text-sm text-muted-foreground">{t("workspace.attention.unavailable")}</p>
          : !rows.length ? <p className="py-10 text-sm text-muted-foreground">{t("workspace.attention.empty")}</p>
          : <div className="divide-y">{rows.slice(0, visible).map(item => {
            const Icon = item.kind === "permission" ? LockKeyhole : item.kind === "expense" ? Wallet : CircleHelp;
            return <article key={item.id} className="space-y-3 py-4 first:pt-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" /><span>{t(`workspace.attention.${item.kind}`)}</span><span className="ml-auto rounded bg-muted px-2 py-1">{t(`workspace.attention.${item.status}`)}</span></div>
              <h2 className="text-sm font-medium">{item.title}</h2><p className="text-sm whitespace-pre-wrap">{item.detail}</p><p className="text-xs text-muted-foreground">{item.task}</p>
              {item.status === "pending" ? <div className="flex flex-wrap gap-2" title={t("workspace.attention.preview_disabled")}>
                {item.kind === "question" ? item.options?.map(option => <Button key={option} size="sm" variant="outline" disabled>{option}</Button>)
                  : <><Button size="sm" disabled>{t(item.kind === "expense" ? "workspace.attention.approve_expense" : "workspace.attention.allow_once")}</Button><Button size="sm" variant="outline" disabled>{t("workspace.attention.reject")}</Button></>}
              </div> : null}
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t("workspace.attention.details")}</summary><p className="pt-2">{t("workspace.attention.preview_disabled")}</p></details>
            </article>;
          })}</div>}
        {rows.length > visible ? <Button className="mt-4 w-full" variant="outline" onClick={() => setVisible(value => value + 3)}>{t("workspace.attention.more")}</Button> : null}
      </TabsContent>
    </Tabs>
  </section>;
}


function LiveAttention({client, workspaceId, onClose, onOpenSession}: {
  client: Pick<Get3wServerClient, "alwaysOnAttention"> & Partial<Pick<Get3wServerClient, "answerAlwaysOnQuestion" | "cancelAlwaysOnQuestion" | "reviewAlwaysOnResult">>; workspaceId: string;
  onClose: () => void; onOpenSession?: (sessionId: string, messageId: string) => void;
}) {
  const [data, setData] = useState<AlwaysOnAttention | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [repairing, setRepairing] = useState(false);
  useEffect(() => {
    let active = true; let fetching = false;
    async function load() {
      if (fetching) return; fetching = true;
      try { const result = await client.alwaysOnAttention(workspaceId); if (active) { setData(result); setRepairing(Boolean(result.repairingResult)); setError(""); } }
      catch (cause) { if (active) setError(alwaysOnErrorText(cause)); }
      finally { fetching = false; }
    }
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [client, workspaceId, refresh]);
  return <section className="mx-auto w-full max-w-3xl space-y-5 px-6 py-6" aria-label={t("workspace.menu_attention")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{t("workspace.attention.active_task")}{data?.paused ? ` · ${t("workspace.attention.paused")}` : ""}</span><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />{t("workspace.attention.back")}</Button></div>
    {error ? <div role="alert" className="space-y-2 text-sm"><p>{t("workspace.attention.unconfirmed")}</p><p className="text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{t("workspace.attention.retry")}</Button></div> : null}
    {!data && !error ? <p role="status" className="py-10 text-sm text-muted-foreground">{t("workspace.attention.loading")}</p> : null}
    {data && !error && !repairing && !data.resultReview && !data.answerStatus && data.items.length === 0 ? <p role="status" className="py-10 text-sm text-muted-foreground">{t("workspace.attention.no_active_request")}</p> : null}
    {repairing && !data?.resultReview ? <p role="status" className="text-sm text-muted-foreground">{t("workspace.result.repairing")}</p> : null}
    {data?.resultReview ? <article className="space-y-3 py-4">
      <h2 className="text-sm font-medium">{t("workspace.result.blocked")}</h2>
      <AlwaysOnResult run={data.resultReview} workspaceId={workspaceId} client={client.reviewAlwaysOnResult ? { reviewAlwaysOnResult: async (id, eventId, action) => { const status = await client.reviewAlwaysOnResult!(id, eventId, action); setRepairing(action === "repair"); return status; } } : null} canReview={!error} onUpdated={() => setRefresh(value => value + 1)} />
      <Button variant="outline" size="sm" disabled={!onOpenSession || !data.resultReview.sessionId} onClick={() => { const run = data.resultReview; if (run?.sessionId) onOpenSession?.(run.sessionId, run.messageId); }}>{t("workspace.overview.chat")}</Button>
    </article> : null}
    {data?.answerStatus && !data.items.length ? <p role="status" className="text-sm text-muted-foreground">{t(`workspace.attention.answer_${data.answerStatus}`)}</p> : null}
    {data ? <div className="divide-y">{data.items.map(item => <article key={`${item.sessionId}:${item.eventId}:${item.requestId}`} className="space-y-4 py-4 first:pt-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{item.request.kind === "permission" ? <LockKeyhole className="size-4" /> : <CircleHelp className="size-4" />}<span>{t(`workspace.attention.${item.request.kind}`)}</span><span className="ml-auto rounded bg-muted px-2 py-1">{t(error ? "workspace.attention.unconfirmed" : item.answerStatus ? `workspace.attention.answer_${item.answerStatus}` : "workspace.attention.pending")}</span></div>
      {item.request.kind === "permission" ? <><h2 className="text-sm font-medium">{item.request.title}</h2><p className="whitespace-pre-wrap break-words text-sm">{item.request.detail}</p>{item.request.command ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t("workspace.attention.command")}</summary><pre className="mt-2 whitespace-pre-wrap break-all">{item.request.command}</pre></details> : null}</>
        : item.request.questions.map((question, index) => <div key={index} className="space-y-2"><h2 className="text-sm font-medium">{question.question}</h2>{!client.answerAlwaysOnQuestion && question.options.length ? <ul className="space-y-1 text-sm text-muted-foreground">{question.options.map(option => <li key={option.label}>{option.label}{option.description ? ` · ${option.description}` : ""}</li>)}</ul> : null}</div>)}
      {item.request.kind === "question" && client.answerAlwaysOnQuestion && !error ? <QuestionAnswer key={`${item.sessionId}:${item.eventId}:${item.requestId}:${JSON.stringify(item.request)}`} item={item} paused={data.paused} submit={client.answerAlwaysOnQuestion} workspaceId={workspaceId} onSaved={()=>setRefresh(value=>value+1)} /> : null}
      {item.canCancel && client.cancelAlwaysOnQuestion && !error ? <CancelQuestion item={item} workspaceId={workspaceId} cancel={client.cancelAlwaysOnQuestion} onSaved={()=>setRefresh(value=>value+1)} /> : null}
      <Button variant="outline" size="sm" disabled={!onOpenSession} onClick={() => onOpenSession?.(item.sessionId, item.messageId)}>{t("workspace.attention.open_conversation")}</Button>
    </article>)}</div> : null}
  </section>;
}

function QuestionAnswer({item,paused,submit,workspaceId,onSaved}:{item:AlwaysOnAttention["items"][number];paused:boolean;submit:Get3wServerClient["answerAlwaysOnQuestion"];workspaceId:string;onSaved:()=>void}) {
  const [values,setValues]=useState<string[][]>([]);const [custom,setCustom]=useState<string[]>([]);
  const [sending,setSending]=useState(false);const [error,setError]=useState("");const [id]=useState(()=>crypto.randomUUID());
  const [saved,setSaved]=useState(false);
  if(item.request.kind!=="question") return null;
  const request=item.request;
  const locked=sending || saved || Boolean(item.answerStatus);
  const answers=request.questions.map((q,i)=>[...(values[i]??[]),...(q.custom && custom[i]?.trim() ? [custom[i]] : [])]);
  const valid=request.questions.length>0 && answers.every((answer,i)=>answer.length>0 && (request.questions[i].multiple || answer.length===1));
  async function send() {
    if(!valid || locked)return;setSending(true);setError("");
    try {await submit(workspaceId,{id,eventId:item.eventId,sessionId:item.sessionId,request:{...request,kind:"question",requestId:item.requestId},answers});setSaved(true);onSaved();}
    catch(cause){setError(alwaysOnErrorText(cause));}finally{setSending(false);}
  }
  return <div className="space-y-4">
    {item.savedAnswers ? <div className="space-y-1 text-sm">{item.savedAnswers.map((answer,i)=><p key={i} className="whitespace-pre-wrap break-words">{answer.join(" · ")}</p>)}</div> : null}
    {!item.savedAnswers ? request.questions.map((q,i)=><fieldset key={i} disabled={locked} className="space-y-2"><legend className="text-sm font-medium">{q.header || q.question}</legend>
      <div className="flex flex-wrap gap-2">{q.options.map(option=><Button key={option.label} type="button" variant={values[i]?.includes(option.label)?"secondary":"outline"} size="sm" aria-pressed={values[i]?.includes(option.label)??false} onClick={()=>{setValues(previous=>{const next=[...previous];next[i]=q.multiple ? (next[i]?.includes(option.label)?next[i].filter(v=>v!==option.label):[...(next[i]??[]),option.label]) : [option.label];return next;});if(!q.multiple)setCustom(previous=>{const next=[...previous];next[i]="";return next;});}}>{option.label}</Button>)}</div>
      {q.custom?<Textarea aria-label={q.question} placeholder={t("workspace.attention.your_answer")} value={custom[i]??""} onChange={event=>{const text=event.target.value;setCustom(previous=>{const next=[...previous];next[i]=text;return next;});if(!q.multiple)setValues(previous=>{const next=[...previous];next[i]=[];return next;});}} />:null}
    </fieldset>) : null}
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    {item.answerStatus || saved ? <p role="status" className="text-sm text-muted-foreground">{t(`workspace.attention.answer_${item.answerStatus??"queued"}`)}</p>:<Button size="sm" disabled={!valid||locked} onClick={()=>void send()}>{t(paused?"workspace.attention.save_answer":"workspace.attention.submit_answer")}</Button>}
  </div>;
}

function CancelQuestion({item,workspaceId,cancel,onSaved}:{item:AlwaysOnAttention["items"][number];workspaceId:string;cancel:Get3wServerClient["cancelAlwaysOnQuestion"];onSaved:()=>void}) {
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 return <><Button variant="ghost" size="sm" onClick={()=>setOpen(true)}>{t("workspace.attention.cancel_question")}</Button>
 <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent aria-describedby={undefined}>
 <DialogTitle>{t("workspace.attention.cancel_question")}</DialogTitle><p className="text-sm text-muted-foreground">{t("workspace.attention.cancel_effect")}</p>
 {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
 <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{t("workspace.attention.keep_question")}</Button><Button variant="destructive" disabled={busy} onClick={()=>{setBusy(true);setError("");void cancel(workspaceId,{eventId:item.eventId,sessionId:item.sessionId,requestId:item.requestId}).then(()=>{setOpen(false);onSaved();}).catch(cause=>setError(alwaysOnErrorText(cause))).finally(()=>setBusy(false));}}>{t("workspace.attention.cancel_question")}</Button></div>
 </DialogContent></Dialog></>;
}

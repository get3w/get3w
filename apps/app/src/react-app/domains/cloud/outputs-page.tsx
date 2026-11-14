import {useEffect,useRef,useState} from "react";
import {openDesktopWorkspaceFile} from "@/app/lib/desktop";
import {t,useLocale} from "@/i18n";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {useGet3wAccount,type ModelTask,type OutputFile} from "./get3w-account";
import {OutputPreview,outputKind} from "./output-preview";

type Filter="all"|"running"|"image"|"video"|"audio"|"document"|"3d"|"text"|"failed"|"detached";
const filters:Filter[]=["all","running","image","video","audio","document","3d","text","failed","detached"];
const OUTPUT_PAGE_SIZE=20;
export function OutputsPage({workspaceId,workspaceRoot}:{workspaceId:string;sessionId?:string;workspaceRoot?:string}){
 const locale=useLocale();
 const account=useGet3wAccount(),userId=account.status==="signed_in"?account.user?.id:undefined;
 const scopeKey=JSON.stringify([userId,workspaceId]);
 const currentScope=useRef(scopeKey);currentScope.current=scopeKey;
 const [loaded,setLoaded]=useState(""),[items,setItems]=useState<ModelTask[]>([]),[files,setFiles]=useState<OutputFile[]>([]);
 const [filter,setFilter]=useState<Filter>("all"),[query,setQuery]=useState(""),[session,setSession]=useState(""),[displayLimit,setDisplayLimit]=useState(OUTPUT_PAGE_SIZE);
 const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const names:Record<Filter,string>={all:t("personal.copy.all"),running:t("personal.copy.running"),image:t("personal.copy.images"),video:t("personal.copy.video"),audio:t("personal.copy.audio"),document:t("personal.copy.documents"),"3d":"3D",text:t("personal.copy.text"),failed:t("personal.copy.failed"),detached:t("personal.copy.stopped_waiting")};
 const statuses:Record<string,string>={completed:t("personal.copy.completed"),failed:t("personal.copy.failed"),detached:t("personal.copy.stopped_waiting"),processing:t("personal.copy.running"),submitting:t("personal.copy.confirming_submission"),uncertain:t("personal.copy.submission_unconfirmed")};
 useEffect(()=>{
  setError(false);
  if(!userId||!workspaceId)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  async function load(){try{
   if(!window.__GET3W_ACCOUNT__?.modelTasks||!window.__GET3W_ACCOUNT__?.outputs)throw Error("Unavailable");
   const tasks=await window.__GET3W_ACCOUNT__.modelTasks({userId:userId!,workspaceId,action:"listAll"});
   const index=await window.__GET3W_ACCOUNT__?.outputs?.({userId:userId!,workspaceId,action:"index"});
   if(!stopped){setItems(tasks?.items??[]);setFiles(index?.items??[]);setLoaded(scopeKey);setError(false);}
  }catch{if(!stopped)setError(true);}finally{if(!stopped)timer=setTimeout(()=>void load(),5000);}}
  void load();return()=>{stopped=true;clearTimeout(timer);};
 },[scopeKey,attempt,userId,workspaceId]);
 useEffect(()=>{setLoaded("");setItems([]);setFiles([]);setSession("");setError(false);setBusy(false);},[scopeKey]);
 useEffect(()=>{setDisplayLimit(OUTPUT_PAGE_SIZE);},[filter,query,session,scopeKey]);
 const valid=loaded===scopeKey;
 const visible=valid?items.filter(item=>{
  if(session&&(item.outputEntry?.sessionId??item.sessionId)!==session)return false;
  if(!`${item.slug} ${JSON.stringify(item.outputEntry?.structured??item.outputs)}`.toLowerCase().includes(query.toLowerCase()))return false;
  if(filter==="all")return true;
  if(["failed","detached"].includes(filter))return item.status===filter;
  if(filter==="running")return !["completed","failed","detached"].includes(item.status);
  return (item.outputEntry?.files??[]).some(file=>outputKind(file.path)===filter)||(item.outputs??[]).some(value=>typeof value==="string"&&outputKind(value)===filter);
 }).sort((a,b)=>b.updatedAt-a.updatedAt):[];
 const fileIdentity=(file:OutputFile)=>`${file.rootPath??workspaceRoot??""}:${file.path}`;
 const sessions=[...new Set([...items.map(item=>item.outputEntry?.sessionId??item.sessionId),...files.map(file=>file.sessionId)].filter((value):value is string=>Boolean(value)))];
 const saved=new Set(items.flatMap(item=>item.outputEntry?.files.map(file=>fileIdentity(file))??[]));
 const historical=valid&&!["running","failed","detached"].includes(filter)?files.filter(file=>!saved.has(fileIdentity(file))&&(!session||file.sessionId===session)&&file.path.toLowerCase().includes(query.toLowerCase())&&(filter==="all"||outputKind(file.path)===filter)):[];
 const sortedHistorical=historical.sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0));
 const totalCount=visible.length+sortedHistorical.length;
 const renderedVisible=visible.slice(0,displayLimit);
 const renderedHistorical=sortedHistorical.slice(0,Math.max(0,displayLimit-renderedVisible.length));
 const hasMore=displayLimit<totalCount;
 const loadMore=()=>{if(hasMore)setDisplayLimit(value=>Math.min(value+OUTPUT_PAGE_SIZE,totalCount));};
 async function change(item:ModelTask,action:"retryDownload"|"refreshResult"){
  if(!userId||!(item.outputEntry?.sessionId??item.sessionId))return;
  const startedScope=scopeKey;setBusy(true);
  try{await window.__GET3W_ACCOUNT__?.modelTasks?.({userId,workspaceId,sessionId:item.outputEntry?.sessionId??item.sessionId,key:item.key,action});if(currentScope.current===startedScope)setAttempt(value=>value+1);}catch{if(currentScope.current===startedScope)setError(true);}finally{if(currentScope.current===startedScope)setBusy(false);}
 }
 function preview(file:OutputFile,sessionId?:string){return <div key={file.path} className="space-y-2">{workspaceRoot?<Button size="sm" variant="ghost" onClick={()=>void openDesktopWorkspaceFile(file.rootPath??workspaceRoot,file.path,{reveal:true}).catch(()=>setError(true))}>{t("personal.copy.show_in_workspace")}</Button>:null}<OutputPreview file={file} read={async()=>{
  if(!userId||!window.__GET3W_ACCOUNT__?.outputs)throw Error("Unavailable");
  return window.__GET3W_ACCOUNT__.outputs({userId,workspaceId,sessionId:sessionId??file.sessionId,action:"read",path:file.path});
 }}/></div>;}
 return <main onScroll={event=>{const element=event.currentTarget;if(element.scrollTop+element.clientHeight>=element.scrollHeight-240)loadMore();}} className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-auto p-4" aria-label={t("personal.outputs.title")}>
  <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{t("personal.outputs.title")}</h1><Button size="sm" variant="ghost" onClick={()=>setAttempt(value=>value+1)}>{t("personal.copy.refresh")}</Button></div>
  <Input value={query} onChange={event=>setQuery(event.target.value)} aria-label={t("personal.copy.search_outputs")} placeholder={t("personal.copy.search_outputs")}/>
  <div className="flex flex-wrap gap-1" role="toolbar" aria-label={t("personal.copy.filter_outputs")}>{filters.map(value=><Button key={value} size="sm" variant={filter===value?"secondary":"ghost"} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{names[value]}</Button>)}</div>
  <Select value={session||"__all"} onValueChange={value=>setSession(value==="__all"?"":value??"")}><SelectTrigger aria-label={t("personal.copy.filter_by_conversation")}><SelectValue>{session?`${t("personal.copy.conversation")} ${sessions.indexOf(session)+1}`:t("personal.copy.all_conversations")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="__all">{t("personal.copy.all_conversations")}</SelectItem>{sessions.map((value,index)=><SelectItem key={value} value={value}>{t("personal.copy.conversation")} {index+1}</SelectItem>)}</SelectContent></Select>
  {account.status==="checking"?<div className="h-32 animate-pulse rounded bg-muted" aria-label={t("personal.account.checking")} aria-busy="true"/>:null}
  {account.status==="unavailable"?<p role="alert">{t("personal.account.unavailable")}</p>:null}
  {account.status==="signed_out"?<p>{t("personal.copy.sign_in_to_view_outputs")}</p>:null}
  {error?<p role="alert">{t("personal.copy.could_not_update_outputs_showing_last_known_results_refresh_to_re")}</p>:null}
  {!valid&&!error&&userId?<div className="h-32 animate-pulse rounded bg-muted" aria-busy="true"/>:null}
  {valid&&!visible.length&&!historical.length?<p className="text-sm text-muted-foreground">{t("personal.copy.no_matching_outputs_generate_a_file_to_see_it_here")}</p>:null}
  <div className="divide-y">{renderedVisible.map(item=><article key={`${scopeKey}:${item.key}`} className="space-y-3 py-3">
   <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{item.slug}</strong><span className="text-xs text-muted-foreground">{statuses[item.status]??t("personal.copy.running")} · {new Date(item.updatedAt).toLocaleString(locale)}</span></div>
   {item.outputEntry?.files.map(file=>preview(file,item.outputEntry?.sessionId??undefined))}
   {item.outputEntry?.downloadError?<div className="flex flex-wrap items-center gap-2 text-sm"><span>{t("personal.copy.download_failed_remote_results_retained")}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void change(item,"retryDownload")}>{t("personal.copy.retry_download")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void change(item,"refreshResult")}>{t("personal.copy.refresh_result_links")}</Button></div>:null}
   {!item.outputEntry?.files.length?item.outputs.filter((value):value is string=>typeof value==="string"&&value.startsWith("https://")).map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer" className="mr-3 text-sm underline">{t("personal.copy.open_remote_result")} {index+1}</a>):null}
   {item.outputEntry?.structured?<details><summary className="cursor-pointer text-xs text-muted-foreground">{t("personal.copy.structured_result")}</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.outputEntry.structured,null,2)}</pre><Button size="sm" variant="ghost" onClick={()=>void navigator.clipboard.writeText(JSON.stringify(item.outputEntry?.structured,null,2))}>{t("personal.copy.copy_result")}</Button></details>:null}
  </article>)}{renderedHistorical.map(file=><article key={`${scopeKey}:${fileIdentity(file)}`} className="py-3">{preview(file)}</article>)}</div>{hasMore?<div className="py-4 text-center text-xs text-muted-foreground" aria-live="polite">{t("settings.loading")}…</div>:null}
 </main>;
}

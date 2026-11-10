import {t,useLocale} from "@/i18n";
import {useEffect,useRef,useState} from "react";
import {OutputPreview} from "./output-preview";
import {Button} from "@/components/ui/button";
import {useGet3wAccount,type ModelTask} from "./get3w-account";

export function ModelTaskStatus({workspaceId,sessionId}:{workspaceId:string;sessionId:string}) {
  const account=useGet3wAccount();
  const locale=useLocale();
  const userId=account.status==="signed_in"?account.user?.id:undefined;
  const [items,setItems]=useState<ModelTask[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const scope=JSON.stringify([userId,workspaceId,sessionId]);
  const currentScope=useRef(scope);currentScope.current=scope;
  const [loaded,setLoaded]=useState("");
  useEffect(()=>{
    setItems([]);setLoaded("");setBusy(false);setError(null);
    const bridge=window.__GET3W_ACCOUNT__?.modelTasks;
    if(!bridge||!userId)return;
    const identity={userId};
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    async function refresh(){
      try{const result=await window.__GET3W_ACCOUNT__?.modelTasks?.({...identity,workspaceId,sessionId,action:"list"});if(!stopped&&result){setItems(result.items);setLoaded(scope);setError(null);}}
      catch{if(!stopped)setError("refresh");}
      finally{if(!stopped)timer=setTimeout(()=>void refresh(),3000);}
    }
    void refresh();return()=>{stopped=true;clearTimeout(timer);};
  },[userId,workspaceId,sessionId]);
  async function change(key:string,action:"detach"|"retrieve"){
    if(!userId)return;
    setBusy(true);
    try{const result=await window.__GET3W_ACCOUNT__?.modelTasks?.({userId,workspaceId,sessionId,key,action});if(currentScope.current!==scope)return;if(result)setItems(result.items);setLoaded(scope);setError(null);}
    catch{if(currentScope.current===scope)setError("change");}finally{if(currentScope.current===scope)setBusy(false);}
  }
  if(loaded!==scope||!items.length)return null;
  const labels:Record<string,string>={submitting:t("personal.copy.confirming_submission"),uncertain:t("personal.copy.submission_unconfirmed"),submitted:t("personal.copy.submitted"),created:t("personal.copy.queued"),processing:t("personal.copy.running"),completed:t("personal.copy.completed"),failed:t("personal.copy.failed"),detached:t("personal.copy.stopped_waiting")};
  const status=(value:string)=>labels[value]??t("personal.copy.running");
  const media=(url:string)=>{
    try { const parsed=new URL(url); if(parsed.protocol!=="https:" || parsed.hostname!=="xianchou.com") return null;
      const lower=parsed.pathname.toLowerCase();
      if(/\.(png|jpe?g|webp|gif)$/.test(lower)) return <img src={url} alt={t("personal.copy.model_result")} loading="lazy" className="mt-2 max-h-64 max-w-full rounded-md border object-contain" />;
      if(/\.(mp4|webm|mov)$/.test(lower)) return <video src={url} controls preload="metadata" className="mt-2 max-h-64 max-w-full rounded-md border" />;
      if(/\.(mp3|wav|m4a|ogg)$/.test(lower)) return <audio src={url} controls preload="metadata" className="mt-2 w-full" />;
      return null;
    } catch { return null; }
  };
  return <section aria-label={t("personal.copy.model_tasks")} className="mx-auto max-w-3xl space-y-2 px-4 text-sm" aria-live="polite">
    {items.map(item=><div key={item.key} className="border-t border-border py-2">
      <div className="flex items-center justify-between gap-3"><span>{item.slug} · {status(item.status)}</span>
        {item.status==="detached"?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"retrieve")}>{t("personal.copy.retrieve_result")}</Button>:!["completed","failed"].includes(item.status)?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"detach")}>{t("personal.copy.stop_waiting")}</Button>:null}
      </div>
      {!["completed","failed"].includes(item.status)?<p className="text-muted-foreground">{t("personal.copy.after_you_stop_waiting_the_upstream_task_continues_and_remains_bi")}</p>:null}
      {item.outputEntry?.files.map(file=><OutputPreview key={file.path} file={file} read={async()=>{
        if(!userId||!window.__GET3W_ACCOUNT__?.outputs)throw Error("Unavailable");
        return window.__GET3W_ACCOUNT__.outputs({userId,workspaceId,sessionId,action:"read",path:file.path});
      }}/>) }
      {!item.outputEntry?.files.length?item.outputs.filter((output):output is string=>typeof output==="string"&&output.startsWith("https://")).map((url,index)=><span key={index} className="mr-3 inline-block align-top"><a href={url} target="_blank" rel="noreferrer" download className="underline">{t("personal.copy.open_result")} {index+1}</a>{media(url)}</span>):null}
    </div>)}
    {error?<p role="alert" className="text-destructive">{t("personal.copy.could_not_update_tasks_reconnect_and_retry")}</p>:null}
  </section>;
}

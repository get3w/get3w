import {t,useLocale} from "@/i18n";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import type {UIMessage} from "ai";
import {getMessageCreated} from "@/components/chat/utils";
import {generationCategory} from "./generation-models";
import {ImageLightbox} from "@/components/chat/image-lightbox";
import {OutputPreview} from "./output-preview";
import {Button} from "@/components/ui/button";
import {useGet3wAccount,type ModelTask} from "./get3w-account";

type TaskContext = {items:ModelTask[];anchors:Map<string,string>;busy:boolean;error:string|null;change:(key:string,action:"detach"|"retrieve")=>Promise<void>;userId?:string;workspaceId:string;sessionId:string};
const TasksContext=createContext<TaskContext|null>(null);

// Old journals may have no message id. Use submission time, never the last
// message or result time: a task may finish after another turn has started.
export function modelTaskAnchors(items:ModelTask[],messages:UIMessage[]):Map<string,string>{
  const anchors=new Map<string,string>();
  for(const item of items){
    const messageId=item.messageId??item.outputEntry?.messageId;
    if(messageId){
      if(messages.some(message=>message.id===messageId))anchors.set(item.key,messageId);
      continue;
    }
    const createdAt=item.createdAt??item.outputEntry?.createdAt;
    if(createdAt===undefined)continue;
    const message=messages.findLast(message=>{const time=getMessageCreated(message);return time!==null&&time<=createdAt;});
    if(message)anchors.set(item.key,message.id);
  }
  return anchors;
}

export function ModelTasksProvider({workspaceId,sessionId,messages,children}:{workspaceId:string;sessionId:string;messages:UIMessage[];children:ReactNode}) {
  const account=useGet3wAccount();
  useLocale();
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
  const visibleItems=loaded===scope?items:[];
  return <TasksContext.Provider value={{items:visibleItems,anchors:modelTaskAnchors(visibleItems,messages),busy,error,change,userId,workspaceId,sessionId}}>{children}</TasksContext.Provider>;
}

function RemoteImage({url}:{url:string}){
  const [expanded,setExpanded]=useState(false);
  return <><Button variant="ghost" className="mt-2 h-auto p-0" aria-label={t("personal.copy.enlarge_image")} onClick={()=>setExpanded(true)}><img src={url} alt={t("personal.copy.model_result")} loading="lazy" className="max-h-40 max-w-40 rounded-md object-contain" /></Button><ImageLightbox src={url} alt={t("personal.copy.model_result")} open={expanded} onOpenChange={setExpanded}/></>;
}

export function ModelTaskStatus({messageIds}:{messageIds:string[]}) {
  useLocale();
  const context=useContext(TasksContext);
  if(!context)return null;
  const {busy,error,change,userId,workspaceId,sessionId}=context;
  const items=context.items.filter(item=>messageIds.includes(context.anchors.get(item.key)??""));
  if(!items.length)return null;
  const labels:Record<string,string>={submitting:t("personal.copy.confirming_submission"),uncertain:t("personal.copy.submission_unconfirmed"),submitted:t("personal.copy.submitted"),created:t("personal.copy.queued"),processing:t("personal.copy.running"),completed:t("personal.copy.completed"),failed:t("personal.copy.failed"),detached:t("personal.copy.stopped_waiting")};
  const status=(value:string)=>labels[value]??t("personal.copy.running");
  const taskLabel=(slug:string)=>{
    const category=generationCategory(slug.split("/").at(-1)??"");
    const keys:Record<string,string>={image:"image",video:"video",panorama:"panorama","3d":"3d",speech:"speech",music:"music","digital-human":"digital_human"};
    return keys[category]?t(`personal.run_type.${keys[category]}`):t("personal.copy.model_result");
  };
  const media=(url:string)=>{
    try { const parsed=new URL(url); if(parsed.protocol!=="https:" || parsed.hostname!=="xianchou.com") return null;
      const lower=parsed.pathname.toLowerCase();
      if(/\.(png|jpe?g|webp|gif)$/.test(lower)) return <RemoteImage url={url}/>;
      if(/\.(mp4|webm|mov)$/.test(lower)) return <video src={url} controls preload="metadata" className="mt-2 max-h-40 max-w-60 rounded-md" />;
      if(/\.(mp3|wav|m4a|ogg)$/.test(lower)) return <audio src={url} controls preload="metadata" className="mt-2 max-w-60" />;
      return null;
    } catch { return null; }
  };
  return <section aria-label={t("personal.copy.model_tasks")} className="mx-auto w-full max-w-3xl space-y-2 px-2 text-sm md:px-10" aria-live="polite">
    {items.map(item=><div key={item.key} className="space-y-2" data-model-task={item.key}>
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs text-muted-foreground" title={item.slug}>{taskLabel(item.slug)} · {status(item.status)}</span>
        {item.status==="detached"?<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"retrieve")}>{t("personal.copy.retrieve_result")}</Button>:!["completed","failed"].includes(item.status)?<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"detach")}>{t("personal.copy.stop_waiting")}</Button>:null}
      </div>
      {!["completed","failed"].includes(item.status)?<p className="sr-only">{t("personal.copy.after_you_stop_waiting_the_upstream_task_continues_and_remains_bi")}</p>:null}
      {item.outputEntry?.files.map(file=><OutputPreview key={file.path} file={file} compact read={async()=>{
        if(!userId||!window.__GET3W_ACCOUNT__?.outputs)throw Error("Unavailable");
        return window.__GET3W_ACCOUNT__.outputs({userId,workspaceId,sessionId,action:"read",path:file.path});
      }}/>) }
      {!item.outputEntry?.files.length?item.outputs.filter((output):output is string=>typeof output==="string"&&output.startsWith("https://")).map((url,index)=><span key={index} className="mr-3 inline-block align-top"><a href={url} target="_blank" rel="noreferrer" download className="underline">{t("personal.copy.open_result")} {index+1}</a>{media(url)}</span>):null}
    </div>)}
    {error?<p role="alert" className="text-destructive">{t("personal.copy.could_not_update_tasks_reconnect_and_retry")}</p>:null}
  </section>;
}

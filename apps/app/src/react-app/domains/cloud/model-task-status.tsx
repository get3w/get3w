import {t,useLocale} from "@/i18n";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import type {UIMessage} from "ai";
import {marked} from "marked";
import {getMessageCreated} from "@/components/chat/utils";
import {generationCategory} from "./generation-models";
import {ImageLightbox} from "@/components/chat/image-lightbox";
import {OutputPreview} from "./output-preview";
import {Button} from "@/components/ui/button";
import {useGet3wAccount,type ModelTask} from "./get3w-account";

type TaskContext = {displayedImages:Set<string>;registerImage:(path:string)=>()=>void;items:ModelTask[];messages:UIMessage[];anchors:Map<string,string>;busy:boolean;error:string|null;change:(key:string,action:"detach"|"retrieve"|"retryDownload")=>Promise<void>;userId?:string;workspaceId:string;sessionId:string};
const TasksContext=createContext<TaskContext|null>(null);

export function useTaskImageRegistration(){
  return useContext(TasksContext)?.registerImage;
}

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

// Only assistant images in this task's turn can replace its result preview.
// Local image links render inline previews; user references never replace results.
export function modelTaskImageSources(messages:UIMessage[],anchor:string):Set<string>{
  const index=messages.findIndex(message=>message.id===anchor);
  if(index<0)return new Set();
  let start=index,end=index+1;
  while(start>0&&messages[start].role!=="user"&&messages[start-1].role!=="user")start--;
  while(end<messages.length&&messages[end].role!=="user")end++;
  const sources=new Set<string>();
  for(const message of messages.slice(start,end)){
    if(message.role!=="assistant")continue;
    for(const part of message.parts){
      if(part.type==="file"&&part.mediaType.startsWith("image/")&&part.url&&!part.url.startsWith("file:"))sources.add(part.url);
      if(part.type==="text")marked.walkTokens(marked.lexer(part.text),token=>{if(token.type==="image" || (token.type==="link" && !/^[a-z][a-z0-9+.-]*:/i.test(token.href) && /\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#].*)?$/i.test(token.href)))sources.add(token.href);});
    }
  }
  return sources;
}

export function hasDisplayedTaskImage(sources:Set<string>,urls:string[],dataBase64?:string):boolean{
  if(urls.some(url=>sources.has(url)))return true;
  return dataBase64!==undefined&&[...sources].some(source=>{
    const match=/^data:image\/[^;,]+;base64,([\s\S]+)$/.exec(source);
    return match!==null&&match[1].replace(/\s/g,"")===dataBase64.replace(/\s/g,"");
  });
}

/** Read tools may resize/re-encode PNG outputs as JPEG previews. Compare
 * decoded pixels at thumbnail size instead of requiring identical file bytes. */
export async function hasMatchingTaskImage(sources:Set<string>,urls:string[],dataBase64:string,mimeType:string):Promise<boolean>{
  if(hasDisplayedTaskImage(sources,urls,dataBase64))return true;
  const candidates=[...sources].filter(source=>source.startsWith("data:image/"));
  if(!candidates.length)return false;
  async function pixels(source:string){
    const image=new window.Image();image.src=source;await image.decode();
    const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;
    const context=canvas.getContext("2d");if(!context)throw Error("Image comparison unavailable");
    context.fillStyle="white";context.fillRect(0,0,32,32);context.drawImage(image,0,0,32,32);
    return {data:context.getImageData(0,0,32,32).data,ratio:image.naturalWidth/image.naturalHeight};
  }
  try{
    const output=await pixels(`data:${mimeType};base64,${dataBase64}`);
    for(const source of candidates){
      try{
        const candidate=await pixels(source);
        if(Math.abs(candidate.ratio-output.ratio)>0.01)continue;
        let squared=0;
        for(let i=0;i<output.data.length;i++)if(i%4!==3)squared+=(output.data[i]-candidate.data[i])**2;
        if(Math.sqrt(squared/(32*32*3))<4)return true;
      }catch{/* An unreadable preview must not hide the task result. */}
    }
  }catch{/* Keep the result preview when decoding is unavailable. */}
  return false;
}

export function ModelTasksProvider({workspaceId,sessionId,messages,children}:{workspaceId:string;sessionId:string;messages:UIMessage[];children:ReactNode}) {
  const account=useGet3wAccount();
  const [displayedImages,setDisplayedImages]=useState<Set<string>>(new Set());
  const imageCounts=useRef(new Map<string,number>());
  const registerImage=useCallback((path:string)=>{
    imageCounts.current.set(path,(imageCounts.current.get(path)??0)+1);
    setDisplayedImages(new Set(imageCounts.current.keys()));
    return()=>{
      const count=(imageCounts.current.get(path)??1)-1;
      if(count)imageCounts.current.set(path,count);else imageCounts.current.delete(path);
      setDisplayedImages(new Set(imageCounts.current.keys()));
    };
  },[]);
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
  async function change(key:string,action:"detach"|"retrieve"|"retryDownload"){
    if(!userId)return;
    setBusy(true);
    try{const result=await window.__GET3W_ACCOUNT__?.modelTasks?.({userId,workspaceId,sessionId,key,action});if(currentScope.current!==scope)return;if(result)setItems(result.items);setLoaded(scope);setError(null);}
    catch{if(currentScope.current===scope)setError("change");}finally{if(currentScope.current===scope)setBusy(false);}
  }
  const visibleItems=loaded===scope?items:[];
  return <TasksContext.Provider value={{displayedImages,registerImage,items:visibleItems,messages,anchors:modelTaskAnchors(visibleItems,messages),busy,error,change,userId,workspaceId,sessionId}}>{children}</TasksContext.Provider>;
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
    {items.map(item=>{
      const sources=new Set([...modelTaskImageSources(context.messages,context.anchors.get(item.key)??"")].filter(source=>context.displayedImages.has(source)));
      const urls=item.outputs.flatMap(output=>typeof output==="string"?[output]:output&&typeof output==="object"&&"url" in output&&typeof output.url==="string"?[output.url]:[]);
      return <div key={item.key} className="space-y-2" data-model-task={item.key}>
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs text-muted-foreground" title={item.slug}>{taskLabel(item.slug)} · {status(item.status)}</span>
        {item.status==="detached"?<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"retrieve")}>{t("personal.copy.retrieve_result")}</Button>:!["completed","failed"].includes(item.status)?<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"detach")}>{t("personal.copy.stop_waiting")}</Button>:null}
      </div>
      {item.chargedUsd?<p className="text-xs text-muted-foreground">{t("personal.media.charged")} ${item.chargedUsd} USD</p>:item.reservedUsd?<p className="text-xs text-muted-foreground">{t("personal.media.reserved")} ${item.reservedUsd} USD</p>:null}
      {item.status==="failed"?<p role="alert" className="text-sm text-destructive">{t("personal.media.failed")}</p>:null}
      {item.status==="failed"&&item.error?.code?<details className="text-xs text-muted-foreground"><summary>{t("text_activity.technical_details")}</summary><pre>{item.error.code}</pre></details>:null}
      {item.outputEntry?.downloadError?<div className="flex items-center gap-2 text-xs"><span>{t("personal.copy.download_failed_remote_results_retained")}</span><Button size="xs" variant="ghost" disabled={busy} onClick={()=>void change(item.key,"retryDownload")}>{t("personal.copy.retry_download")}</Button></div>:null}
      {!["completed","failed"].includes(item.status)?<p className="sr-only">{t("personal.copy.after_you_stop_waiting_the_upstream_task_continues_and_remains_bi")}</p>:null}
      {item.outputEntry?.files.map(file=><OutputPreview key={file.path} file={file} compact hideImage={value=>hasMatchingTaskImage(sources,urls.length===1?urls:[],value.dataBase64,value.mimeType)} read={async()=>{
        if(!userId||!window.__GET3W_ACCOUNT__?.outputs)throw Error("Unavailable");
        return window.__GET3W_ACCOUNT__.outputs({userId,workspaceId,sessionId,action:"read",path:file.path});
      }}/>) }
      {!item.outputEntry?.files.length?urls.filter(url=>url.startsWith("https://")).map((url,index)=><span key={index} className="mr-3 inline-block align-top"><a href={url} target="_blank" rel="noreferrer" download className="underline">{t("personal.copy.open_result")} {index+1}</a>{hasDisplayedTaskImage(sources,[url])?null:media(url)}</span>):null}
      {item.status==="completed"&&!urls.length&&item.outputEntry?.structured?<details className="text-xs"><summary>{t("personal.copy.model_result")}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(item.outputEntry.structured,null,2)}</pre></details>:null}
    </div>;})}
    {error?<p role="alert" className="text-destructive">{t("personal.copy.could_not_update_tasks_reconnect_and_retry")}</p>:null}
  </section>;
}

import {PdfPreview} from "../session/artifacts/preview";
import {useEffect,useRef,useState} from "react";
import {t,useLocale} from "@/i18n";
import {Button} from "@/components/ui/button";
import {ImageLightbox} from "@/components/chat/image-lightbox";
import type {OutputFile} from "./get3w-account";

export function outputKind(path:string):"image"|"video"|"audio"|"document"|"3d"|"text"{
 const extension=path.split("?")[0]?.split(".").at(-1)?.toLowerCase();
 if(["png","jpg","jpeg","webp","gif"].includes(extension??""))return "image";
 if(["mp4","webm","mov"].includes(extension??""))return "video";
 if(["mp3","wav","m4a","ogg"].includes(extension??""))return "audio";
 if(["glb","gltf","obj","stl","zip"].includes(extension??""))return "3d";
 if(["pdf","docx","html","htm"].includes(extension??""))return "document";
 return "text";
}
export function OutputPreview({file,read,compact=false}:{compact?:boolean;file:OutputFile;read:()=>Promise<{dataBase64:string;mimeType:string;sizeBytes:number}>}){
 const locale=useLocale();
 const containerRef=useRef<HTMLDivElement>(null);
 const [inView,setInView]=useState(false);
 const [src,setSrc]=useState(""),[text,setText]=useState(""),[error,setError]=useState(false),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0);
 const kind=outputKind(file.path);
 useEffect(()=>{
  const element=containerRef.current;
  if(!element)return;
  if(typeof IntersectionObserver==="undefined"){setInView(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setInView(true);observer.disconnect();}},{rootMargin:"600px 0px"});
  observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!inView)return;
  let stopped=false,url="";setError(false);setSrc("");setText("");
  void read().then(value=>{
   if(stopped)return;
   const bytes=Uint8Array.from(atob(value.dataBase64),char=>char.charCodeAt(0));
   url=URL.createObjectURL(new Blob([bytes],{type:value.mimeType}));setSrc(url);
   if(kind==="text"||/\.html?$/i.test(file.path))setText(new TextDecoder().decode(bytes));
  }).catch(()=>{if(!stopped)setError(true);});
  return()=>{stopped=true;if(url)URL.revokeObjectURL(url);};
 },[file.path,attempt,inView]);
 return <div ref={containerRef} className="space-y-2" >
  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="min-w-0 truncate" title={file.path}>{compact?file.path.split("/").at(-1):file.path}</span>{!compact?<span>{(file.sizeBytes/1024).toFixed(1)} KiB</span>:null}{src?<a href={src} download={file.path.split("/").at(-1)} className="underline">{t("personal.copy.download_file")}</a>:null}</div>
  {error?<div role="alert">{t("personal.copy.could_not_open_file")}<Button size="sm" variant="ghost" onClick={()=>setAttempt(value=>value+1)}>{t("personal.copy.retry")}</Button></div>:inView&&!src?<div className={compact?"h-28 w-40 animate-pulse rounded bg-muted":"h-20 animate-pulse rounded bg-muted"} aria-busy="true"/>:null}
  {src&&kind==="image"?<><Button variant="ghost" className="h-auto p-0" onClick={()=>setExpanded(true)} aria-label={t("personal.copy.enlarge_image")}><img src={src} alt={file.path} loading="lazy" decoding="async" className={compact?"max-h-40 max-w-40 rounded-md object-contain":"max-h-64 max-w-full object-contain"}/></Button><ImageLightbox src={src} alt={file.path} open={expanded} onOpenChange={setExpanded}/></>:null}
  {src&&kind==="video"?<video src={src} controls preload="metadata" className={compact?"max-h-40 max-w-60 rounded-md":"max-h-72 max-w-full"}/>:null}
  {src&&kind==="audio"?<audio src={src} controls preload="metadata" className={compact?"max-w-60":"w-full"}/>:null}
  {src&&/\.pdf$/i.test(file.path)?<PdfPreview title={file.path} url={src} className="h-80 w-full"/>:null}
  {src&&/\.html?$/i.test(file.path)?<iframe title={file.path} srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'">${text}`} sandbox="" referrerPolicy="no-referrer" className="h-80 w-full border-0 bg-background"/>:null}
  {src&&/\.docx$/i.test(file.path)?<DocxPreview source={src}/>:null}
  {src&&kind==="text"?<><Button size="sm" variant="ghost" onClick={()=>void navigator.clipboard.writeText(text)}>{t("personal.copy.copy_text")}</Button><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">{text.slice(0,100000)}</pre></>:null}
  {src&&kind==="3d"?<p className="text-xs text-muted-foreground">{t("personal.copy.download_to_open_in_a_3d_viewer")}</p>:null}
 </div>;
}
function DocxPreview({source}:{source:string}){
 const [text,setText]=useState("");
 useEffect(()=>{let active=true;void (async()=>{
  const mammoth=await import("mammoth/mammoth.browser");
  const result=await mammoth.extractRawText({arrayBuffer:await (await fetch(source)).arrayBuffer()});
  if(active)setText(result.value);
 })().catch(()=>{if(active)setText(t("personal.preview.unavailable"));});return()=>{active=false;};},[source]);
 return <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">{text.slice(0,100000)}</pre>;
}

import {createHash,randomUUID} from "node:crypto";
import {realpath,readdir,lstat,link,unlink} from "node:fs/promises";
import {join,extname,relative} from "node:path";
import {openWorkspaceFileForReading,openWorkspaceFileForWriting,proveHandleInPlace} from "./workspace-file-identity.js";

export const OUTPUT_MAX_BYTES=100*1024*1024;
const mime:Record<string,string>={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif",".mp4":"video/mp4",".webm":"video/webm",".mov":"video/quicktime",".mp3":"audio/mpeg",".wav":"audio/wav",".m4a":"audio/mp4",".ogg":"audio/ogg",".pdf":"application/pdf",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".html":"text/html",".htm":"text/html",".md":"text/markdown",".txt":"text/plain",".csv":"text/csv",".json":"application/json",".glb":"model/gltf-binary",".gltf":"model/gltf+json",".obj":"text/plain",".stl":"model/stl",".zip":"application/zip"};
export const outputMime=(file:string)=>mime[extname(file).toLowerCase()]??"application/octet-stream";
export function trustedOutputUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=="https:"||url.hostname!=="xianchou.com"||url.port||url.username||url.password)throw Error("Untrusted output source");
 return url;
}
export async function saveModelOutput(root:string,key:string,urlValue:string,fetchImpl:typeof fetch=fetch){
 if(!/^[a-f0-9]{64}$/.test(key))throw Error("Invalid output identity");
 const url=trustedOutputUrl(urlValue),extension=extname(url.pathname).toLowerCase();
 if(!mime[extension])throw Error("Unsupported output format");
 const realRoot=await realpath(root);
 // Flat deterministic names avoid intermediate-directory creation and never overwrite user files.
 const filename=`output-${key.slice(0,16)}-${createHash("sha256").update(url.pathname).digest("hex").slice(0,16)}${extension}`;
 const target=join(realRoot,filename);
 try{
  const existing=await openWorkspaceFileForReading(realRoot,target,filename);
  try{return {path:filename,mimeType:outputMime(filename),sizeBytes:existing.info.size};}finally{await existing.handle.close();}
 }catch(error){if(!(error instanceof Error)||!("code" in error)||error.code!=="missing")throw error;}
 const response=await fetchImpl(url,{redirect:"error",signal:AbortSignal.timeout(120000),headers:{Accept:"*/*"}});
 if(!response.ok||!response.body)throw Error("Result download failed; refresh the result and retry");
 const length=Number(response.headers.get("content-length"));
 if(length>OUTPUT_MAX_BYTES){await response.body.cancel();throw Error("Result exceeds 100 MiB limit");}
 const chunks:Uint8Array[]=[];let size=0;
 const reader=response.body.getReader();
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>OUTPUT_MAX_BYTES)throw Error("Result exceeds 100 MiB limit");chunks.push(next.value);}}
 finally{await reader.cancel().catch(()=>undefined);}
 const temporary=join(realRoot,`output-${randomUUID()}.part`);
 const opened=await openWorkspaceFileForWriting(realRoot,temporary,null,filename);
 try{
  for(const chunk of chunks)await opened.handle.writeFile(chunk);
  await opened.handle.sync();
  if(!await proveHandleInPlace(await opened.handle.stat(),temporary,realRoot))throw Error("Output location changed");
  await link(temporary,target); // Exclusive publish: an existing destination is never replaced.
 }finally{await opened.handle.close();await unlink(temporary).catch(()=>undefined);}
 return {path:filename,mimeType:outputMime(filename),sizeBytes:size};
}
export async function readOutputFile(root:string,file:string){
 if(!mime[extname(file).toLowerCase()]||file.split(/[\\/]/).some(part=>part.startsWith(".")))throw Error("Unsupported output file");
 const realRoot=await realpath(root),target=join(realRoot,file);
 const rel=relative(realRoot,target);
 if(!rel||rel.startsWith(".."))throw Error("Invalid output path");
 const opened=await openWorkspaceFileForReading(realRoot,target,file);
 try{if(opened.info.size>OUTPUT_MAX_BYTES)throw Error("File exceeds preview limit");return {dataBase64:(await opened.handle.readFile()).toString("base64"),mimeType:outputMime(file),sizeBytes:opened.info.size};}finally{await opened.handle.close();}
}
export async function indexOutputFiles(root:string){
 const realRoot=await realpath(root),items:{path:string;mimeType:string;sizeBytes:number;updatedAt:number}[]=[];
 let visited=0;
 async function walk(folder:string,depth:number){
  if(depth>12||visited>=10000)return;
  for(const entry of await readdir(folder,{withFileTypes:true})){
   if(++visited>10000)return;
   if(entry.name.startsWith(".")||["node_modules","vendor","dist","build"].includes(entry.name)||entry.isSymbolicLink())continue;
   const target=join(folder,entry.name);
   if(entry.isDirectory()){
    if(await realpath(target)!==target)continue;
    await walk(target,depth+1);
   }else if(entry.isFile()&&mime[extname(entry.name).toLowerCase()]){
    const info=await lstat(target);if(!info.isFile())continue;
    items.push({path:relative(realRoot,target).replaceAll("\\","/"),mimeType:outputMime(target),sizeBytes:info.size,updatedAt:info.mtimeMs});
   }
  }
 }
 await walk(realRoot,0);return {items,truncated:visited>=10000};
}

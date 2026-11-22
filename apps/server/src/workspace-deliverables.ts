import {createHash,randomUUID} from "node:crypto";
import {lstat,mkdir,realpath,link,unlink} from "node:fs/promises";
import {dirname,join,isAbsolute,relative,sep} from "node:path";
import {z} from "zod";
import {createWorkspaceKvStore} from "./workspace-kv-store.js";
import {runtimeDbPath} from "./runtime-db.js";
import type {ServerConfig,WorkspaceInfo} from "./types.js";
import {get3wspaceFileForReading,get3wspaceFileForWriting,proveHandleInPlace,WorkspaceFileError} from "./workspace-file-identity.js";

import {ApiError} from "./errors.js";

const entrySchema=z.object({id:z.string(),key:z.string(),path:z.string(),aliases:z.array(z.string()),sessionId:z.string().optional(),state:z.enum(["planned","saved","deleted"]),identity:z.object({dev:z.number(),ino:z.number()}).optional()});
type Entry=z.infer<typeof entrySchema>;
const store=createWorkspaceKvStore<Entry[]>({tableName:"workspace_deliverables",valueColumn:"files_json",parse:json=>z.array(entrySchema).parse(JSON.parse(json)),serialize:JSON.stringify});
const queues=new Map<string,Promise<unknown>>();
export function deliverableName(value:string,fallback="任务成果",limit=60):string{
 const name=value.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,"-").replace(/\s+/g," ").replace(/^[.\s]+|[.\s]+$/g,"");
 const safe=Array.from(name).slice(0,limit).join("").replace(/[.\s]+$/g,"")||fallback;
 return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)?`文件-${safe}`:safe;
}
function normalizePath(value:string){
 if(!value||isAbsolute(value)||value.includes("\\")||value.split("/").some(part=>!part||part.startsWith(".")||deliverableName(part,"任务成果",120)!==part))throw Error("Use a safe workspace-relative path");
 return value;
}
export async function safeDeliverablePath(root:string,path:string,createParents=false){
 const canonical=await realpath(root),parts=normalizePath(path).split("/");let folder=canonical;
 for(const part of parts.slice(0,-1)){
  folder=join(folder,part);
  if(createParents)await mkdir(folder).catch((error:unknown)=>{if(!error||typeof error!=="object"||!("code" in error)||error.code!=="EEXIST")throw error;});
  const info=await lstat(folder);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(folder)!==folder)throw Error("Deliverable folder must be inside the workspace without symbolic links");
 }
 return {root:canonical,target:join(canonical,...parts)};
}
async function serial<T>(config:ServerConfig,workspace:WorkspaceInfo,fn:(entries:Entry[])=>Promise<T>):Promise<T>{
 const key=`${runtimeDbPath(config)}:${workspace.id}`;
 const previous=queues.get(key)??Promise.resolve();
 const pending=previous.catch(()=>{}).then(async()=>fn(await store.get(config,workspace.id)??[]));
 queues.set(key,pending);try{return await pending;}finally{if(queues.get(key)===pending)queues.delete(key);}
}
export type DeliverablePlan={fileId:string;path:string;rootPath:string};
const view=(workspace:WorkspaceInfo,entry:Entry):DeliverablePlan=>({fileId:entry.id,path:entry.path,rootPath:workspace.path});
export type DeliverableRequest={key:string;sessionId?:string;taskName?:string;filename?:string;directory?:string;sourcePath?:string;extension:string};
async function deliverableInputPath(workspace:WorkspaceInfo,value:string,allowRoot=false){
 const root=await realpath(workspace.path);
 const lexical=isAbsolute(value)?relative(workspace.path,value):value;
 const path=(isAbsolute(value)&&(lexical===".."||lexical.startsWith(`..${sep}`))?relative(root,value):lexical).split(sep).join("/");
 if(allowRoot&&(path===""||path==="."))return "";
 return normalizePath(path);
}
export async function planDeliverable(config:ServerConfig,workspace:WorkspaceInfo,input:DeliverableRequest):Promise<DeliverablePlan>{
 input={...input,extension:input.extension.startsWith(".")?input.extension:`.${input.extension}`};
 if(!input.key||input.key.length>2000||!/^\.[a-z0-9]{1,12}$/i.test(input.extension))throw Error("Invalid deliverable identity or extension");
 return serial(config,workspace,async entries=>{
  const old=entries.find(entry=>entry.key===input.key);if(old){if(old.state==="deleted")throw Error("This result was deleted; it will not be recreated automatically");return view(workspace,old);}
  let folder=input.directory?await resolveDeliverableAlias(config,workspace,await deliverableInputPath(workspace,input.directory,true)):deliverableName(input.taskName??"任务成果");
  if(input.sourcePath){
   const source=normalizePath(await resolveDeliverableAlias(config,workspace,await deliverableInputPath(workspace,input.sourcePath)));await safeDeliverablePath(workspace.path,source);
   const opened=await get3wspaceFileForReading(await realpath(workspace.path),join(await realpath(workspace.path),source),source);await opened.handle.close();folder=dirname(source);if(folder===".")folder="";
  }
  const requested=deliverableName(input.filename??input.taskName??"生成结果");
  const stem=deliverableName(requested.toLowerCase().endsWith(input.extension.toLowerCase())?requested.slice(0,-input.extension.length):requested,"生成结果",80);
  let path="";
  for(let number=1;number<=10000;number++){
   const name=`${stem}${number===1?"":`-${number}`}${input.extension.toLowerCase()}`;path=folder?`${folder}/${name}`:name;
   const {target}=await safeDeliverablePath(workspace.path,path,true);
   if(!entries.some(entry=>entry.path.toLocaleLowerCase()===path.toLocaleLowerCase())&&!await lstat(target).catch(error=>{if(error.code==="ENOENT")return null;throw error;}))break;
   if(number===10000)throw Error("Too many files with this name");
  }
  const entry:Entry={id:createHash("sha256").update(`${workspace.id}:${input.key}`).digest("hex"),key:input.key,path,aliases:[],sessionId:input.sessionId,state:"planned"};entries.push(entry);await store.set(config,workspace.id,entries);return view(workspace,entry);
 });
}
export async function resolveDeliverable(config:ServerConfig,workspace:WorkspaceInfo,fileId:string){
 const entry=(await store.get(config,workspace.id)??[]).find(item=>item.id===fileId);
 if(!entry||entry.state==="deleted")throw Error("Workspace result is no longer available");
 return {...view(workspace,entry),state:entry.state};
}
export async function registerDeliverable(config:ServerConfig,workspace:WorkspaceInfo,fileId:string){
 return serial(config,workspace,async entries=>{
  const entry=entries.find(item=>item.id===fileId);if(!entry||entry.state==="deleted")throw Error("Workspace result is no longer available");
  const {root,target}=await safeDeliverablePath(workspace.path,entry.path);
  const opened=await get3wspaceFileForReading(root,target,entry.path).catch((error:unknown)=>{
   if(error instanceof WorkspaceFileError && error.code==="missing")throw new ApiError(422,"deliverable_not_written",`Planned file does not exist: ${entry.path}. Write to the exact path returned by workspace_file plan before registering this file_id. Planning alone does not save a file.`);
   throw error;
  });
  const sizeBytes=opened.info.size;await opened.handle.close();entry.state="saved";await store.set(config,workspace.id,entries);return {...view(workspace,entry),sizeBytes};
 });
}
export async function saveDeliverableBytes(config:ServerConfig,workspace:WorkspaceInfo,plan:DeliverablePlan,bytes:Uint8Array){
 return serial(config,workspace,async entries=>{
  const entry=entries.find(item=>item.id===plan.fileId);if(!entry||entry.state==="deleted")throw Error("Workspace result is no longer available");
  const {root,target}=await safeDeliverablePath(workspace.path,entry.path,true);
  if(entry.state==="saved"){
   const opened=await get3wspaceFileForReading(root,target,entry.path);const sizeBytes=opened.info.size;await opened.handle.close();return {...view(workspace,entry),sizeBytes};
  }
  // Crash after publish but before the registry commit: adopt only our persisted inode.
  const existing=await lstat(target).catch(error=>{if(error.code==="ENOENT")return null;throw error;});
  if(existing){
   const opened=await get3wspaceFileForReading(root,target,entry.path);
   try{if(!entry.identity||opened.info.dev!==entry.identity.dev||opened.info.ino!==entry.identity.ino)throw Error("The reserved result path is occupied; move that file before retrying");entry.state="saved";await store.set(config,workspace.id,entries);return {...view(workspace,entry),sizeBytes:opened.info.size};}finally{await opened.handle.close();}
  }
  const temporary=join(dirname(target),`get3w-${randomUUID()}.part`);
  const opened=await get3wspaceFileForWriting(root,temporary,null,entry.path);
  try{
   await opened.handle.writeFile(bytes);await opened.handle.sync();
   if(!await proveHandleInPlace(await opened.handle.stat(),temporary,root))throw Error("Result location changed");
   const identity=await opened.handle.stat();entry.identity={dev:identity.dev,ino:identity.ino};await store.set(config,workspace.id,entries);
   await link(temporary,target);
   if(!await proveHandleInPlace(identity,target,root))throw Error("Published result location changed");
   entry.state="saved";
   await store.set(config,workspace.id,entries);
  }finally{await opened.handle.close();await unlink(temporary).catch(()=>{});}
  return {...view(workspace,entry),sizeBytes:bytes.byteLength};
 });
}
export async function relocateDeliverables(config:ServerConfig,workspace:WorkspaceInfo,from:string,to?:string){
 await serial(config,workspace,async entries=>{
  for(const entry of entries){if(entry.path!==from&&!entry.path.startsWith(from+"/"))continue;
   if(to){entry.aliases.push(entry.path);entry.path=to+entry.path.slice(from.length);}else entry.state="deleted";
  }await store.set(config,workspace.id,entries);
 });
}
export async function resolveDeliverableAlias(config:ServerConfig,workspace:WorkspaceInfo,path:string){
 const entries=await store.get(config,workspace.id)??[];
 if(entries.some(entry=>entry.path===path&&entry.state!=="deleted"))return path;
 const entry=[...entries].reverse().find(entry=>entry.state!=="deleted"&&entry.aliases.includes(path));if(entry)return entry.path;
 for(const item of [...entries].reverse())for(const alias of [...item.aliases].reverse()){
  const suffix=alias.slice(path.length);
  if(item.state!=="deleted"&&alias.startsWith(path+"/")&&item.path.endsWith(suffix))return item.path.slice(0,-suffix.length);
 }
 return path;
}
export const deliverableKey=(taskKey:string,url:string)=>`media:${taskKey}:${new URL(url).pathname}`;

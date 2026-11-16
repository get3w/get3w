import { isRecord } from "./workspace-kv-store.js";
import { generationPolicyFromMessages } from "./generation-policies.js";
import { costRunKey, readCostRun } from "./task-cost-settings.js";
import type { ServerConfig } from "./types.js";

/** Follow recorded subagent tool references, never the parent's latest message. */
export async function resolveCostRunContext(config:ServerConfig,workspaceId:string,sessionId:string,messageId:string,read:(path:string)=>Promise<unknown>,seen=new Set<string>()):Promise<string|undefined>{
 if(seen.has(sessionId)||seen.size>=32)return undefined;seen.add(sessionId);
 const raw=await read(`/api/session/${encodeURIComponent(sessionId)}`);
 const session=isRecord(raw)&&isRecord(raw.data)?raw.data:raw;
 if(!isRecord(session))return undefined;
 if(typeof session.parentID!=="string"||session.fork!==undefined){
  const user=await generationPolicyFromMessages(messageId,cursor=>read(`/api/session/${encodeURIComponent(sessionId)}/message?limit=200&${cursor?`cursor=${encodeURIComponent(cursor)}`:"order=desc"}`));
  const key=costRunKey(workspaceId,sessionId,user.messageId);
  return await readCostRun(config,key)?key:undefined;
 }
 const parentId=session.parentID;let cursor:string|undefined;const cursors=new Set<string>();
 while(true){
  const page=await read(`/api/session/${encodeURIComponent(parentId)}/message?limit=200&${cursor?`cursor=${encodeURIComponent(cursor)}`:"order=desc"}`);
  if(!isRecord(page)||!Array.isArray(page.data))return undefined;
  for(const message of page.data){
   if(!isRecord(message)||typeof message.id!=="string")continue;
   const references=(value:unknown,depth=0):boolean=>{
    if(depth>12)return false;
    if(Array.isArray(value))return value.some(row=>references(row,depth+1));
    if(!isRecord(value))return false;
    if(value.tool==="subagent"||value.name==="subagent"){
     const metadata=isRecord(value.metadata)?value.metadata:isRecord(value.state)&&isRecord(value.state.metadata)?value.state.metadata:null;
     if(metadata&&(metadata.sessionId===sessionId||metadata.sessionID===sessionId))return true;
    }
    return Object.values(value).some(row=>row!==null&&typeof row==="object"&&references(row,depth+1));
   };
   if(references(message))return resolveCostRunContext(config,workspaceId,parentId,message.id,read,seen);
  }
  const next=isRecord(page.cursor)&&typeof page.cursor.next==="string"?page.cursor.next:undefined;
  if(!next||cursors.has(next))return undefined;cursors.add(next);cursor=next;
 }
}

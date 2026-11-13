import { z } from "zod";
const policySchema=z.object({selectedModels:z.array(z.object({slug:z.string().min(1).max(500),name:z.string().max(500)})).max(20).optional(),models:z.record(z.string().max(150),z.object({slug:z.string().min(1).max(500),source:z.enum(["explicit","user","system"])})),outputs:z.record(z.string().max(150),z.record(z.string().max(150),z.string().max(500)))});
const entries=new Map<string,z.infer<typeof policySchema>>();
const key=(workspace:string,session:string,message:string)=>JSON.stringify([workspace,session,message]);
export function rememberGenerationPolicy(workspace:string,session:string,message:string,value:unknown){
  const policy=policySchema.parse(value??{models:{},outputs:{}});
  if(entries.size>=1000)entries.delete(entries.keys().next().value??"");
  entries.set(key(workspace,session,message),policy);
}
export function generationPolicyFor(workspace:string,session:string,message:string){return entries.get(key(workspace,session,message));}

/** V2 messages have no parentID: bind to the user before this caller, never
 * to a newer queued prompt. Pages must be supplied newest first. */
export async function generationPolicyFromMessages(callerId:string,read:(cursor?:string)=>Promise<unknown>){
  let cursor:string|undefined,found=false;
  const seen=new Set<string>();
  while(true){
    const page=await read(cursor);
    const parsed=z.object({data:z.array(z.object({id:z.string(),type:z.string(),metadata:z.unknown().optional(),time:z.object({created:z.number()}).optional()})),cursor:z.object({next:z.string().nullable().optional()}).optional()}).parse(page);
    for(const row of parsed.data){
      if(row.id===callerId)found=true;
      if(found&&row.type==='user'){
        const metadata=z.object({openwork:z.object({generationPolicy:policySchema.optional()}).optional()}).parse(row.metadata??{});
        return {messageId:row.id,policy:metadata.openwork?.generationPolicy??{models:{},outputs:{}},...(row.time?{receivedAt:row.time.created}:{})};
      }
    }
    const next=parsed.cursor?.next;
    if(!next||seen.has(next))throw Error('Generation policy message could not be verified');
    seen.add(next);cursor=next;
  }
}

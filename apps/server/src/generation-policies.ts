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

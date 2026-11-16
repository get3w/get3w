import { z } from "zod";
import { createWorkspaceKvStore } from "./workspace-kv-store.js";
import { runtimeDbPath } from "./runtime-db.js";
import type { ServerConfig } from "./types.js";

export const costPolicySchema = z.object({enabled:z.boolean(), amount:z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/).nullable(), currency:z.enum(["USD","CNY"])}).refine(value=>!value.enabled || (value.amount!==null && Number(value.amount)>0),"Enter a positive limit");
export type CostPolicy = z.infer<typeof costPolicySchema>;
export const initialCostPolicy: CostPolicy = {enabled:true,amount:"1",currency:"USD"};
export const defaultNewTaskCostPolicy: CostPolicy = {enabled:true,amount:"1",currency:"USD"};
const reservationSchema=z.object({run:z.string(),quoteId:z.string(),amountUsd:z.string(),status:z.enum(["reserved","settled","released"])});
const runSchema=z.object({workspaceId:z.string(),sessionId:z.string(),messageId:z.string(),policy:costPolicySchema});
const stateSchema=z.object({defaultsVersion:z.number().optional(),defaults:costPolicySchema,sessions:z.record(z.string(),costPolicySchema),runs:z.record(z.string(),runSchema),reservations:z.record(z.string(),reservationSchema)});
type State=z.infer<typeof stateSchema>;
const store=createWorkspaceKvStore<State>({tableName:"task_cost_settings",valueColumn:"state_json",parse:json=>stateSchema.parse(JSON.parse(json)),serialize:JSON.stringify});
const queues=new Map<string,Promise<unknown>>();
function serial<T>(config:ServerConfig,action:(state:State)=>Promise<T>):Promise<T>{
 const key=runtimeDbPath(config);const next=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(async()=>{
  const state=await store.get(config,"__local__")??{defaultsVersion:1,defaults:defaultNewTaskCostPolicy,sessions:{},runs:{},reservations:{}};
  if(state.defaultsVersion!==1){
   // Upgrade the old unset sentinel once; retain explicit amounts and all
   // admitted message snapshots. Later user choices must never be migrated.
   if(state.defaults.amount===null)state.defaults={...defaultNewTaskCostPolicy};
   for(const [id,policy] of Object.entries(state.sessions))if(policy.amount===null)state.sessions[id]={...defaultNewTaskCostPolicy};
   state.defaultsVersion=1;
   await store.set(config,"__local__",state);
  }
  return action(state);
 });
 queues.set(key,next);return next.finally(()=>{if(queues.get(key)===next)queues.delete(key);});
}
export const costRunKey=(workspace:string,session:string,message:string)=>JSON.stringify([workspace,session,message]);
export function usdMicros(value:string):bigint {if(!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value))throw Error("Invalid USD amount");const [whole,fraction=""]=value.split(".");return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,"0"));}
export const microsUsd=(value:bigint)=>`${value/1000000n}.${(value%1000000n).toString().padStart(6,"0")}`;
function total(state:State,run:string){return Object.values(state.reservations).filter(row=>row.run===run&&row.status!=="released").reduce((sum,row)=>sum+usdMicros(row.amountUsd),0n);}
function within(policy:CostPolicy,amount:bigint){if(!policy.enabled||!policy.amount)return false;return policy.currency==="CNY"?amount*7n<=usdMicros(policy.amount):amount<=usdMicros(policy.amount);}
export function taskCostSettings(config:ServerConfig,sessionId?:string){return serial(config,async state=>({policy:sessionId?state.sessions[sessionId]??initialCostPolicy:state.defaults}));}
export function setTaskCostSettings(config:ServerConfig,value:unknown,sessionId?:string){const policy=costPolicySchema.parse(value);return serial(config,async state=>{state.defaults=policy;if(sessionId)state.sessions[sessionId]=policy;await store.set(config,"__local__",state);return {policy};});}
export function initializeTaskCostSettings(config:ServerConfig,sessionId:string,parentId?:string,fork=false){return serial(config,async state=>{if(state.sessions[sessionId])return;state.sessions[sessionId]=parentId&&!fork?state.sessions[parentId]??initialCostPolicy:state.defaults;await store.set(config,"__local__",state);});}
export function captureCostRun(config:ServerConfig,workspaceId:string,sessionId:string,messageId:string){return serial(config,async state=>{const key=costRunKey(workspaceId,sessionId,messageId);if(!state.runs[key]){state.runs[key]={workspaceId,sessionId,messageId,policy:state.sessions[sessionId]??initialCostPolicy};await store.set(config,"__local__",state);}return key;});}
export function readCostRun(config:ServerConfig,key:string){return serial(config,async state=>{const run=state.runs[key];return run?{...run,committedUsd:microsUsd(total(state,key))}:null;});}
export function latestCostRun(config:ServerConfig,workspaceId:string,sessionId:string){return serial(config,async state=>{const runs=Object.entries(state.runs).filter(([,run])=>run.workspaceId===workspaceId&&run.sessionId===sessionId);const entry=runs.at(-1);return entry?{...entry[1],committedUsd:microsUsd(total(state,entry[0]))}:null;});}

/** Reserve under a serialized host transaction. Manual review never holds this lock. */
export async function approveCostReservation(config:ServerConfig,input:{key:string;run?:string;quoteId:string;amountUsd:string;expiresAt:number},ask:(summary:{committedUsd:string;projectedUsd:string;limit:CostPolicy|null})=>Promise<boolean>){
 const amount=usdMicros(input.amountUsd);
 if(!input.key||!input.quoteId||!Number.isFinite(input.expiresAt)||input.expiresAt<=Date.now())throw Error("Quote expired");
 const reserve=async(manual:boolean)=>serial(config,async state=>{
  const old=state.reservations[input.key];
  if(old&&old.status!=="released"){
   if(old.run!==(input.run??`unverified:${input.key}`)||old.quoteId!==input.quoteId||(old.status==="reserved"&&old.amountUsd!==input.amountUsd))throw Error("Submission identity changed");
   return {allowed:true,committedUsd:microsUsd(total(state,old.run)),projectedUsd:microsUsd(total(state,old.run)),limit:state.runs[old.run]?.policy??null};
  }
  const run=input.run?state.runs[input.run]:undefined;const committed=input.run?total(state,input.run):0n;
  const summary={committedUsd:microsUsd(committed),projectedUsd:microsUsd(committed+amount),limit:run?.policy??null};
  if(input.expiresAt<=Date.now())throw Error("Quote expired");
  if(!manual&&(!run||!within(run.policy,committed+amount)))return {allowed:false,...summary};
  state.reservations[input.key]={run:input.run??`unverified:${input.key}`,quoteId:input.quoteId,amountUsd:input.amountUsd,status:"reserved"};await store.set(config,"__local__",state);return {allowed:true,...summary};
 });
 const result=await reserve(false);if(result.allowed)return true;
 if(!await ask(result))return false;
 return (await reserve(true)).allowed;
}
export function reconcileCostReservation(config:ServerConfig,key:string,value:{released?:boolean;chargedUsd?:string;quoteId?:string}){return serial(config,async state=>{const row=state.reservations[key];if(!row||(value.quoteId!==undefined&&value.quoteId!==row.quoteId))return;if(value.released){row.status="released";}else if(value.chargedUsd!==undefined){usdMicros(value.chargedUsd);row.amountUsd=value.chargedUsd;row.status="settled";}await store.set(config,"__local__",state);});}

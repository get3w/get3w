// Run alone: uses the real native engine, an isolated profile and scripted provider.
import { test, expect } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { ServerConfig } from "../src/types";
import { nativeProtocolResponse } from "./fixtures/native-provider-protocol-fixtures";

const modelInput = z.object({ messages:z.array(z.object({role:z.string(),content:z.unknown(),tool_call_id:z.string().optional()})),tools:z.array(z.object({function:z.object({name:z.string(),parameters:z.unknown()})})).optional() });
const statusSchema = z.object({paused:z.boolean(),phase:z.string(),sessionId:z.string().nullable(),nextRunAt:z.number().nullable(),event:z.object({id:z.string(),messageId:z.string(),repairCount:z.number().optional(),verification:z.object({status:z.string(),issues:z.array(z.string())}).optional()})});

test("native repair writes records through tools; insufficient evidence stays blocked without replay",async()=>{
 const root=await mkdtemp(join(tmpdir(),"get3w-native-repair-"));
 const environment={HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:resolve("apps/desktop/resources/sidecars/opencode2"),GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"};
 const previous=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment);
 let workspacePath="";let scenario="sufficient";let step=0;let initialCalls=0;let repairCalls=0;
 const observed:string[]=[];const schemas:unknown[]=[];let providerError:unknown;
 const frame=(delta:unknown,finish:string|null)=>`data: ${JSON.stringify({id:"chatcmpl_repair",object:"chat.completion.chunk",model:"fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(request){
  try{
   const body=modelInput.parse(await request.json());
   const lastUser=body.messages.filter(m=>m.role==="user").at(-1);
   const repairing=JSON.stringify(lastUser?.content).includes("RECORD COMPLETION ONLY");
   const state=statusSchema.parse(JSON.parse(await readFile(join(workspacePath,".get3w/always-on/state.json"),"utf8")));
   if(!repairing){initialCalls++;return new Response(nativeProtocolResponse("openai","fixture",scenario==="sufficient"?"Local source was checked; observation is in evidence.txt. Record was not saved.":"Source check was not completed. No observation evidence exists."),{headers:{"content-type":"text/event-stream"}});}
   repairCalls++;
   const last=body.messages.at(-1);if(last?.role==="tool")observed.push(JSON.stringify(last.content));
   const write=body.tools?.find(t=>t.function.name==="write");const read=body.tools?.find(t=>t.function.name==="read");const shell=body.tools?.find(t=>t.function.name==="shell");
   if(!write||!read||!shell)throw Error(`Missing native tools: ${body.tools?.map(t=>t.function.name)}`);
   schemas.push(write.function.parameters);
   let name=read.function.name;let input:unknown;
   const currentStep=step++;
   if(currentStep===0){name=shell.function.name;input={command:`echo REPLAY > ${join(workspacePath,"replayed.txt")}`};}
   else if(currentStep===1)input={path:join(workspacePath,"evidence.txt")};
   else if(scenario==="sufficient"&&currentStep===2&&process.env.GET3W_COMPLETION_TOOL_TEST==="1"){name="always_on_complete";input={outcome:"changed",summary:"Local observation count=3 from evidence.txt",artifacts:["evidence.txt"],continuity:`Event ${state.event.id}: verified existing evidence only`,notification:{action:"quiet"}};}
   else if(scenario==="sufficient"&&currentStep>2&&process.env.GET3W_COMPLETION_TOOL_TEST==="1")return new Response(nativeProtocolResponse("openai","fixture",""),{headers:{"content-type":"text/event-stream"}});
   else if(scenario==="sufficient"&&currentStep===2){name=write.function.name;input={path:join(workspacePath,".get3w/always-on/checkpoint.md"),content:`Event ${state.event.id}: local observation count=3, verified against evidence.txt. No external notification.`};}
   else if(scenario==="sufficient"&&currentStep===3){name=write.function.name;input={path:join(workspacePath,`.get3w/always-on/results/${state.event.id}.json`),content:JSON.stringify({eventId:state.event.id,outcome:"changed",summary:"Local observation count=3 from evidence.txt",artifacts:["evidence.txt"]})};}
   else return new Response(nativeProtocolResponse("openai","fixture",scenario==="sufficient"?"Records completed using existing evidence only.":"Evidence is insufficient. No records or facts were invented; result remains unverified."),{headers:{"content-type":"text/event-stream"}});
   return new Response(frame({role:"assistant",tool_calls:[{index:0,id:`call_${scenario}_${currentStep}`,type:"function",function:{name,arguments:JSON.stringify(input)}}]},null)+frame({},"tool_calls")+"data: [DONE]\n\n",{headers:{"content-type":"text/event-stream"}});
  }catch(error){providerError=error;return new Response(nativeProtocolResponse("openai","fixture",`Fixture failed: ${String(error)}`),{headers:{"content-type":"text/event-stream"}});}
 }});
 let stop:(()=>Promise<void>)|undefined;
 try{
  const {startServer}=await import("../src/server");const {writeGlobalRuntimeOpencodeConfig}=await import("../src/runtime-opencode-config-store");
  const config:ServerConfig={host:"127.0.0.1",port:0,token:"fixture-client",hostToken:"fixture-host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[root],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
  await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture-only"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096},tool_call:true}}}}}));
  const server=await startServer(config);stop=()=>server.stop();
  async function request(path:string,body?:unknown){const response=await fetch(`http://127.0.0.1:${server.port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const value:unknown=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(value)}`);return value;}
  const deadline=Date.now()+60000;
  while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Engine did not start");await Bun.sleep(500);}
  for(const value of ["sufficient","insufficient"]){
   scenario=value;step=0;workspacePath=join(root,value);await mkdir(workspacePath);
   if(value==="sufficient")await writeFile(join(workspacePath,"evidence.txt"),"Local source checked at fixture time: count=3. No notification sent.");
   const created=z.object({activeId:z.string()}).parse(await request("/workspaces/local",{folderPath:workspacePath,name:`Repair ${value}`,preset:"starter",workspaceType:"always-on",alwaysOn:{goal:"Check local evidence once and record it. Do not access websites or send notifications.",fullAccess:true,costAuto:false,costLimit:"7",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));
   const endpoint=`/workspaces/${created.activeId}/always-on`;
   async function settled(){const limit=Date.now()+45000;let s=statusSchema.parse(await request(endpoint));while(s.phase!=="idle"){if(Date.now()>limit||["error","interrupted"].includes(s.phase))throw Error(JSON.stringify({s,providerError:String(providerError),observed,schemas}));await Bun.sleep(500);s=statusSchema.parse(await request(endpoint));}return s;}
   const before=await settled();expect(before.event.verification?.status).toBe("needs_review");expect(before.nextRunAt).toBeNull();
   const receiptPath=join(workspacePath,`.get3w/always-on/runs/${before.event.id}.json`);const original=await readFile(receiptPath,"utf8");
   await request(endpoint,{action:"pause"});
   await request(`${endpoint}/results/${before.event.id}`,{action:"repair"});
   const after=await settled();
   expect(providerError).toBeUndefined();expect(after.paused).toBe(true);expect(after.sessionId).toBe(before.sessionId);expect(after.event.id).toBe(before.event.id);expect(after.event.messageId).not.toBe(before.event.messageId);expect(after.event.repairCount).toBe(1);
   expect(await readFile(join(workspacePath,`.get3w/always-on/repairs/${before.event.id}-0.json`),"utf8")).toBe(original);
   await expect(readFile(join(workspacePath,"replayed.txt"),"utf8")).rejects.toMatchObject({code:"ENOENT"});
   expect(after.event.verification?.status).toBe(value==="sufficient"?"verified":"needs_review");
   if(value==="sufficient"){await request(endpoint,{action:"resume"});const resumed=statusSchema.parse(await request(endpoint));expect(resumed.paused).toBe(false);expect(resumed.nextRunAt).not.toBeNull();await request(endpoint,{action:"pause"});expect(after.nextRunAt).not.toBeNull();expect(await readFile(join(workspacePath,`.get3w/always-on/results/${before.event.id}.json`),"utf8")).toContain("count=3");}
   else{expect(after.nextRunAt).toBeNull();await request(endpoint,{action:"resume"});await Bun.sleep(3500);const blocked=statusSchema.parse(await request(endpoint));expect(blocked.event.id).toBe(before.event.id);expect(blocked.phase).toBe("idle");await request(endpoint,{action:"pause"});}
   const receipt=JSON.parse(await readFile(receiptPath,"utf8"));expect(JSON.stringify(receipt.messages)).toContain("Record completion");
  }
  expect(initialCalls).toBe(2);expect(repairCalls).toBeGreaterThanOrEqual(process.env.GET3W_COMPLETION_TOOL_TEST==="1"?7:8);expect(observed.join("\n")).toContain("Record completion");
 }finally{await stop?.();provider.stop(true);for(const[key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(root,{recursive:true,force:true});}
},150000);

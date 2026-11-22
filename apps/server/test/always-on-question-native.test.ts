// Run alone: real native engine, isolated profile, loopback-only scripted provider.
import {test,expect} from "bun:test";
import {mkdtemp,mkdir,readFile,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {z} from "zod";
import type {ServerConfig} from "../src/types";
import {nativeProtocolResponse} from "./fixtures/native-provider-protocol-fixtures";
const modelInput=z.object({messages:z.array(z.object({role:z.string(),content:z.unknown(),tool_call_id:z.string().optional(),tool_calls:z.unknown().optional()})),tools:z.array(z.object({function:z.object({name:z.string(),parameters:z.unknown()})})).optional()});
const statusSchema=z.object({paused:z.boolean(),phase:z.string(),sessionId:z.string().nullable(),event:z.object({id:z.string(),messageId:z.string(),phase:z.string()}).nullable()});
const questionSchema=z.object({kind:z.literal("question"),questions:z.array(z.object({header:z.string(),question:z.string(),options:z.array(z.object({label:z.string(),description:z.string()})),multiple:z.boolean(),custom:z.boolean()}))});
const attentionSchema=z.object({paused:z.boolean(),answerStatus:z.string().optional(),items:z.array(z.object({eventId:z.string(),sessionId:z.string(),messageId:z.string(),requestId:z.string(),request:questionSchema,answerStatus:z.string().optional()}))});

async function verifyQuestion(restart:boolean, unanswered=false, crash=false) {
 const root=await mkdtemp(join(tmpdir(),"get3w-native-question-"));
 const environment={HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:process.env.GET3W_LEGACY_TEST_BIN ?? resolve("apps/desktop/resources/sidecars/opencode2"),GET3W_DEFERRED_QUESTIONS:process.env.GET3W_LEGACY_TEST_BIN ? "1" : "0",GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"};
 const previous=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment);
 let calls=0;let providerError:unknown;const observed:string[]=[];
 const frame=(delta:unknown,finish:string|null)=>`data: ${JSON.stringify({id:"chatcmpl_question",object:"chat.completion.chunk",model:"fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(request){try{
  const body=modelInput.parse(await request.json());calls++;observed.push(JSON.stringify(body.messages));
  if(calls===1){
   const tool=body.tools?.find(t=>t.function.name==="question");
   if(!tool)throw Error(`Question tool missing: ${JSON.stringify(body.tools)}`);
   return new Response(frame({role:"assistant",tool_calls:[{index:0,id:"call_question_once",type:"function",function:{name:tool.function.name,arguments:JSON.stringify({questions:[{header:"Scope",question:"Which scope?",options:[{label:"New files",description:"Only new files"},{label:"All files",description:"Everything"}],multiple:false}]})}}]},null)+frame({},"tool_calls")+"data: [DONE]\n\n",{headers:{"content-type":"text/event-stream"}});
  }
  return new Response(nativeProtocolResponse("openai","fixture","QUESTION_NATIVE_COMPLETE"),{headers:{"content-type":"text/event-stream"}});
 }catch(error){providerError=error;return new Response(nativeProtocolResponse("openai","fixture",String(error)),{headers:{"content-type":"text/event-stream"}});}}});
 let stop:(()=>Promise<void>)|undefined;
 try{
  const {startServer}=await import("../src/server");const {writeGlobalRuntimeOpencodeConfig}=await import("../src/runtime-opencode-config-store");
  const config:ServerConfig={host:"127.0.0.1",port:0,token:"fixture-client",hostToken:"fixture-host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[root],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
  await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture-only"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096},tool_call:true}}}}}));
  let server=await startServer(config);stop=()=>server.stop();
  const request=async(path:string,body?:unknown)=>{
   const response=await fetch(`http://127.0.0.1:${config.port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
   const value:unknown=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(value)}`);return value;
  };
  const deadline=Date.now()+60000;
  while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Engine not ready");await Bun.sleep(300);}
  const path=join(root,"workspace");await mkdir(path);
  const created=z.object({activeId:z.string()}).parse(await request("/workspaces/local",{folderPath:path,name:"Question acceptance",preset:"starter",workspaceType:"always-on",alwaysOn:{goal:"Ask which scope using the question tool, then report the answer. Do not write files or access external services.",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));
  const endpoint=`/workspaces/${created.activeId}/always-on`;
  let attention=attentionSchema.parse(await request(`${endpoint}/attention`));
  while(!attention.items.length){if(providerError)throw providerError;if(Date.now()>deadline)throw Error(`No pending question: ${JSON.stringify(await request(endpoint))}`);await Bun.sleep(300);attention=attentionSchema.parse(await request(`${endpoint}/attention`));}
  await request(endpoint,{action:"pause"});
  const item=attention.items[0]!;expect(item.request.questions[0]?.question).toBe("Which scope?");expect(calls).toBe(1);
  const input={id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:{...item.request,requestId:item.requestId},answers:[["New files"]]};
  if(!unanswered){
  const denied=await fetch(`http://127.0.0.1:${config.port}${endpoint}/attention/answers`,{method:"POST",headers:{authorization:"Bearer fixture-client","content-type":"application/json"},body:JSON.stringify(input)});expect(denied.status).toBe(401);
  expect(await request(`${endpoint}/attention/answers`,input)).toEqual({status:"queued"});
  expect(await request(`${endpoint}/attention/answers`,input)).toEqual({status:"queued"});
  const conflict=await fetch(`http://127.0.0.1:${config.port}${endpoint}/attention/answers`,{method:"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},body:JSON.stringify({...input,id:crypto.randomUUID()})});expect(conflict.status).toBe(409);
  await Bun.sleep(3500);expect(calls).toBe(1);expect(attentionSchema.parse(await request(`${endpoint}/attention`)).items[0]?.answerStatus).toBe("queued");
  }else{await Bun.sleep(3500);expect(calls).toBe(1);}
  if(restart){
   if(crash){
    const native=z.object({pid:z.number().int().positive()}).parse(await request("/experimental/engine-v2-preview/status"));
    // PID comes only from this test's isolated server, never the user's Desktop.
    process.kill(native.pid,"SIGKILL");
   }
   await server.stop();stop=undefined;
   server=await startServer(config);stop=()=>server.stop();
   const restartDeadline=Date.now()+30000;
   while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>restartDeadline)throw Error("Restarted engine not ready");await Bun.sleep(300);}
   await Bun.sleep(3500);
   const restored=attentionSchema.parse(await request(`${endpoint}/attention`));

   expect(restored.paused).toBe(true);expect(restored.items[0]?.requestId).toBe(item.requestId);
   expect(restored.items[0]?.answerStatus).toBe("stale");expect(calls).toBe(1);
   expect(restored.items[0]?.sessionId).toBe(item.sessionId);
   await expect(request(endpoint,{action:"resume"})).rejects.toThrow("attention_resume_blocked");
   expect(statusSchema.parse(await request(endpoint)).paused).toBe(true);
   await Bun.sleep(3500);expect(calls).toBe(1);
   // A new process has no KV cache and no running engine client. It must still
   // recover the interrupted question from durable records without dispatch.
   const workspace=config.workspaces.find(workspace=>workspace.id===created.activeId);
   expect(workspace).toBeDefined();
   const probe=Bun.spawn([process.execPath,"--eval",`
     const {createAlwaysOnRunner}=await import(${JSON.stringify(new URL("../src/always-on.ts",import.meta.url).pathname)});
     const config=${JSON.stringify(config)};const workspace=${JSON.stringify(workspace)};
     const runner=createAlwaysOnRunner(config,{client:()=>{throw Error("Persistence read must not call the engine");}});
     try{console.log(JSON.stringify(await runner.attention(workspace)));}finally{await runner.stop();}
   `],{stdout:"pipe",stderr:"pipe"});
   const [probeCode,probeOutput,probeError]=await Promise.all([probe.exited,new Response(probe.stdout).text(),new Response(probe.stderr).text()]);
   if(probeCode!==0)throw Error(`Cross-process persistence failed: ${probeError}`);
   const persisted=attentionSchema.parse(JSON.parse(probeOutput));
   expect(persisted.items[0]?.requestId).toBe(item.requestId);expect(persisted.items[0]?.answerStatus).toBe("stale");
   expect(calls).toBe(1);
   if(!unanswered){const ledger=JSON.parse(await readFile(join(path,".get3w/always-on/answers.json"),"utf8"));
   expect(ledger[0].answers).toEqual([["New files"]]);expect(ledger[0].status).toBe("stale");}
   else expect(restored.items[0]?.request.questions[0]?.question).toBe("Which scope?");
   return;
  }
  await request(endpoint,{action:"resume"});
  let status=statusSchema.parse(await request(endpoint));
  while(status.event?.phase!=="done"){if(Date.now()>deadline)throw Error(`Did not complete: ${JSON.stringify(status)}`);await Bun.sleep(300);status=statusSchema.parse(await request(endpoint));}
  expect(providerError).toBeUndefined();expect(calls).toBe(2);expect(observed[1]).toContain("New files");expect(observed[1]).toContain("call_question_once");
  const resumedMessages=modelInput.shape.messages.parse(JSON.parse(observed[1]!));
  expect(resumedMessages.filter(message=>message.role==="user")).toHaveLength(1);
  expect(resumedMessages.filter(message=>message.role==="tool" && message.tool_call_id==="call_question_once")).toHaveLength(1);
  expect(status.sessionId).toBe(item.sessionId);expect(status.event?.id).toBe(item.eventId);expect(status.event?.messageId).toBe(item.messageId);
  expect(attentionSchema.parse(await request(`${endpoint}/attention`)).answerStatus).toBe("answered");
  const receipt=await readFile(join(path,`.get3w/always-on/runs/${item.eventId}.json`),"utf8");expect(receipt).toContain("QUESTION_NATIVE_COMPLETE");
  await request(endpoint,{action:"pause"});await Bun.sleep(3500);expect(calls).toBe(2);
 }finally{await stop?.();provider.stop(true);for(const[key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(root,{recursive:true,force:true});}
}
test("native question answer stays paused then resumes the same tool call exactly once",()=>verifyQuestion(false),90000);
test("native restart preserves saved answers and blocks replay when the original form is lost",()=>verifyQuestion(true),90000);

test("native restart retains an unanswered question and blocks replay",()=>verifyQuestion(true,true),90000);

test("native engine crash preserves the saved answer without replay",()=>verifyQuestion(true,false,true),90000);

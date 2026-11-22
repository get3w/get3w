// Run alone: real native engine, isolated profile, loopback-only scripted provider.
import {test,expect} from "bun:test";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {z} from "zod";
import type {ServerConfig} from "../src/types";
import {nativeProtocolResponse} from "./fixtures/native-provider-protocol-fixtures";
const modelInput=z.object({messages:z.array(z.object({role:z.string(),content:z.unknown(),tool_call_id:z.string().optional(),tool_calls:z.unknown().optional()})),tools:z.array(z.object({function:z.object({name:z.string(),parameters:z.unknown()})})).optional()});
const statusSchema=z.object({paused:z.boolean(),phase:z.string(),sessionId:z.string().nullable(),event:z.object({id:z.string(),messageId:z.string(),phase:z.string()}).nullable()});
const questionSchema=z.object({kind:z.literal("question"),questions:z.array(z.object({header:z.string(),question:z.string(),options:z.array(z.object({label:z.string(),description:z.string()})),multiple:z.boolean(),custom:z.boolean()}))});
const attentionSchema=z.object({paused:z.boolean(),answerStatus:z.string().optional(),items:z.array(z.object({eventId:z.string(),sessionId:z.string(),messageId:z.string(),requestId:z.string(),request:questionSchema,answerStatus:z.string().optional()}))});

async function verifyQuestion(restart:boolean, unanswered=false, crash=false, cancel=false) {
 const root=await mkdtemp(join(tmpdir(),"get3w-native-question-"));
 const environment={HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:process.env.GET3W_DEFERRED_TEST_BIN ?? resolve("apps/desktop/resources/sidecars/opencode2"),GET3W_DEFERRED_QUESTIONS:"1",GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"};
 const previous=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment);
 let calls=0;let providerError:unknown;const observed:string[]=[];
 const frame=(delta:unknown,finish:string|null)=>`data: ${JSON.stringify({id:"chatcmpl_question",object:"chat.completion.chunk",model:"fixture",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(request){if(request.method!=="POST")return Response.json({data:[]});try{
  const body=modelInput.parse(await request.json());calls++;observed.push(JSON.stringify(body.messages));
  if(calls===1){
   const tool=body.tools?.find(t=>t.function.name==="question");
   if(!tool)throw Error(`Question tool missing: ${JSON.stringify(body.tools)}`);
   return new Response(frame({role:"assistant",tool_calls:[{index:0,id:"call_question_once",type:"function",function:{name:tool.function.name,arguments:JSON.stringify({questions:[{header:"Scope",question:"Which scope?",options:[{label:"New files",description:"Only new files"},{label:"All files",description:"Everything"}],multiple:false}]})}}]},null)+frame({},"tool_calls")+"data: [DONE]\n\n",{headers:{"content-type":"text/event-stream"}});
  }
  return new Response(nativeProtocolResponse("openai","fixture","QUESTION_NATIVE_COMPLETE"),{headers:{"content-type":"text/event-stream"}});
 }catch(error){providerError=error;return new Response(nativeProtocolResponse("openai","fixture",String(error)),{headers:{"content-type":"text/event-stream"}});}}});
 let stop:(()=>Promise<void>)|undefined;
 let ui:ReturnType<typeof Bun.serve>|undefined;
 let failureEvidence:()=>Promise<unknown>=async()=>({});
 let poll:ReturnType<typeof setInterval>|undefined;
 const polling=new Set<Promise<void>>();
 try{
  const {startServer}=await import("../src/server");const {writeGlobalRuntimeOpencodeConfig}=await import("../src/runtime-opencode-config-store");
  const config:ServerConfig={host:"127.0.0.1",port:process.env.GET3W_DEFERRED_UI === "1" ? 4334 : 0,token:"fixture-client",hostToken:"fixture-host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:["http://localhost:5173"],workspaces:[],authorizedRoots:[root],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
  await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture-only"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096},tool_call:true}}}}}));
  let server=await startServer(config);stop=()=>server.stop();
  const request=async(path:string,body?:unknown,method?:string)=>{
   const response=await fetch(`http://127.0.0.1:${config.port}${path}`,{method:method ?? (body===undefined?"GET":"POST"),headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
   const value:unknown=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(value)}`);return value;
  };
  const deadline=Date.now()+240000;
  while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Engine not ready");await Bun.sleep(300);}
  const path=join(root,"workspace");await mkdir(path);
  const created=z.object({activeId:z.string()}).parse(await request("/workspaces/local",{folderPath:path,name:"Question acceptance",preset:"starter",workspaceType:"always-on",alwaysOn:{goal:"Ask which scope using the question tool, then report the answer. Do not write files or access external services.",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));
  const endpoint=`/workspaces/${created.activeId}/always-on`;
  failureEvidence=async()=>{
    const state=await readFile(join(path,".get3w/always-on/state.json"),"utf8").catch(()=>null);
    const current=statusSchema.safeParse(state ? JSON.parse(state) : null);
    const sessionId=current.success ? current.data.sessionId : null;
    const history=sessionId ? await request(`/workspace/${created.activeId}/opencode2/api/session/${encodeURIComponent(sessionId)}/message?limit=200`).catch(()=>null) : null;
    return {state,history,observed:observed.map(value=>JSON.parse(value))};
  };
  if(process.env.GET3W_DEFERRED_POLL === "1")poll=setInterval(()=>{
    const pending=Promise.allSettled([request(`${endpoint}/attention`),request(endpoint)]).then(()=>{});
    polling.add(pending);void pending.finally(()=>polling.delete(pending));
  },250);
  let attention=attentionSchema.parse(await request(`${endpoint}/attention`));
  while(!attention.items.length){if(providerError)throw providerError;if(Date.now()>deadline)throw Error(`No pending question: ${JSON.stringify(await request(endpoint))}`);await Bun.sleep(300);attention=attentionSchema.parse(await request(`${endpoint}/attention`));}
  await request(endpoint,{action:"pause"});
  const item=attention.items[0]!;expect(item.request.questions[0]?.question).toBe("Which scope?");expect(calls).toBe(1);
  const input={id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:{...item.request,requestId:item.requestId},answers:[["New files"]]};
  ui = process.env.GET3W_DEFERRED_UI === "1" ? Bun.serve({hostname:"127.0.0.1",port:4333,fetch:()=>Response.json({baseUrl:`http://127.0.0.1:${config.port}`,workspaceId:created.activeId},{headers:{"access-control-allow-origin":"http://localhost:5173"}})}) : undefined;
  if(ui) {
    console.log("DEFERRED_UI_READY");
    const uiDeadline=Date.now()+180000;
    while(attentionSchema.parse(await request(`${endpoint}/attention`)).items[0]?.answerStatus!=="queued") {
      if(Date.now()>uiDeadline)throw Error("Desktop answer was not submitted");
      await Bun.sleep(300);
    }
  }
  if(!unanswered && !ui){
  const denied=await fetch(`http://127.0.0.1:${config.port}${endpoint}/attention/answers`,{method:"POST",headers:{authorization:"Bearer fixture-client","content-type":"application/json"},body:JSON.stringify(input)});expect(denied.status).toBe(401);
  expect(await request(`${endpoint}/attention/answers`,input)).toEqual({status:"queued"});
  expect(await request(`${endpoint}/attention/answers`,input)).toEqual({status:"queued"});
  const conflict=await fetch(`http://127.0.0.1:${config.port}${endpoint}/attention/answers`,{method:"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},body:JSON.stringify({...input,id:crypto.randomUUID()})});expect(conflict.status).toBe(409);
  await Bun.sleep(3500);expect(calls).toBe(1);expect(attentionSchema.parse(await request(`${endpoint}/attention`)).items[0]?.answerStatus).toBe("queued");
  }else{await Bun.sleep(3500);expect(calls).toBe(1);}
  if(cancel){
    const cancellation={eventId:item.eventId,sessionId:item.sessionId,requestId:item.requestId};
    expect(await request(`${endpoint}/attention/cancel`,cancellation)).toEqual({status:"cancelled"});
    expect(await request(`${endpoint}/attention/cancel`,cancellation)).toEqual({status:"cancelled"});
    const native=z.object({pid:z.number().int().positive()}).parse(await request("/experimental/engine-v2-preview/status"));
    process.kill(native.pid,"SIGKILL");await server.stop();stop=undefined;
    server=await startServer(config);stop=()=>server.stop();
    const readyDeadline=Date.now()+30000;
    while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>readyDeadline)throw Error("Engine restart timed out");await Bun.sleep(300);}
    await Bun.sleep(4000);
    expect(calls).toBe(1);expect(attentionSchema.parse(await request(`${endpoint}/attention`)).answerStatus).toBe("cancelled");
    expect(statusSchema.parse(await request(endpoint)).paused).toBe(true);
    const rejected=await fetch(`http://127.0.0.1:${config.port}${endpoint}/attention/answers`,{method:"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},body:JSON.stringify(input)});
    expect(rejected.status).toBe(409);
    const previousState=statusSchema.parse(await request(endpoint));
    await request(endpoint,{settings:{goal:"REPLACEMENT_GOAL: report completion without asking another question.",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:60}},"PATCH");
    await Bun.sleep(3500);expect(calls).toBe(1);
    await request(endpoint,{action:"resume"});
    let replacement=statusSchema.parse(await request(endpoint));
    while(replacement.event?.phase!=="done"){if(Date.now()>deadline)throw Error(`Replacement incomplete: ${JSON.stringify(replacement)}`);await Bun.sleep(300);replacement=statusSchema.parse(await request(endpoint));}
    expect(replacement.event?.id).not.toBe(previousState.event?.id);expect(replacement.event?.messageId).not.toBe(previousState.event?.messageId);
    expect(replacement.sessionId).toBe(item.sessionId);expect(calls).toBe(2);
    const replacementInput=modelInput.shape.messages.parse(JSON.parse(observed[1]!));
    expect(replacementInput.filter(m=>m.role==="tool"&&m.tool_call_id==="call_question_once")).toHaveLength(1);
    expect(replacementInput.filter(m=>m.role==="tool"&&m.tool_call_id==="call_question_once")[0]?.content).not.toContain("New files");
    expect(JSON.stringify(replacementInput.filter(m=>m.role==="user").at(-1))).toContain("REPLACEMENT_GOAL");
    expect(attentionSchema.parse(await request(`${endpoint}/attention`)).items).toHaveLength(0);
    await request(endpoint,{action:"pause"});
    return;
  }
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
   expect(restored.items[0]?.answerStatus).toBe("queued");expect(calls).toBe(1);
   expect(restored.items[0]?.sessionId).toBe(item.sessionId);
  }

  if(process.env.GET3W_DEFERRED_RESUME_DELAY_MS)await Bun.sleep(Number(process.env.GET3W_DEFERRED_RESUME_DELAY_MS));
  if(ui) {
    console.log("DEFERRED_UI_RESTARTED");
    const uiDeadline=Date.now()+180000;
    while(statusSchema.parse(await request(endpoint)).paused) {
      if(Date.now()>uiDeadline)throw Error("Desktop workspace was not resumed");
      await Bun.sleep(300);
    }
  } else await request(endpoint,{action:"resume"});
  let status=statusSchema.parse(await request(endpoint));
  while(status.event?.phase!=="done"){if(Date.now()>deadline)throw Error(`Did not complete: ${JSON.stringify(status)}`);await Bun.sleep(300);status=statusSchema.parse(await request(endpoint));}
  expect(providerError).toBeUndefined();expect(calls).toBe(2);expect(observed[1]).toContain("New files");expect(observed[1]).toContain("call_question_once");
  const resumedMessages=modelInput.shape.messages.parse(JSON.parse(observed[1]!));
  if(resumedMessages.filter(message=>message.role==="user").length!==1)console.log("DEFERRED_UNEXPECTED_USERS",JSON.stringify(resumedMessages.filter(message=>message.role==="user")));
  expect(resumedMessages.filter(message=>message.role==="user")).toHaveLength(1);
  expect(resumedMessages.filter(message=>message.role==="user")).toEqual(modelInput.shape.messages.parse(JSON.parse(observed[0]!)).filter(message=>message.role==="user"));
  expect(resumedMessages.filter(message=>message.role==="tool" && message.tool_call_id==="call_question_once")).toHaveLength(1);
  expect(status.sessionId).toBe(item.sessionId);expect(status.event?.id).toBe(item.eventId);expect(status.event?.messageId).toBe(item.messageId);
  expect(attentionSchema.parse(await request(`${endpoint}/attention`)).answerStatus).toBe("answered");
  const receipt=await readFile(join(path,`.get3w/always-on/runs/${item.eventId}.json`),"utf8");expect(receipt).toContain("QUESTION_NATIVE_COMPLETE");
  console.log("DEFERRED_UI_COMPLETE");
  if(ui) {
    const uiDeadline=Date.now()+60000;
    while(!statusSchema.parse(await request(endpoint)).paused) {
      if(Date.now()>uiDeadline)throw Error("Desktop workspace was not paused after completion");
      await Bun.sleep(300);
    }
    ui.stop(true);
  } else await request(endpoint,{action:"pause"});
  await Bun.sleep(3500);expect(calls).toBe(2);
 }catch(error){
  // Only this isolated loopback fixture's inputs and history are captured.
  // Do not copy engine configuration, host tokens or the user's profile.
  const evidence=await mkdtemp(join(tmpdir(),"get3w-deferred-failure-"));
  await writeFile(join(evidence,"evidence.json"),JSON.stringify(await failureEvidence().catch(()=>({observed})),null,2),{mode:0o600});
  console.error(`Deferred acceptance evidence: ${evidence}`);
  throw error;
 }finally{
  ui?.stop(true);
  console.log("DEFERRED_CLEANUP_BEGIN");
  try{await stop?.();}finally{
   if(poll)clearInterval(poll);
   await Promise.allSettled(polling);
   provider.stop(true);
   for(const[key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}
   await rm(root,{recursive:true,force:true});
  }
  console.log("DEFERRED_CLEANUP_END");
 }
}
const enabled=Boolean(process.env.GET3W_DEFERRED_TEST_BIN);
test.skipIf(!enabled)("full engine deferred answer resumes original question after crash",()=>verifyQuestion(true,false,true),300000);

if(process.env.GET3W_DEFERRED_CANCEL === "1")test("native cancellation persists across engine crash without answer or model replay",()=>verifyQuestion(false,false,false,true),240000);

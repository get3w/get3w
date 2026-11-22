// Run alone. Real engine, real HTTP, separate server processes, no paid inference.
import {test,expect} from "bun:test";
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {z} from "zod";
import {exitProviderInput,exitProviderResponse} from "./fixtures/always-on-exit-provider";
const stateSchema=z.object({phase:z.string(),paused:z.boolean(),sessionId:z.string().nullable(),nextRunAt:z.number().nullable(),event:z.object({id:z.string(),messageId:z.string(),phase:z.string(),verification:z.object({status:z.string()}).optional()})});
const hostSchema=z.object({port:z.number(),pid:z.number()});

test("native process restart, lost model connection and durable duplicate events preserve identities and side effects",async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"get3w-recovery-native-")));
 let workspace="";let mode="normal";let held=false;let release:(()=>void)|undefined;let port=0;let child:ReturnType<typeof Bun.spawn>|undefined;
 const seen:string[]=[];const requestEvents:string[]=[];let providerError:unknown;let disconnected=false;
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,idleTimeout:120,async fetch(request){
  if(request.method!=="POST")return Response.json({data:[]});
  try{
   const body=exitProviderInput.parse(await request.json());const prompt=String(body.messages.filter(m=>m.role==="user").at(-1)?.content??"");
   const event=/Trigger: [^\n]*?Event: ([a-z0-9-]+)\./.exec(prompt)?.[1];if(event)requestEvents.push(event);
   if(mode==="hold"){held=true;await new Promise<void>(done=>{release=done;});}
   if(mode==="disconnect"&&disconnected)return Response.json({error:{message:"Injected connection unavailable; retry disabled",type:"invalid_request_error"}},{status:400});
   if(mode==="disconnect"){disconnected=true;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"id":"fault","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n'));setTimeout(()=>controller.error(Error("Injected model stream loss")),50);}}),{headers:{"content-type":"text/event-stream"}});}
   const response=exitProviderResponse(body,workspace);seen.push(response);return new Response(response,{headers:{"content-type":"text/event-stream"}});
  }catch(error){providerError=error;return Response.json({error:{message:String(error)}},{status:500});}
 }});
 async function start(){
  await rm(join(root,"host.json"),{force:true});
  child=Bun.spawn([process.execPath,"apps/server/test/fixtures/always-on-recovery-host.ts"],{cwd:resolve("."),env:{...process.env,GET3W_RECOVERY_ROOT:root,GET3W_RECOVERY_PROVIDER:`http://127.0.0.1:${provider.port}/v1`},stdout:Bun.file(join(root,`host-${Date.now()}.log`)),stderr:"inherit"});
  const deadline=Date.now()+45000;
  while(true){try{port=hostSchema.parse(JSON.parse(await readFile(join(root,"host.json"),"utf8"))).port;break;}catch{if(Date.now()>deadline)throw Error("Host did not start");await Bun.sleep(200);}}
  while(!z.object({running:z.boolean()}).parse(await req("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Native engine not ready");await Bun.sleep(200);}
 }
 async function stop(){child?.kill("SIGTERM");await child?.exited;child=undefined;}
 async function req(path:string,body?:unknown){const response=await fetch(`http://127.0.0.1:${port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer recovery-client","x-get3w-host-token":"recovery-host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const value:unknown=await response.json();if(!response.ok)throw Error(`${response.status} ${JSON.stringify(value)}`);return value;}
 async function until(path:string,predicate:(s:z.infer<typeof stateSchema>)=>boolean){const deadline=Date.now()+45000;while(true){const s=stateSchema.parse(await req(path));if(predicate(s))return s;if(Date.now()>deadline)throw Error(JSON.stringify({s,providerError:String(providerError)}));await Bun.sleep(250);}}
 async function create(name:string){workspace=join(root,name);await mkdir(workspace);await writeFile(join(workspace,"source.txt"),"count=3");const value=z.object({activeId:z.string()}).parse(await req("/workspaces/local",{folderPath:workspace,name,preset:"starter",workspaceType:"always-on",alwaysOn:{goal:"EXIT_QUIET Check source.txt locally and save records. No external actions.",fullAccess:true,costAuto:false,costLimit:"0",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));return `/workspaces/${value.activeId}/always-on`;}
 try{
  await start();const endpoint=await create("重启与去重验收");const completed=await until(endpoint,s=>s.phase==="idle");expect(completed.event.verification?.status).toBe("verified");await req(endpoint,{action:"pause"});const baseline=requestEvents.length;
  const sources=z.array(z.object({id:z.string()})).parse(await req(endpoint+"/sources",{kind:"webhook",name:"恢复测试来源",scope:""}));const sourceEndpoint=endpoint+`/sources/${sources[0]!.id}/events`;
  expect(await req(sourceEndpoint,{key:"same",text:"EXIT_QUIET source A"})).toEqual({duplicate:false});expect(await req(sourceEndpoint,{key:"same",text:"duplicate"})).toEqual({duplicate:true});
  await stop();await start();expect(stateSchema.parse(await req(endpoint))).toMatchObject({paused:true,sessionId:completed.sessionId});expect(await req(sourceEndpoint,{key:"same",text:"duplicate after restart"})).toEqual({duplicate:true});expect(requestEvents).toHaveLength(baseline);
  expect(await req(sourceEndpoint,{key:"different",text:"EXIT_QUIET source B"})).toEqual({duplicate:false});await req(endpoint,{action:"resume"});
  const inboxSchema=z.object({historyTotal:z.number(),pending:z.array(z.unknown())});const deadline=Date.now()+60000;
  while(true){const inbox=inboxSchema.parse(await req(endpoint+"/inbox"));if(inbox.historyTotal===3&&inbox.pending.length===0&&stateSchema.parse(await req(endpoint)).phase==="idle")break;if(Date.now()>deadline)throw Error("Source events did not complete");await Bun.sleep(250);}
  expect(new Set(requestEvents).size).toBe(3);expect((await readFile(join(workspace,"source.txt"),"utf8"))).toBe("count=3");await req(endpoint,{action:"pause"});
  // Real stream loss: the source turn must never be resubmitted by the runner.
  mode="disconnect";const faultEndpoint=await create("连接中断验收");const failed=await until(faultEndpoint,s=>["error","interrupted"].includes(s.phase));const faultId=failed.event.id;const attempts=requestEvents.filter(x=>x===faultId).length;expect(failed.nextRunAt).toBeNull();
  await stop();await start();await Bun.sleep(3500);expect(stateSchema.parse(await req(faultEndpoint))).toMatchObject({event:{id:faultId},nextRunAt:null});expect(requestEvents.filter(x=>x===faultId)).toHaveLength(attempts);await req(faultEndpoint,{action:"pause"});mode="normal";
  // Stop the server while a real native model request is in flight.
  mode="hold";held=false;const runningEndpoint=await create("执行中重启验收");const waitDeadline=Date.now()+30000;while(!held){if(Date.now()>waitDeadline)throw Error("Model request not held");await Bun.sleep(100);}
  const running=await until(runningEndpoint,s=>s.event.phase==="running");await stop();mode="normal";release?.();await start();
  const interrupted=await until(runningEndpoint,s=>["interrupted","error","idle"].includes(s.phase));expect(interrupted.sessionId).toBe(running.sessionId);expect(interrupted.event.id).toBe(running.event.id);const count=requestEvents.filter(x=>x===running.event.id).length;await Bun.sleep(3500);expect(requestEvents.filter(x=>x===running.event.id)).toHaveLength(count);expect(count).toBe(1);await req(runningEndpoint,{action:"pause"});
  expect(providerError).toBeUndefined();expect(seen.length).toBeGreaterThan(3);
  await writeFile(join(root,"acceptance.json"),JSON.stringify({requestEvents,completedEvent:completed.event.id,faultEvent:faultId,faultRequests:attempts,inflightEvent:running.event.id,inflightRequests:count,states:{completed,failed,interrupted}},null,2));
 }finally{mode="normal";release?.();await stop();provider.stop(true);if(process.env.GET3W_KEEP_RECOVERY_EVIDENCE==="1")console.log("RECOVERY_EVIDENCE",root);else await rm(root,{recursive:true,force:true});}
},240000);

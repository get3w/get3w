// Run alone: HOME/XDG/runtime are isolated before the server is imported.
import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { ServerConfig } from "../src/types";
import { nativeProtocolResponse } from "./fixtures/native-provider-protocol-fixtures";

test("real native engine runs a created always-on workspace and persists its result without changing local defaults", async () => {
 const root=await mkdtemp(join(tmpdir(),"always-on-native-"));
 const binary=resolve("apps/desktop/resources/sidecars/opencode2");
 const environment={HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:binary,GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"};
 const previous=new Map(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment);
 let calls=0; let fixturePath: string | undefined; let notificationEventId: string | undefined; const requests: string[] = [];
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(request){requests.push(await request.text());calls++;
   if(fixturePath && calls>1) {
    const state=JSON.parse(await readFile(join(fixturePath,".get3w/always-on/state.json"),"utf8"));
    await writeFile(join(fixturePath,`.get3w/always-on/results/${state.event.id}.json`),JSON.stringify({eventId:state.event.id,outcome:"no_change",summary:"Fixture completed",artifacts:[],notification:state.event.id===notificationEventId?{action:"send",text:"Isolated follow-up result is ready"}:{action:"quiet"}}));
    await writeFile(join(fixturePath,".get3w/always-on/checkpoint.md"),`Fixture continuity ${state.event.id}`);
   }
   return new Response(nativeProtocolResponse("openai","fixture","ALWAYS_ON_NATIVE_COMPLETE"),{headers:{"content-type":"text/event-stream"}});}});
 let stop: (()=>Promise<void>)|undefined;
 try {
  const {startServer}=await import("../src/server");
  const {writeGlobalRuntimeOpencodeConfig}=await import("../src/runtime-opencode-config-store");
  const {taskPermissionSettings}=await import("../src/task-permission-modes");
  const {taskCostSettings}=await import("../src/task-cost-settings");
  const config:ServerConfig={host:"127.0.0.1",port:0,token:"test",hostToken:"host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
  await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture-only"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096}}}}}}));
  const server=await startServer(config);stop=()=>server.stop();
  const request=async(path:string,body?:unknown)=>{
   const response=await fetch(`http://127.0.0.1:${server.port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer test","x-get3w-host-token":"host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
   const value:unknown=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(value)}`);return value;
  };
  const ready=z.object({running:z.boolean(),lastError:z.string().nullable().optional()});
  const deadline=Date.now()+60000;
  while(!ready.parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Native engine did not start");await Bun.sleep(500);}
  const path=join(root,"workspace");fixturePath=path;await mkdir(path);
  const created=z.object({activeId:z.string(),workspaces:z.array(z.object({id:z.string(),workspaceType:z.string()}))}).parse(await request("/workspaces/local",{folderPath:path,name:"Native goal",preset:"starter",workspaceType:"always-on",alwaysOn:{goal:"Reply with ALWAYS_ON_NATIVE_COMPLETE. Do not use tools.",criteria:"A short response",behavior:"No file/network operations",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));
  expect(created.workspaces[0]?.workspaceType).toBe("always-on");
  const schema=z.object({phase:z.string(),sessionId:z.string().nullable(),lastError:z.string().nullable(),paused:z.boolean()});
  let status=schema.parse(await request(`/workspaces/${created.activeId}/always-on`));
  while(status.phase!=="idle"){
   if(["interrupted","error"].includes(status.phase))throw Error(JSON.stringify(status));
   if(Date.now()>deadline)throw Error(`Run did not finish: ${JSON.stringify(status)}`);
   await Bun.sleep(500);status=schema.parse(await request(`/workspaces/${created.activeId}/always-on`));
  }
  // A real native reply without file evidence is explicitly unverified.
  const initialState = JSON.parse(await readFile(join(path,".get3w/always-on/state.json"),"utf8"));
  expect(initialState.event.verification.status).toBe("needs_review");
  expect(initialState.nextRunAt).toBeNull();
  await mkdir(join(path,".get3w/always-on/results"),{recursive:true});
  await writeFile(join(path,`.get3w/always-on/results/${initialState.event.id}.json`),JSON.stringify({eventId:initialState.event.id,outcome:"no_change",summary:"Native fixture complete",artifacts:[]}));
  await writeFile(join(path,".get3w/always-on/checkpoint.md"),`Fixture continuity ${initialState.event.id}`);
  const endpointResult=`/workspaces/${created.activeId}/always-on/results/${initialState.event.id}`;
  const deniedResult=await fetch(`http://127.0.0.1:${server.port}${endpointResult}`,{method:"POST",headers:{authorization:"Bearer test","content-type":"application/json"},body:JSON.stringify({action:"repair"})});
  expect(deniedResult.status).toBe(401);
  await request(endpointResult,{action:"verify"});
  expect(status.sessionId).not.toBeNull();expect(calls).toBeGreaterThan(0);
  const state=JSON.parse(await readFile(join(path,".get3w","always-on","state.json"),"utf8"));
  const result=await readFile(join(path,".get3w","always-on","runs",`${state.event.id}.json`),"utf8");expect(result).toContain("ALWAYS_ON_NATIVE_COMPLETE");
  expect((await taskPermissionSettings(config)).defaultMode).toBe("default");expect((await taskCostSettings(config)).policy.currency).toBe("USD");
  expect(schema.parse(await request(`/workspaces/${created.activeId}/always-on`,{action:"pause"})).paused).toBe(true);
  const edited=await fetch(`http://127.0.0.1:${server.port}/workspaces/${created.activeId}/always-on`,{method:"PATCH",headers:{authorization:"Bearer test","x-get3w-host-token":"host","content-type":"application/json"},body:JSON.stringify({settings:{...state.settings,goal:"Updated ongoing goal",intervalMinutes:30}})});
  expect(edited.ok).toBe(true);
  expect(z.object({settings:z.object({goal:z.string()}),paused:z.boolean()}).parse(await edited.json())).toMatchObject({settings:{goal:"Updated ongoing goal"},paused:true});

  const sources=z.array(z.object({id:z.string(),name:z.string()})).parse(await request(`/workspaces/${created.activeId}/always-on/sources`,{kind:"webhook",name:"Native event",scope:""}));
  const endpoint=`/workspaces/${created.activeId}/always-on/sources/${sources[0]!.id}/events`;
  const denied=await fetch(`http://127.0.0.1:${server.port}${endpoint}`,{method:"POST",headers:{authorization:"Bearer test","content-type":"application/json"},body:JSON.stringify({text:"blocked",key:"denied"})});expect(denied.status).toBe(401);
  expect(await request(endpoint,{text:"Fixture source event",key:"native-1"})).toEqual({duplicate:false});
  expect(await request(endpoint,{text:"Fixture source event",key:"native-1"})).toEqual({duplicate:true});
  const inboxSchema=z.object({pending:z.array(z.object({text:z.string().optional()})),historyTotal:z.number()});
  expect(inboxSchema.parse(await request(`/workspaces/${created.activeId}/always-on/inbox`)).pending.some(event=>event.text==="Fixture source event")).toBe(true);
  const followupId=crypto.randomUUID();
  notificationEventId=followupId;
  const followupEndpoint=`/workspaces/${created.activeId}/always-on/followups`;
  const followupInput={id:followupId,text:"Reply with ALWAYS_ON_NATIVE_COMPLETE. Do not use tools.",dueAt:Date.now()+1000};
  const deniedFollowup=await fetch(`http://127.0.0.1:${server.port}${followupEndpoint}`,{method:"POST",headers:{authorization:"Bearer test","content-type":"application/json"},body:JSON.stringify(followupInput)});expect(deniedFollowup.status).toBe(401);
  await request(followupEndpoint,followupInput);await request(followupEndpoint,followupInput);
  await server.stop();stop=undefined;
  const resumed=await startServer(config);stop=()=>resumed.stop();
  // startServer updates config.port if a new port was assigned.
  const restored=await fetch(`http://127.0.0.1:${resumed.port}/workspaces/${created.activeId}/always-on`,{headers:{authorization:"Bearer test"}}).then(response=>response.json());
  const restoredInbox=await fetch(`http://127.0.0.1:${resumed.port}/workspaces/${created.activeId}/always-on/inbox`,{headers:{authorization:"Bearer test"}}).then(response=>response.json());
  expect(inboxSchema.parse(restoredInbox).pending.some(event=>event.text==="Fixture source event")).toBe(true);
  expect(schema.parse(restored).paused).toBe(true);
  expect(schema.parse(restored).sessionId).toBe(status.sessionId);
  await writeFile(join(path,".get3w","always-on","checkpoint.md"), "Fixture continuity: completed the first check; no external actions or notifications.");
  const baseline=calls;await Bun.sleep(3500);expect(calls).toBe(baseline);
  const resumedRequest=async(path:string,body?:unknown)=>{
   const response=await fetch(`http://127.0.0.1:${resumed.port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer test","x-get3w-host-token":"host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!response.ok)throw Error(`Request failed: ${response.status}`);return response.json();
  };
  const timers=z.object({followups:z.array(z.object({id:z.string(),state:z.string()}))}).parse(await resumedRequest(`/workspaces/${created.activeId}/always-on/timers`));
  expect(timers.followups).toHaveLength(1);expect(timers.followups[0]?.state).toBe("triggered");
  await resumedRequest(`/workspaces/${created.activeId}/always-on`,{action:"resume"});
  const focused=z.object({focusedRun:z.object({phase:z.string(),sessionId:z.string().nullable()})});
  const completionDeadline=Date.now()+30000;
  let run=focused.parse(await resumedRequest(`/workspaces/${created.activeId}/always-on/inbox?eventId=${followupId}`));
  while(run.focusedRun.phase!=="done") { if(Date.now()>completionDeadline)throw Error("Follow-up did not complete");await Bun.sleep(500);run=focused.parse(await resumedRequest(`/workspaces/${created.activeId}/always-on/inbox?eventId=${followupId}`)); }
  expect(run.focusedRun.sessionId).toBe(status.sessionId);
  // Exercise the real renderer HTTP client and dispatcher against this isolated
  // server. Only the OS boundary is substituted; no native popup or paid model.
  const {createGet3wServerClient}=await import("../../app/src/app/lib/get3w-server");
  const {dispatchAlwaysOnNotification}=await import("../../app/src/react-app/domains/workspace/always-on-dispatcher");
  const deliveryClient=createGet3wServerClient({baseUrl:`http://127.0.0.1:${resumed.port}`,token:"test",hostToken:"host"});
  const deliveries=await deliveryClient.alwaysOnOutbox(created.activeId);
  const delivery=deliveries.find(item=>item.id===followupId);
  expect(delivery).toMatchObject({status:"pending",attempts:0,sessionId:status.sessionId});
  expect(delivery?.messageId).toBeTruthy();
  let nativeSubmissions=0;
  await dispatchAlwaysOnNotification(deliveryClient,created.activeId,true,async input=>{
   nativeSubmissions++;
   expect(input.href).toBe(`/workspace/${created.activeId}/session/${status.sessionId}?runMessage=${delivery?.messageId}`);
   expect(input.body).toBe("Isolated follow-up result is ready");
   return {ok:true};
  });
  expect((await deliveryClient.alwaysOnOutbox(created.activeId)).find(item=>item.id===followupId)).toMatchObject({status:"submitted",attempts:1});
  await dispatchAlwaysOnNotification(deliveryClient,created.activeId,true,async()=>{nativeSubmissions++;return {ok:true};});
  expect(nativeSubmissions).toBe(1);
  // Reopen persistence in a fresh process, rather than relying on the live
  // server's in-memory state to prove submission survives a restart.
  const persisted=Bun.spawn([process.execPath,"--eval",`const {readAlwaysOnOutbox,changeAlwaysOnOutbox}=await import(${JSON.stringify(new URL("../src/always-on-outbox.ts",import.meta.url).pathname)});const w=${JSON.stringify(config.workspaces.find(workspace=>workspace.id===created.activeId))};console.log(JSON.stringify({items:await readAlwaysOnOutbox(w),claim:await changeAlwaysOnOutbox(w,{action:"claim"})}));`],{stdout:"pipe",stderr:"pipe"});
  expect(await persisted.exited).toBe(0);
  const persistedResult=z.object({items:z.array(z.object({id:z.string(),status:z.string(),attempts:z.number()})),claim:z.unknown()}).parse(JSON.parse(await new Response(persisted.stdout).text()));
  expect(persistedResult.items.find(item=>item.id===followupId)).toMatchObject({status:"submitted",attempts:1});
  expect(persistedResult.claim).toBeNull();
  expect(requests.at(-1)).toContain("Fixture continuity");
  expect(requests.at(-1)).not.toContain("Trigger: created");
  expect(requests[0]).toContain("Trigger: created");
  const history=await readFile(join(path,".get3w","always-on","runs",`${state.event.id}.json`),"utf8");
  expect(history).toContain("Trigger: created");
  await rm(join(path, ".get3w", "always-on", "state.json"));
  const missing = await fetch(`http://127.0.0.1:${resumed.port}/workspaces/${created.activeId}/always-on`, { headers: { authorization: "Bearer test" } });
  expect(missing.status).toBe(409);
  expect(await missing.json()).toMatchObject({ code: "always_on_state_missing", message: expect.stringContaining("持续运行数据缺失") });
  const callsBeforeMissing = calls;
  await Bun.sleep(3500);
  expect(calls).toBe(callsBeforeMissing);
  await expect(readFile(join(path, ".get3w", "always-on", "state.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });


 } finally {
  await stop?.();provider.stop(true);for(const [key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(root,{recursive:true,force:true});
 }
},90000);

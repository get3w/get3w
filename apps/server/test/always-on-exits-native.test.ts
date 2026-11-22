// Run alone: real formal CLI/tools, isolated profile, loopback scripted model.
import {test,expect} from "bun:test";
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {z} from "zod";
import type {ServerConfig} from "../src/types";
import {exitProviderInput,exitProviderResponse} from "./fixtures/always-on-exit-provider";
const binary=process.env.GET3W_DEFERRED_TEST_BIN;
test.skipIf(!binary)("formal engine completes send, quiet and deferred exits through real file and artifact tools",async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"get3w-exits-native-")));
 const env={HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:binary??"",GET3W_DEFERRED_QUESTIONS:"1",GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"};
 const previous=new Map(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const observed:unknown[]=[];let providerError:unknown;let workspacePath="";let failed=false;
 const provider=Bun.serve({hostname:"127.0.0.1",port:0,async fetch(request){if(request.method!=="POST")return Response.json({data:[]});try{const b=exitProviderInput.parse(await request.json());observed.push(b);return new Response(exitProviderResponse(b,workspacePath,process.env.GET3W_COMPLETION_TOOL_TEST==="1"),{headers:{"content-type":"text/event-stream"}});}catch(e){providerError=e;return new Response(String(e),{status:500});}}});
 let stop:(()=>Promise<void>)|undefined;
 try{
  const {startServer}=await import("../src/server");const {writeGlobalRuntimeOpencodeConfig}=await import("../src/runtime-opencode-config-store");
  const config:ServerConfig={host:"127.0.0.1",port:0,token:"fixture-client",hostToken:"fixture-host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[root],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
  await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture-only"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096},tool_call:true}}}}}));
  let server=await startServer(config);stop=()=>server.stop();
  async function request(path:string,body?:unknown){const r=await fetch(`http://127.0.0.1:${config.port}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:"Bearer fixture-client","x-get3w-host-token":"fixture-host","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const v:unknown=await r.json();if(!r.ok)throw Error(`${r.status} ${JSON.stringify(v)}`);return v;}
  const deadline=Date.now()+180000;
  while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Engine readiness timed out");await Bun.sleep(300);}
  for(const scenario of ["SEND","QUIET","DEFERRED"]){
   workspacePath=join(root,scenario);await mkdir(workspacePath);await writeFile(join(workspacePath,"source.txt"),"Local acceptance source: count=3\n");
   const created=z.object({activeId:z.string()}).parse(await request("/workspaces/local",{folderPath:workspacePath,name:`Exit ${scenario}`,preset:"starter",workspaceType:"always-on",alwaysOn:{goal:`EXIT_${scenario}: Read source.txt using native tools. ${scenario==="QUIET"?"No changes; save runtime records and stay quiet.":"Create and register a report, save runtime records, request a notification."} ${scenario==="DEFERRED"?"First ask the scope using question; wait for my answer.":""}`,fullAccess:true,costAuto:false,costLimit:"7.00",intervalMinutes:60},defaultModel:{providerID:"fixture",modelID:"fixture"}}));
   const endpoint=`/workspaces/${created.activeId}/always-on`;
   if(process.env.GET3W_MEMORY_INDEX_TEST==="1") {
    await request(`${endpoint}/memory`,{action:"save",revision:0,title:"Native memory title",text:"PRIVATE_NOTE_BODY: use sources"});
    await writeFile(join(workspacePath,".get3w/always-on/checkpoint.md"),"PRIVATE_PROGRESS_BODY: inspect source.txt next");
   }
   const stateSchema=z.object({paused:z.boolean(),phase:z.string(),sessionId:z.string().nullable(),event:z.object({id:z.string(),messageId:z.string(),phase:z.string(),verification:z.object({status:z.string(),outcome:z.string(),artifacts:z.array(z.string())}).optional()})});
   if(scenario==="DEFERRED"){
    const attentionSchema=z.object({items:z.array(z.object({eventId:z.string(),sessionId:z.string(),requestId:z.string(),request:z.record(z.string(),z.unknown())}))});
    let a=attentionSchema.parse(await request(`${endpoint}/attention`));while(!a.items.length){if(providerError)throw providerError;if(Date.now()>deadline)throw Error("No deferred question");await Bun.sleep(300);a=attentionSchema.parse(await request(`${endpoint}/attention`));}
    const item=a.items[0]!;const baseline=observed.length;await Bun.sleep(1000);expect(observed.length).toBe(baseline);
    if(process.env.GET3W_SUSPENSION_TEST==="1") {
      const sources=z.array(z.object({id:z.string()})).parse(await request(`${endpoint}/sources`,{kind:"webhook",name:"While waiting",scope:""}));
      await request(`${endpoint}/sources/${sources.at(-1)!.id}/events`,{key:"B",text:"INDEPENDENT_WHILE_WAITING"});
      const switchingSchema=stateSchema.extend({event:stateSchema.shape.event.nullable()});
      let parallel=switchingSchema.parse(await request(endpoint));
      while(parallel.sessionId===item.sessionId || parallel.event?.phase!=="done") {if(providerError)throw providerError;if(Date.now()>deadline)throw Error(`B did not complete while A waited: ${JSON.stringify(parallel)}`);await Bun.sleep(300);parallel=switchingSchema.parse(await request(endpoint));}
      expect(parallel.sessionId).not.toBe(item.sessionId);
      expect(attentionSchema.parse(await request(`${endpoint}/attention`)).items.some(row=>row.sessionId===item.sessionId)).toBe(true);
      // Recreate the complete host/engine with both session bindings on disk.
      await server.stop();server=await startServer(config);
      while(!z.object({running:z.boolean()}).parse(await request("/experimental/engine-v2-preview/status")).running){if(Date.now()>deadline)throw Error("Restart readiness timed out");await Bun.sleep(300);}
      expect(attentionSchema.parse(await request(`${endpoint}/attention`)).items.some(row=>row.sessionId===item.sessionId)).toBe(true);
      // Queue the answer while globally paused; it cannot wake either session.
      await request(endpoint,{action:"pause"});const count=observed.length;
      await request(`${endpoint}/attention/answers`,{id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:{...item.request,requestId:item.requestId},answers:[["仅新增文件"]]});
      await Bun.sleep(1000);expect(observed.length).toBe(count);await request(endpoint,{action:"resume"});
      let original=stateSchema.parse(await request(endpoint));
      while(original.sessionId!==item.sessionId || original.event.phase!=="done"){if(providerError)throw providerError;if(Date.now()>deadline)throw Error("A did not resume its original call");await Bun.sleep(300);original=stateSchema.parse(await request(endpoint));}
      expect(original.event.id).toBe(item.eventId);
    } else {
      await request(endpoint,{action:"pause"});await request(`${endpoint}/attention/answers`,{id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:{...item.request,requestId:item.requestId},answers:[["仅新增文件"]]});
      await Bun.sleep(1000);expect(observed.length).toBe(baseline);await request(endpoint,{action:"resume"});
    }
   }
   let s=stateSchema.parse(await request(endpoint));while(s.event.phase!=="done"){if(providerError)throw providerError;if(Date.now()>deadline)throw Error(JSON.stringify(s));await Bun.sleep(300);s=stateSchema.parse(await request(endpoint));}
   expect(providerError).toBeUndefined();expect(s.event.verification?.status).toBe("verified");expect(s.event.verification?.outcome).toBe(scenario==="QUIET"?"no_change":"changed");
   const outboxSchema=z.array(z.object({id:z.string(),status:z.string(),sessionId:z.string(),messageId:z.string(),attempts:z.number()}));
   let outbox=outboxSchema.parse(await request(`${endpoint}/outbox`));
   const expectedOutbox=scenario==="QUIET"?0:process.env.GET3W_SUSPENSION_TEST==="1" && scenario==="DEFERRED"?2:1;
   while(outbox.length<expectedOutbox){if(Date.now()>deadline)throw Error("Outbox enqueue timeout");await Bun.sleep(300);outbox=outboxSchema.parse(await request(`${endpoint}/outbox`));}
   if(scenario==="QUIET"){expect(outbox).toHaveLength(0);expect(s.event.verification?.artifacts).toEqual([]);}else{
    expect(outbox).toHaveLength(process.env.GET3W_SUSPENSION_TEST==="1" && scenario==="DEFERRED"?2:1);expect(outbox.find(item=>item.id===s.event.id)).toMatchObject({id:s.event.id,status:"pending",sessionId:s.sessionId,messageId:s.event.messageId,attempts:0});
    const file=s.event.verification?.artifacts[0];if(!file)throw Error("Artifact missing");expect(await readFile(join(workspacePath,file),"utf8")).toContain("count=3");
    // Exercise the actual HTTP dispatcher; OS submission is separately checked in Desktop.
    const {createGet3wServerClient}=await import("../../app/src/app/lib/get3w-server");const {dispatchAlwaysOnNotification}=await import("../../app/src/react-app/domains/workspace/always-on-dispatcher");
    const client=createGet3wServerClient({baseUrl:`http://127.0.0.1:${config.port}`,token:"fixture-client",hostToken:"fixture-host"});let submissions=0;
    await dispatchAlwaysOnNotification(client,created.activeId,true,async input=>{submissions++;expect(outbox.some(row=>input.href===`/workspace/${created.activeId}/session/${row.sessionId}?runMessage=${row.messageId}`)).toBe(true);return {ok:true};});
    await dispatchAlwaysOnNotification(client,created.activeId,true,async()=>{submissions++;return {ok:true};});expect(submissions).toBe(process.env.GET3W_SUSPENSION_TEST==="1" && scenario==="DEFERRED"?2:1);
    expect(outboxSchema.parse(await request(`${endpoint}/outbox`))[0]).toMatchObject({status:"submitted",attempts:1});
   }
   if(process.env.GET3W_TASK_SESSION_TEST==="1" && scenario==="QUIET") {
    const originalSession=s.sessionId;
    const sources=z.array(z.object({id:z.string()})).parse(await request(`${endpoint}/sources`,{kind:"webhook",name:"Isolated task source",scope:""}));
    const source=sources.at(-1)!;
    await request(`${endpoint}/sources/${source.id}/events`,{key:"independent",text:"Independent source task"});
    let next=stateSchema.parse(await request(endpoint));
    while(next.event.id===s.event.id || next.event.phase!=="done") {if(providerError)throw providerError;if(Date.now()>deadline)throw Error("Independent task timeout");await Bun.sleep(300);next=stateSchema.parse(await request(endpoint));}
    expect(next.sessionId).not.toBe(originalSession);
    const timers=z.object({currentTaskId:z.string(),tasks:z.array(z.object({id:z.string(),sessionId:z.string().nullable()}))}).parse(await request(`${endpoint}/timers`));
    expect(timers.tasks).toHaveLength(2);
    const followup=crypto.randomUUID();await request(`${endpoint}/followups`,{id:followup,text:"Continue same task",dueAt:Date.now()+1000,taskId:timers.currentTaskId});
    let continued=stateSchema.parse(await request(endpoint));
    while(continued.event.id!==followup || continued.event.phase!=="done") {if(providerError)throw providerError;if(Date.now()>deadline)throw Error("Related followup timeout");await Bun.sleep(300);continued=stateSchema.parse(await request(endpoint));}
    expect(continued.sessionId).toBe(next.sessionId);
    expect(z.object({tasks:z.array(z.unknown())}).parse(await request(`${endpoint}/timers`)).tasks).toHaveLength(2);
   }
   if(process.env.GET3W_EVENT_MERGE_TEST==="1" && scenario==="SEND"){
     const source=z.array(z.object({id:z.string()})).parse(await request(`${endpoint}/sources`,{kind:"webhook",name:"Merge native",mergeWindowSeconds:5})).at(-1)!;
     const accepted=z.object({eventId:z.string(),batchId:z.string(),merged:z.boolean()});
     const first=accepted.parse(await request(`${endpoint}/sources/${source.id}/events`,{key:"merge-1",taskKey:"resource-42",text:"Native first original"}));
     const second=accepted.parse(await request(`${endpoint}/sources/${source.id}/events`,{key:"merge-2",taskKey:"resource-42",text:"Native second original"}));
     expect(second.merged).toBe(true);expect(second.batchId).toBe(first.eventId);
     let combined=stateSchema.parse(await request(endpoint));
     while(combined.event.id!==first.batchId || combined.event.phase!=="done"){if(providerError)throw providerError;if(Date.now()>deadline)throw Error("Merged native event timeout");await Bun.sleep(300);combined=stateSchema.parse(await request(endpoint));}
     const originals=z.object({history:z.array(z.object({id:z.string(),batchId:z.string().optional(),phase:z.string(),messageId:z.string(),sessionId:z.string().nullable()}))}).parse(await request(`${endpoint}/inbox`)).history.filter(row=>row.batchId===first.batchId);
     expect(originals).toHaveLength(2);expect(new Set(originals.map(row=>row.messageId)).size).toBe(1);expect(originals.every(row=>row.phase==="done")).toBe(true);
     let deliveries=outboxSchema.parse(await request(`${endpoint}/outbox`));while(!deliveries.some(row=>row.id===first.batchId)){if(Date.now()>deadline)throw Error("Merged outbox timeout");await Bun.sleep(300);deliveries=outboxSchema.parse(await request(`${endpoint}/outbox`));}
     expect(deliveries.filter(row=>row.id===first.batchId)).toHaveLength(1);
     const requests=observed.map(raw=>exitProviderInput.parse(raw)).filter(body=>body.messages.some(message=>message.role==="user" && String(message.content).includes(`Event: ${first.batchId}.`)));
     expect(requests.length).toBeGreaterThan(0);expect(requests.every(body=>body.messages.filter(message=>message.role==="user" && String(message.content).includes(`Event: ${first.batchId}.`)).length===1)).toBe(true);
   }
   await request(endpoint,{action:"pause"});
  }
 }catch(e){failed=true;console.error('EXIT_EVIDENCE',root);await writeFile(join(root,"requests.json"),JSON.stringify(observed),{mode:0o600});throw e;
 }finally{try{await stop?.();}finally{provider.stop(true);for(const[k,v]of previous){if(v===undefined)delete process.env[k];else process.env[k]=v;}if(!failed)await rm(root,{recursive:true,force:true});}}
},240000);

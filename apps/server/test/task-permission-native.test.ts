import {readCostRun,costRunKey,setTaskCostSettings} from "../src/task-cost-settings.js";
import {test,expect} from "bun:test";
import {mkdtemp,mkdir,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {createV2ContextBridge} from "../src/opencode-v2-context-bridge.js";
import {rememberThreadApproval,revokeThreadApproval} from "../src/thread-approvals.js";
import {workspaceIdForPath} from "../src/workspaces.js";
import {setTaskPermissionMode,taskPermissionSettings} from "../src/task-permission-modes.js";
import type {ServerConfig} from "../src/types.js";

test("real pinned engine evaluates per-task mode and keeps explicit denials",async()=>{
 const root=await mkdtemp(join(tmpdir(),"get3w-permission-native-"));
 const workspace=join(root,"workspace");await mkdir(workspace);
 const config={configPath:join(root,"server.json"),workspaces:[]} as unknown as ServerConfig;
 let connection:{url:string;username:string;password:string}|undefined;
 const bridge=await createV2ContextBridge(async()=>({}),()=>connection,config);
 const plugin=join(root,"plugin");await mkdir(plugin);await writeFile(join(plugin,"package.json"),'{"type":"module"}');
 const built=await Bun.build({entrypoints:[resolve("apps/server/src/opencode-plugins/get3w-agent-permissions-v2.ts")],target:"node",format:"esm",outdir:plugin});
 expect(built.success).toBe(true);
 await writeFile(join(plugin,"server.js"),'export {default} from "./get3w-agent-permissions-v2.js";');
 const configDir=join(root,"config");await mkdir(configDir);
 const nativeConfig=join(configDir,"opencode.json");await writeFile(nativeConfig,JSON.stringify({plugins:[{package:new URL(`file://${plugin}`).href,options:{rules:[],permissionPolicy:bridge}}],permissions:[{action:"external_directory",resource:"*",effect:"ask"},{action:"shell",resource:"blocked",effect:"deny"}]}));
 const child=spawn(resolve("apps/desktop/resources/sidecars/opencode2"),["serve","--hostname","127.0.0.1","--port","0"],{env:{PATH:process.env.PATH,HOME:root,XDG_CONFIG_HOME:join(root,"xdg-config"),XDG_DATA_HOME:join(root,"xdg-data"),XDG_CACHE_HOME:join(root,"xdg-cache"),OPENCODE_DB:join(root,"engine.db"),OPENCODE_CONFIG:nativeConfig,OPENCODE_PASSWORD:"test-secret",OPENCODE_CONFIG_DIR:configDir,OPENCODE_DISABLE_MODELS_FETCH:"1"},stdio:["ignore","pipe","pipe"]});
 let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);
 try {
  for(let i=0;i<200&&!/http:\/\/127\.0\.0\.1:\d+/.test(output);i++)await Bun.sleep(50);
  const url=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(!url)throw Error(output);
  connection={url,username:"opencode",password:"test-secret"};
  const request=async(path:string,body?:unknown)=>{
   const response=await fetch(new URL(path+(path.includes("?")?"&":"?")+"location[directory]="+encodeURIComponent(workspace),url),{method:body?"POST":"GET",headers:{authorization:`Basic ${Buffer.from("opencode:test-secret").toString("base64")}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
   const payload=await response.json();if(!response.ok)throw Error(JSON.stringify(payload));return payload.data??payload;
  };
  const events = new AbortController();
  const eventStream = await fetch(new URL(`/api/event?location[directory]=${encodeURIComponent(workspace)}`,url), {headers:{authorization:`Basic ${Buffer.from("opencode:test-secret").toString("base64")}`},signal:events.signal});
  void (async()=>{if(eventStream.body)for await(const _ of eventStream.body){}})().catch(()=>{});
  const a=await request("/api/session",{location:{directory:workspace},title:"Full"});
  const b=await request("/api/session",{location:{directory:workspace},title:"Default"});
  await request("/api/agent");
  await Bun.sleep(500);



  await setTaskPermissionMode(config,"default",b.id);
  await setTaskPermissionMode(config,"full_access",a.id);
  const ask=async(id:string,action="external_directory",resource="/outside")=>request(`/api/session/${id}/permission`,{action,resources:[resource],save:[],agent:"build"});
  expect((await ask(a.id)).effect).toBe("allow");
  expect((await ask(b.id)).effect).toBe("ask");
  expect((await ask(a.id,"shell","blocked")).effect).toBe("deny");
  await setTaskPermissionMode(config,"default",a.id);
  expect((await ask(a.id)).effect).toBe("ask");
  await rememberThreadApproval(config,workspaceIdForPath(workspace),a.id,{permission:"external_directory",patterns:["/outside"]});
  expect((await ask(a.id)).effect).toBe("allow");
  expect((await ask(b.id)).effect).toBe("ask");
  await revokeThreadApproval(config,workspaceIdForPath(workspace),a.id,0);
  expect((await ask(a.id)).effect).toBe("ask");
  await setTaskPermissionMode(config,"full_access");
  const c=await request("/api/session",{location:{directory:workspace},title:"New default"});
  for(let i=0;i<80&&(await taskPermissionSettings(config,c.id)).mode!=="full_access";i++)await Bun.sleep(50);
  expect((await taskPermissionSettings(config,c.id)).mode).toBe("full_access");
  expect((await ask(c.id)).effect).toBe("allow");
  await setTaskCostSettings(config,{enabled:true,amount:"1",currency:"USD"},c.id);
  // The actual inbox event must retain the host-chosen message id.
  await request(`/api/session/${c.id}/prompt`,{id:"msg_costnativefixture",text:"Isolated cost admission fixture",delivery:"steer"});
  const costKey=costRunKey(workspaceIdForPath(workspace),c.id,"msg_costnativefixture");
  for(let i=0;i<100&&!await readCostRun(config,costKey);i++)await Bun.sleep(20);
  expect((await readCostRun(config,costKey))?.policy.amount).toBe("1");

  expect((await taskPermissionSettings(config,b.id)).mode).toBe("default");
  const childTask=await request("/api/session",{location:{directory:workspace},parentID:b.id,title:"Child"});
  expect((await ask(childTask.id)).effect).toBe("ask");
  const exported=await request(`/api/experimental/session/${b.id}/export`);
  const imported=await request("/api/experimental/session/import",{info:{...exported.info,id:"ses_testforksource"},messages:[{id:"msg_testforksource",type:"user",text:"Isolated fork fixture",time:{created:Date.now()}}],location:{directory:workspace}});
  const forked=await request(`/api/session/${imported.id}/fork`,{});
  for(let i=0;i<80&&(await taskPermissionSettings(config,forked.id)).mode!=="full_access";i++)await Bun.sleep(50);
  expect((await taskPermissionSettings(config,forked.id)).mode).toBe("full_access");
  events.abort();
 } finally {child.kill("SIGTERM");await bridge.close();await writeFile(join(root,"engine-output.txt"),output);}
},30000);

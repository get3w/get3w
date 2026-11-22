// Explicit independent engine source required; never runs the user's Desktop.
import {test,expect} from "bun:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createAlwaysOnDeferredClient} from "../src/always-on-deferred-client";
const engineRoot=process.env.GET3W_DEFERRED_ENGINE_SOURCE;
const acceptanceBin=process.env.GET3W_DEFERRED_ACCEPTANCE_BIN;
test.skipIf(!engineRoot && !acceptanceBin)("Desktop host client survives isolated engine SIGKILL through authenticated HTTP",async()=>{
 if(!engineRoot && !acceptanceBin)throw Error("Missing explicit engine fixture");
 const directory=await mkdtemp(join(tmpdir(),"get3w-deferred-http-"));
 const token="isolated-e2e-host-secret-32bytes-only";
 const processes:ReturnType<typeof Bun.spawn>[]=[];
 const start=async(mode:string)=>{
  const child=Bun.spawn({cmd:acceptanceBin ? [resolve(acceptanceBin),join(directory,"engine.sqlite"),mode] : [process.execPath,resolve(engineRoot ?? "","packages/core/test/fixture/deferred-question-http.ts"),join(directory,"engine.sqlite"),mode],env:{PATH:process.env.PATH,HOME:directory,TMPDIR:directory,GET3W_ISOLATED_DEFERRED_TOKEN:token},stdout:"pipe",stderr:"pipe"});
  processes.push(child);
  let output="";
  const reader=child.stdout.getReader();
  const deadline=setTimeout(()=>child.kill("SIGKILL"),15000);
  try{
   while(true){const next=await reader.read();if(next.done)throw Error(`Fixture exited: ${await new Response(child.stderr).text()}`);output+=new TextDecoder().decode(next.value);const line=output.split("\n").find(line=>line.startsWith("GET3W_HTTP="));if(line)return {child,client:createAlwaysOnDeferredClient({baseUrl:line.slice("GET3W_HTTP=".length),token})};}
  }finally{clearTimeout(deadline);reader.releaseLock()}
 };
 try{
  let {child,client}=await start("seed");
  const workspaceID="workspace-e2e",sessionID="ses_deferred",callID="call_original";
  expect((await client.list(workspaceID,sessionID)).questions).toHaveLength(1);
  expect((await client.read(workspaceID,sessionID,callID)).question?.status).toBe("waiting");
  await expect(client.read("other",sessionID,callID)).rejects.toThrow("409");
  await client.answer(workspaceID,{sessionID,messageID:"msg_original",callID,requestID:callID,answerID:"answer-http",answers:[["New files"]]});
  expect(await client.commit(workspaceID,sessionID,callID)).toBe(false);
  child.kill("SIGKILL");await child.exited;expect(child.signalCode).toBe("SIGKILL");
  ({child,client}=await start("restart"));
  expect(await client.read(workspaceID,sessionID,callID)).toMatchObject({binding:{paused:true},question:{status:"answered",answerID:"answer-http"}});
  expect(await client.commit(workspaceID,sessionID,callID)).toBe(false);
  await client.setPaused(workspaceID,sessionID,false);
  expect(await client.commit(workspaceID,sessionID,callID)).toBe(true);
  child.kill("SIGKILL");await child.exited;
  ({child,client}=await start("restart"));
  expect(await client.read(workspaceID,sessionID,callID)).toMatchObject({binding:{paused:false},question:{status:"committed"}});
  expect(await client.commit(workspaceID,sessionID,callID)).toBe(false);
  expect((await client.list(workspaceID,sessionID)).questions).toHaveLength(0);
 }finally{
  await Promise.all(processes.map(async child=>{if(child.exitCode===null)child.kill("SIGKILL");await child.exited}));
  await rm(directory,{recursive:true,force:true});
 }
},60000);

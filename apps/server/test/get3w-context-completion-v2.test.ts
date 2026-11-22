import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nativeContext from "../src/opencode-plugins/get3w-context-v2";

test("completion reports rejected paths before transport and exposes host rejection for correction", async () => {
 const directory = await mkdtemp(join(tmpdir(), "completion-plugin-"));
 await mkdir(join(directory, ".get3w/always-on"), {recursive:true});
 await writeFile(join(directory, ".get3w/always-on/state.json"), '{"version":1}');
 type Tool = {name:string; execute(input:unknown, call:{signal:AbortSignal;sessionID:string;messageID:string;id:string}):Promise<unknown>};
 const tools = new Map<string,Tool>();
 let requests = 0;
 const server = Bun.serve({port:0,fetch(){requests++; return Response.json({error:"Invalid deliverable path: use workspace-relative paths"},{status:400});}});
 const stop = await nativeContext.setup({location:{directory},options:{url:`http://127.0.0.1:${server.port}/read`,token:"fixture"},tool:{async transform(callback){callback({add(tool){tools.set(tool.name,tool);}});return {async dispose(){}};}}});
 const input={outcome:"changed",summary:"Candidates saved",artifacts:[join(directory,"candidates.md")],continuity:"Preserve candidates",notification:{action:"quiet"}};
 const call={signal:new AbortController().signal,sessionID:"task",messageID:"assistant",id:"call"};
 try {
  const tool=tools.get("always_on_complete");expect(tool).toBeDefined();
  await expect(tool!.execute(input,call)).rejects.toThrow("workspace-relative");
  expect(requests).toBe(0);
  await expect(tool!.execute({...input,artifacts:["candidates.md"]},call)).rejects.toThrow("Invalid deliverable path");
  expect(requests).toBe(1);
 }finally{await stop();server.stop(true);await rm(directory,{recursive:true,force:true});}
});

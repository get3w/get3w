import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTaskContext } from "../src/opencode-plugins/get3w-task-context-v2";

test("task optimization preserves current tool pairs, ordinary chats and uncheckpointed/mixed history", async () => {
 const directory = await mkdtemp(join(tmpdir(), "task-context-"));
 const root = join(directory, ".get3w", "always-on");
 await mkdir(join(root, "runs"), { recursive: true });
 const state = { sessionId: "task", event: { messageId: "current" } };
 await writeFile(join(root, "state.json"), JSON.stringify(state));
 await writeFile(join(root, "checkpoint.md"), "verified anchors");
 await writeFile(join(root, "runs", "old.json"), JSON.stringify({ sessionId: "task", event: { messageId: "old", phase: "done", createdAt: 0 } }));
 type Event = { sessionID: string; messages: { id: string; role: string; content: unknown }[] };
 let callback: ((event: Event) => Promise<void>) | undefined;
 const dispose = await registerTaskContext({ location: { directory }, session: { async hook(_, handler) { callback = handler; return { async dispose() {} }; } } });
 const original = [ { id: "old", role: "user", content: "past" }, { id: "reply", role: "assistant", content: "past result" }, { id: "current", role: "user", content: "goal plus verified anchors" }, { id: "tool", role: "assistant", content: [{ type: "tool-call", id: "call" }] }, { id: "result", role: "tool", content: [{ type: "tool-result", id: "call" }] } ];
 try {
  const ordinary = { sessionID: "ordinary", messages: structuredClone(original) }; await callback?.(ordinary); expect(ordinary.messages).toEqual(original);
  const mixed = { sessionID: "task", messages: [{ id: "human", role: "user", content: "constraint" }, ...structuredClone(original)] }; await callback?.(mixed); expect(mixed.messages).toHaveLength(6);
  const indexed = { sessionID: "task", messages: structuredClone(original) }; indexed.messages[2]!.content = "goal ALWAYS_ON_MEMORY_INDEX_V1 progress:current"; await callback?.(indexed); expect(indexed.messages).toHaveLength(3);
  const current = { sessionID: "task", messages: structuredClone(original) }; await callback?.(current); expect(current.messages).toEqual(original.slice(2)); expect(original).toHaveLength(5);
  await writeFile(join(root, "checkpoint.md"), "next run anchors");
  const continuation = { sessionID: "task", messages: structuredClone(original) }; await callback?.(continuation); expect(continuation.messages).toEqual(original.slice(2));
  await writeFile(join(root, "state.json"), JSON.stringify({sessionId:"task",event:{messageId:"new"}}));
  const unverified = {sessionID:"task",messages:[...structuredClone(original),{id:"new",role:"user",content:"missing checkpoint"}]}; await callback?.(unverified); expect(unverified.messages).toHaveLength(6);
  await writeFile(join(root, "state.json"), JSON.stringify(state));
  await writeFile(join(root, "runs", "old.json"), JSON.stringify({ sessionId: "task", event: { messageId: "old", phase: "error", createdAt: 0 } }));
  const failed = { sessionID: "task", messages: structuredClone(original) }; await callback?.(failed); expect(failed.messages).toEqual(original);
  await writeFile(join(root, "runs", "old.json"), JSON.stringify({ sessionId: "task", event: { messageId: "old", phase: "done", createdAt: Date.now() } }));
  await utimes(join(root, "checkpoint.md"), 1, 1);
  const stale = { sessionID: "task", messages: structuredClone(original) }; await callback?.(stale); expect(stale.messages).toEqual(original);
  await rm(join(root, "checkpoint.md")); const fallback = { sessionID: "task", messages: structuredClone(original) }; await callback?.(fallback); expect(fallback.messages).toEqual(original);
 } finally { await dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("record repair blocks external tools and unrelated writes while ordinary sessions retain tools", async () => {
 const directory=await mkdtemp(join(tmpdir(),"repair-tools-")); const root=join(directory,".get3w/always-on"); await mkdir(root,{recursive:true});
 const state={sessionId:"task",event:{id:"run",messageId:"msg",repairCount:1,phase:"running"}};
 await writeFile(join(root,"state.json"),JSON.stringify(state));
 const tools=new Map(["read","write","shell","browser_open","get3w_execute"].map(id=>[id,{async execute(_input:unknown,_call:{sessionID:string}){return "executed";}}]));
 const dispose=await registerTaskContext({location:{directory},session:{async hook(){return {async dispose(){}};}},tool:{async transform(callback){callback({list:()=>[...tools.keys()].map(id=>({id})),update(id,update){update(tools.get(id)!);}});return {async dispose(){}};}}});
 try {
  expect(await tools.get("read")!.execute({path:"report.txt"},{sessionID:"task"})).toBe("executed");
  expect(await tools.get("write")!.execute({path:".get3w/always-on/results/run.json"},{sessionID:"task"})).toBe("executed");
  for(const id of ["shell","browser_open","get3w_execute"])await expect(tools.get(id)!.execute({path:"report.txt"},{sessionID:"task"})).rejects.toThrow("Record completion");
  await expect(tools.get("write")!.execute({path:"report.txt"},{sessionID:"task"})).rejects.toThrow("Record completion");
  await expect(tools.get("read")!.execute({path:"../outside"},{sessionID:"task"})).rejects.toThrow("Record completion");
  expect(await tools.get("shell")!.execute({},{sessionID:"ordinary"})).toBe("executed");
 } finally {await dispose();await rm(directory,{recursive:true,force:true});}
});

test("committed run blocks further tools but permits idempotent completion and ordinary chats", async () => {
 const { commitAlwaysOnCompletion } = await import("../src/always-on-completion");
 const directory = await mkdtemp(join(tmpdir(), "committed-tools-"));
 const root = join(directory, ".get3w/always-on"); await mkdir(root, { recursive: true });
 await writeFile(join(root, "state.json"), JSON.stringify({ sessionId: "task", event: { id: "event", messageId: "msg", phase: "running" } }));
 await commitAlwaysOnCompletion(directory, { eventId: "event", sessionId: "task", messageId: "msg" }, { outcome: "no_change", summary: "Checked", artifacts: [], continuity: "Checked", notification: { action: "quiet" } });
 const tools = new Map(["read", "shell", "always_on_complete"].map(id => [id, { async execute(_input: unknown, _call: { sessionID: string }) { return "executed"; } }]));
 const dispose = await registerTaskContext({ location: { directory }, session: { async hook() { return { async dispose() {} }; } }, tool: { async transform(callback) { callback({ list: () => [...tools.keys()].map(id => ({ id })), update(id, update) { update(tools.get(id)!); } }); return { async dispose() {} }; } } });
 try {
  for (const id of ["read", "shell"]) await expect(tools.get(id)!.execute({}, { sessionID: "task" })).rejects.toThrow("already committed");
  expect(await tools.get("always_on_complete")!.execute({}, { sessionID: "task" })).toBe("executed");
  expect(await tools.get("shell")!.execute({}, { sessionID: "ordinary" })).toBe("executed");
 } finally { await dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("indexed runs never restore obsolete memory when checkpoint or receipts are missing", async () => {
 const directory=await mkdtemp(join(tmpdir(),"indexed-history-"));
 const root=join(directory,".get3w/always-on");await mkdir(root,{recursive:true});
 await writeFile(join(root,"state.json"),JSON.stringify({sessionId:"task",event:{messageId:"current"}}));
 type Event={sessionID:string;messages:{id:string;role:string;content:unknown}[]};
 let callback:((event:Event)=>Promise<void>)|undefined;
 const dispose=await registerTaskContext({location:{directory},session:{async hook(_,handler){callback=handler;return {async dispose(){}};}}});
 const messages=[{id:"old",role:"user",content:"DISABLED_PRIVATE_NOTE"},{id:"current",role:"user",content:"goal ALWAYS_ON_MEMORY_INDEX_V1"},{id:"call",role:"assistant",content:"current tool call"},{id:"result",role:"tool",content:"current result"}];
 try {
  for(const checkpoint of [undefined,"corrupt or stale progress"]){
   if(checkpoint)await writeFile(join(root,"checkpoint.md"),checkpoint);
   const task={sessionID:"task",messages:structuredClone(messages)};await callback?.(task);
   expect(task.messages).toEqual(messages.slice(1));expect(JSON.stringify(task)).not.toContain("DISABLED_PRIVATE_NOTE");
   const ordinary={sessionID:"ordinary",messages:structuredClone(messages)};await callback?.(ordinary);expect(ordinary.messages).toEqual(messages);
  }
 }finally{await dispose();await rm(directory,{recursive:true,force:true});}
});

test("runner memory file access uses scoped tool while ordinary file tools remain available",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"memory-tools-"));const root=join(directory,".get3w/always-on/memory");await mkdir(root,{recursive:true});
 await writeFile(join(directory,".get3w/always-on/state.json"),JSON.stringify({sessionId:"task",event:{id:"event",messageId:"current",phase:"running"}}));
 await writeFile(join(root,"notes.json"),"{}");
 const tools=new Map(["read","write","edit"].map(id=>[id,{async execute(_input:unknown,_call:{sessionID:string}){return "executed";}}]));
 const dispose=await registerTaskContext({location:{directory},session:{async hook(){return {async dispose(){}};}},tool:{async transform(callback){callback({list:()=>[...tools.keys()].map(id=>({id})),update(id,update){update(tools.get(id)!);}});return {async dispose(){}};}}});
 try{for(const tool of tools.values()){
  await expect(tool.execute({filePath:join(root,"notes.json")},{sessionID:"task"})).rejects.toThrow("always_on_memory_read");
  expect(await tool.execute({filePath:join(root,"notes.json")},{sessionID:"ordinary"})).toBe("executed");
  expect(await tool.execute({filePath:"report.txt"},{sessionID:"task"})).toBe("executed");
 }}finally{await dispose();await rm(directory,{recursive:true,force:true});}
});

test("runner file tools cannot overwrite host runtime state", async () => {
 const directory = await mkdtemp(join(tmpdir(), "runtime-tools-"));
 const root = join(directory, ".get3w/always-on"); await mkdir(root, { recursive: true });
 await writeFile(join(root, "state.json"), JSON.stringify({sessionId:"task",event:{id:"event",messageId:"current",phase:"running"}}));
 const tools = new Map(["read", "write", "edit"].map(id => [id, {async execute(_input:unknown,_call:{sessionID:string}) {return "executed";}}]));
 const dispose = await registerTaskContext({location:{directory},session:{async hook(){return {async dispose(){}};}},tool:{async transform(callback){callback({list:()=>[...tools.keys()].map(id=>({id})),update(id,update){update(tools.get(id)!);}});return {async dispose(){}};}}});
 try {
  for (const id of ["write", "edit"]) {
   for (const path of [".get3w/always-on/state.json", "./.get3w/always-on/checkpoint.md", join(root,"outbox/new.json")]) {
    await expect(tools.get(id)!.execute({filePath:path},{sessionID:"task"})).rejects.toThrow("host-owned");
   }
   expect(await tools.get(id)!.execute({path:"candidates.json"},{sessionID:"task"})).toBe("executed");
   expect(await tools.get(id)!.execute({path:".get3w/always-on/state.json"},{sessionID:"ordinary"})).toBe("executed");
  }
  expect(await tools.get("read")!.execute({path:".get3w/always-on/state.json"},{sessionID:"task"})).toBe("executed");
 } finally {await dispose(); await rm(directory,{recursive:true,force:true});}
});

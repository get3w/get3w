import { test, expect } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAlwaysOnSuggestions, alwaysOnMemoryPrompt, mutateAlwaysOnMemory, readAlwaysOnMemory } from "../src/always-on-memory";
import type { WorkspaceInfo } from "../src/types";
async function fixture(run: (workspace: WorkspaceInfo) => Promise<void>) {
 const path=await mkdtemp(join(tmpdir(),"memory-test-"));
 try { await run({id:"fixture",name:"Fixture",path,preset:"starter",workspaceType:"always-on"}); }
 finally { await rm(path,{recursive:true,force:true}); }
}
test("user notes persist, disable/delete change future snapshots, settings and locks round trip",()=>fixture(async w=>{
 expect((await readAlwaysOnMemory(w)).revision).toBe(0);
 let state=await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:" 保留来源 "});
 const id=state.notes[0]!.id;expect(state.notes[0]!.locked).toBe(true);expect(state.notes[0]!.text).toBe("保留来源");
 expect((await readAlwaysOnMemory(w)).notes).toEqual(state.notes);
 expect(await alwaysOnMemoryPrompt(w)).toContain("保留来源");
 state=await mutateAlwaysOnMemory(w,{action:"disable",revision:state.revision,id});expect(await alwaysOnMemoryPrompt(w)).not.toContain("保留来源");
 state=await mutateAlwaysOnMemory(w,{action:"enable",revision:state.revision,id});
 state=await mutateAlwaysOnMemory(w,{action:"unlock",revision:state.revision,id});expect(state.notes[0]!.locked).toBe(false);
 state=await mutateAlwaysOnMemory(w,{action:"save",revision:state.revision,id,text:"简洁中文"});expect(state.notes[0]!.locked).toBe(true);
 state=await mutateAlwaysOnMemory(w,{action:"settings",revision:state.revision,useNotes:false});expect(await alwaysOnMemoryPrompt(w)).not.toContain("简洁中文");
 state=await mutateAlwaysOnMemory(w,{action:"settings",revision:state.revision,useNotes:true});expect(await alwaysOnMemoryPrompt(w)).toContain("简洁中文");
 await writeFile(join(w.path,".get3w/always-on/checkpoint.md"),"preserve progress and dedupe");
 await mutateAlwaysOnMemory(w,{action:"delete",revision:state.revision,id});expect((await readAlwaysOnMemory(w)).notes).toHaveLength(0);
 expect(await readFile(join(w.path,".get3w/always-on/checkpoint.md"),"utf8")).toBe("preserve progress and dedupe");
}));
test("conflicting mutations cannot silently overwrite, invalid content is rejected",()=>fixture(async w=>{
 const results=await Promise.allSettled([mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"one"}),mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"two"})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((await readAlwaysOnMemory(w)).notes).toHaveLength(1);
 await expect(mutateAlwaysOnMemory(w,{action:"save",revision:1,text:" "})).rejects.toMatchObject({code:"memory_invalid"});
 await expect(mutateAlwaysOnMemory(w,{action:"save",revision:1,text:"a".repeat(2001)})).rejects.toMatchObject({code:"memory_invalid"});
}));
test("local workspaces, corrupted and symlinked files fail closed",()=>fixture(async w=>{
 await expect(readAlwaysOnMemory({...w,workspaceType:"local"})).rejects.toMatchObject({status:404});
 await mkdir(join(w.path,".get3w/always-on/memory"),{recursive:true});const path=join(w.path,".get3w/always-on/memory/notes.json");
 await writeFile(path,"broken");await expect(readAlwaysOnMemory(w)).rejects.toMatchObject({code:"memory_unreadable"});
 await rm(path);await writeFile(join(w.path,"private.json"),"private");await symlink(join(w.path,"private.json"),path);
 await expect(readAlwaysOnMemory(w)).rejects.toMatchObject({code:"memory_unreadable"});
 expect(await readFile(join(w.path,"private.json"),"utf8")).toBe("private");
}));

async function propose(w: WorkspaceInfo,id:string,text:string[]){
 await mkdir(join(w.path,".get3w/always-on/results"),{recursive:true});
 await writeFile(join(w.path,`.get3w/always-on/results/${id}.json`),JSON.stringify({eventId:id,memorySuggestions:text}));
 await collectAlwaysOnSuggestions(w,{id,sessionId:"ses_source",messageId:"msg_source",startedAt:0});
}
test("proposals remain inactive until reviewed, rejection and deletion block repeats",()=>fixture(async w=>{
 let memory=await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"locked original"});
 await propose(w,"one",["new preference","locked original","new preference"]);
 memory=await readAlwaysOnMemory(w);expect(memory.suggestions).toHaveLength(1);expect(memory.notes[0]!.text).toBe("locked original");
 expect(await alwaysOnMemoryPrompt(w)).not.toContain('"new preference"');
 const item=memory.suggestions![0]!;expect(item.sessionId).toBe("ses_source");
 memory=await mutateAlwaysOnMemory(w,{action:"accept",id:item.id,text:"corrected preference",revision:memory.revision});
 expect(memory.notes[0]!.text).toBe("corrected preference");expect(memory.notes[0]!.locked).toBe(true);expect(await alwaysOnMemoryPrompt(w)).toContain("corrected preference");
 await propose(w,"two",["reject me"]);memory=await readAlwaysOnMemory(w);
 memory=await mutateAlwaysOnMemory(w,{action:"reject",id:memory.suggestions![0]!.id,revision:memory.revision});
 await propose(w,"three",["reject me"]);expect((await readAlwaysOnMemory(w)).suggestions).toHaveLength(0);
 memory=await readAlwaysOnMemory(w);memory=await mutateAlwaysOnMemory(w,{action:"delete",id:memory.notes[0]!.id,revision:memory.revision});
 await propose(w,"four",["corrected preference"]);expect((await readAlwaysOnMemory(w)).suggestions).toHaveLength(0);
 memory=await readAlwaysOnMemory(w);await mutateAlwaysOnMemory(w,{action:"settings",extract:false,revision:memory.revision});
 await propose(w,"five",["disabled extraction"]);expect((await readAlwaysOnMemory(w)).suggestions).toHaveLength(0);expect(await alwaysOnMemoryPrompt(w)).toContain("extraction is disabled");
}));
test("collection is idempotent and malformed proposal files do not change saved notes",()=>fixture(async w=>{
 await propose(w,"one",["one"]);let memory=await readAlwaysOnMemory(w);const revision=memory.revision;
 await propose(w,"one",["two"]);memory=await readAlwaysOnMemory(w);expect(memory.revision).toBe(revision);expect(memory.suggestions).toHaveLength(1);
 await propose(w,"bad",["x".repeat(2001)]);expect((await readAlwaysOnMemory(w)).revision).toBe(revision);
}));
test("history, usage snapshots and unblocking survive reload without restoring deleted memory",()=>fixture(async w=>{
 const {prepareAlwaysOnMemory,recordAlwaysOnMemoryUsage}=await import("../src/always-on-memory");
 let state=await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"first"});const id=state.notes[0]!.id;
 const snapshot=await prepareAlwaysOnMemory(w);
 state=await mutateAlwaysOnMemory(w,{action:"save",id,revision:state.revision,text:"edited"});
 await recordAlwaysOnMemoryUsage(w,snapshot,{eventId:"event",sessionId:"session",messageId:"message"});
 state=await readAlwaysOnMemory(w);expect(state.usage![0]!.notes[0]!.text).toBe("first");expect(state.history![0]!.before).toBe("first");expect(state.history![0]!.after).toBe("edited");
 state=await mutateAlwaysOnMemory(w,{action:"delete",id,revision:state.revision});expect(state.blockedEntries![0]!.text).toBe("edited");
 await propose(w,"blocked",["edited"]);state=await readAlwaysOnMemory(w);expect(state.suggestions).toHaveLength(0);
 state=await mutateAlwaysOnMemory(w,{action:"unblock",hash:state.blocked![0]!,revision:state.revision});expect(state.notes).toHaveLength(0);
 await propose(w,"new",["edited"]);state=await readAlwaysOnMemory(w);expect(state.suggestions).toHaveLength(1);
 const stored=JSON.parse(await readFile(join(w.path,".get3w/always-on/memory/notes.json"),"utf8"));expect(stored.usage[0].notes[0].text).toBe("first");expect(stored.blocked).toHaveLength(0);
}));
test("a fresh process reads accepted edits, rejection, deletion and audit after restart",()=>fixture(async w=>{
 await propose(w,"review",["edit candidate","reject candidate"]);let state=await readAlwaysOnMemory(w);
 state=await mutateAlwaysOnMemory(w,{action:"accept",revision:state.revision,id:state.suggestions![0]!.id,text:"edited accepted"});
 state=await mutateAlwaysOnMemory(w,{action:"reject",revision:state.revision,id:state.suggestions![0]!.id});
 state=await mutateAlwaysOnMemory(w,{action:"delete",revision:state.revision,id:state.notes[0]!.id});
 const source=new URL("../src/always-on-memory.ts",import.meta.url).pathname;
 const child=Bun.spawn([process.execPath,"--eval",`const {readAlwaysOnMemory}=await import(${JSON.stringify(source)});console.log(JSON.stringify(await readAlwaysOnMemory(${JSON.stringify(w)})));`],{stdout:"pipe",stderr:"pipe"});
 expect(await child.exited).toBe(0);const restarted=JSON.parse(await new Response(child.stdout).text());
 expect(restarted.notes).toHaveLength(0);expect(restarted.suggestions).toHaveLength(0);expect(restarted.blocked).toHaveLength(2);expect(restarted.history.map((item:{action:string})=>item.action)).toEqual(["delete","reject","accept"]);
}));
test("completed chat reports persist, deduplicate and provide bounded prompt excerpts",()=>fixture(async w=>{
 const {recordAlwaysOnReported}=await import("../src/always-on-memory");
 await recordAlwaysOnReported(w,{eventId:"e",sessionId:"s",messageId:"m",text:"report".repeat(500),completedAt:1});
 await recordAlwaysOnReported(w,{eventId:"e",sessionId:"s",messageId:"m",text:"duplicate",completedAt:2});
 let state=await readAlwaysOnMemory(w);expect(state.reported).toHaveLength(1);expect(state.reported![0]!.text).toHaveLength(2000);expect(state.reported![0]!.truncated).toBe(true);
 for(let n=0;n<23;n++)await recordAlwaysOnReported(w,{eventId:`e${n}`,sessionId:"s",messageId:`m${n}`,text:`unique report ${n}`,completedAt:n+10});
 state=await readAlwaysOnMemory(w);expect(state.reported).toHaveLength(20);
 const prompt=await alwaysOnMemoryPrompt(w);expect(prompt).toContain("unique report 22");expect(prompt).not.toContain("unique report 16");expect(prompt).toContain("NOT delivered to the user or read");
}));
test("clear removes stored text, preserves continuity and fences older in-flight runs",()=>fixture(async w=>{
 const {prepareAlwaysOnMemory,recordAlwaysOnMemoryUsage,recordAlwaysOnReported}=await import("../src/always-on-memory");
 let state=await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"private preference"});
 await propose(w,"candidate",["pending private"]);
 const old=await prepareAlwaysOnMemory(w);
 await recordAlwaysOnMemoryUsage(w,old,{eventId:"e",sessionId:"s",messageId:"m"});
 await recordAlwaysOnReported(w,{eventId:"e",sessionId:"s",messageId:"m",text:"private reply",completedAt:1});
 const checkpoint=join(w.path,".get3w/always-on/checkpoint.md");await writeFile(checkpoint,"continue here");
 state=await readAlwaysOnMemory(w);
 await expect(mutateAlwaysOnMemory(w,{action:"clear",revision:state.revision-1})).rejects.toMatchObject({code:"memory_conflict"});
 state=await mutateAlwaysOnMemory(w,{action:"clear",revision:state.revision});
 expect(state.notes).toEqual([]);expect(state.suggestions).toEqual([]);expect(state.usage).toEqual([]);expect(state.reported).toEqual([]);
 expect(state.history?.map(h=>h.action)).toEqual(["clear"]);expect(state.useNotes).toBe(true);expect(state.extract).toBe(true);
 expect(await readFile(checkpoint,"utf8")).toBe("continue here");
 expect(await readFile(join(w.path,".get3w/always-on/memory/notes.json"),"utf8")).not.toContain("private");
 await recordAlwaysOnMemoryUsage(w,old,{eventId:"late",sessionId:"s",messageId:"late"});
 await recordAlwaysOnReported(w,{eventId:"late",sessionId:"s",messageId:"late",text:"old reply",completedAt:Date.now(),startedAt:0});
 await propose(w,"late",["old new suggestion"]);
 state=await readAlwaysOnMemory(w);expect(state.usage).toEqual([]);expect(state.reported).toEqual([]);expect(state.suggestions).toEqual([]);
 const startedAt=state.clearedAt!+1;
 await mkdir(join(w.path,".get3w/always-on/results"),{recursive:true});
 const path=join(w.path,".get3w/always-on/results/new.json");
 await writeFile(path,JSON.stringify({eventId:"new",memorySuggestions:["private preference","pending private","fresh preference"]}));
 const {utimes}=await import("node:fs/promises");await utimes(path,new Date(startedAt+100),new Date(startedAt+100));
 await collectAlwaysOnSuggestions(w,{id:"new",sessionId:"s",messageId:"new",startedAt});
 expect((await readAlwaysOnMemory(w)).suggestions?.map(s=>s.text)).toEqual(["fresh preference"]);
 await recordAlwaysOnMemoryUsage(w,await prepareAlwaysOnMemory(w),{eventId:"new",sessionId:"s",messageId:"new"});
 await recordAlwaysOnReported(w,{eventId:"new",sessionId:"s",messageId:"new",text:"fresh reply",completedAt:startedAt+100,startedAt});
 state=await readAlwaysOnMemory(w);expect(state.usage).toHaveLength(1);expect(state.reported).toHaveLength(1);
}));

test("index excludes bodies and reads enforce current controls with reference anchors",()=>fixture(async w=>{
 const {prepareAlwaysOnMemory,readAlwaysOnMemoryEntries}=await import("../src/always-on-memory");
 let state=await mutateAlwaysOnMemory(w,{action:"save",revision:0,title:"Deployment preference",text:"PRIVATE_BODY_SENTINEL\nUse staged rollout",sourceUrl:"https://example.com/issues/42",observedAt:"2026-11-21T10:00:00Z"});
 const id=state.notes[0]!.id;const run={eventId:"event",sessionId:"session",messageId:"message"};
 await writeFile(join(w.path,".get3w/always-on/checkpoint.md"),"PRIVATE_PROGRESS_SENTINEL\nNext verify rollout");
 const snapshot=await prepareAlwaysOnMemory(w);
 expect(snapshot.prompt).toContain("Deployment preference");expect(snapshot.prompt).toContain("progress:current");
 expect(snapshot.prompt).not.toContain("PRIVATE_BODY_SENTINEL");expect(snapshot.prompt).not.toContain("PRIVATE_PROGRESS_SENTINEL");
 const loaded=await readAlwaysOnMemoryEntries(w,{ids:[id,"progress:current"]},run);
 expect(loaded.entries[0]?.text).toContain("PRIVATE_BODY_SENTINEL");expect(loaded.entries[0]?.sourceUrl).toBe("https://example.com/issues/42");expect(loaded.entries[1]?.text).toContain("PRIVATE_PROGRESS_SENTINEL");
 expect((await readAlwaysOnMemory(w)).usage?.[0]?.kind).toBe("read");
 state=await mutateAlwaysOnMemory(w,{action:"disable",revision:state.revision,id});
 await expect(readAlwaysOnMemoryEntries(w,{ids:[id]},run)).rejects.toMatchObject({code:"memory_missing"});
 expect((await prepareAlwaysOnMemory(w)).prompt).not.toContain(id);
 state=await mutateAlwaysOnMemory(w,{action:"enable",revision:state.revision,id});
 state=await mutateAlwaysOnMemory(w,{action:"settings",revision:state.revision,useNotes:false});
 await expect(readAlwaysOnMemoryEntries(w,{ids:[id]},run)).rejects.toThrow();
 await expect(readAlwaysOnMemoryEntries(w,{ids:["../notes.json"]},run)).rejects.toThrow();
 await expect(mutateAlwaysOnMemory(w,{action:"save",revision:state.revision,text:"bad",sourceUrl:"javascript:alert(1)"})).rejects.toThrow();
}));

test("generated, submitted and acknowledged remain separate durable facts",()=>fixture(async w=>{
 const {prepareAlwaysOnMemory,recordAlwaysOnReported,markAlwaysOnReplyViewed}=await import("../src/always-on-memory");
 const {enqueueAlwaysOnDelivery,changeAlwaysOnOutbox}=await import("../src/always-on-outbox");
 await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"preferences"});
 await writeFile(join(w.path,".get3w/always-on/state.json"),JSON.stringify({paused:false}));
 await recordAlwaysOnReported(w,{eventId:"event",sessionId:"session",messageId:"reply",text:"Generated title\nPRIVATE_REPLY_BODY",completedAt:100});
 let prompt=(await prepareAlwaysOnMemory(w)).prompt;expect(prompt).toContain('"generatedAt":100');expect(prompt).toContain('"notificationStatus":"none"');expect(prompt).toContain('"userViewedAt":null');expect(prompt).not.toContain("PRIVATE_REPLY_BODY");
 await enqueueAlwaysOnDelivery(w,{id:"event",title:"Result",text:"Notification",sessionId:"session",messageId:"reply"});
 const claim=await changeAlwaysOnOutbox(w,{action:"claim"});expect(claim?.claim).toBeDefined();
 await changeAlwaysOnOutbox(w,{action:"finish",id:"event",claim:claim!.claim,result:"submitted"});
 prompt=(await prepareAlwaysOnMemory(w)).prompt;expect(prompt).toContain('"notificationStatus":"submitted"');expect(prompt).toContain('"notificationSubmittedAt":');expect(prompt).toContain('"userViewedAt":null');
 const acknowledged=await markAlwaysOnReplyViewed(w,"event");expect(acknowledged.reported?.[0]?.viewedAt).toBeGreaterThan(0);
 const first=acknowledged.reported?.[0]?.viewedAt;await markAlwaysOnReplyViewed(w,"event");expect((await readAlwaysOnMemory(w)).reported?.[0]?.viewedAt).toBe(first);
 expect((await prepareAlwaysOnMemory(w)).prompt).not.toContain('"userViewedAt":null');
}));

test("large progress reads return complete content with bounded audit and deleted notes stay unavailable",()=>fixture(async w=>{
 const {readAlwaysOnMemoryEntries}=await import("../src/always-on-memory");
 let memory=await mutateAlwaysOnMemory(w,{action:"save",revision:0,text:"private",title:"Preference"});
 const id=memory.notes[0]!.id;const run={eventId:"e",sessionId:"s",messageId:"m"};
 const progress='"\\'.repeat(45000);
 await writeFile(join(w.path,".get3w/always-on/checkpoint.md"),progress);
 const loaded=await readAlwaysOnMemoryEntries(w,{ids:["progress:current"]},run);
 expect(loaded.entries[0]?.text).toBe(progress);
 memory=await readAlwaysOnMemory(w);expect(memory.usage?.[0]?.notes[0]?.text.length).toBeLessThan(12200);
 expect(memory.usage?.[0]?.notes[0]?.text).toContain("SHA-256");
 memory=await mutateAlwaysOnMemory(w,{action:"delete",revision:memory.revision,id});
 await expect(readAlwaysOnMemoryEntries(w,{ids:[id]},run)).rejects.toMatchObject({code:"memory_missing"});
 memory=await mutateAlwaysOnMemory(w,{action:"clear",revision:memory.revision});
 await expect(readAlwaysOnMemoryEntries(w,{ids:[id]},run)).rejects.toMatchObject({code:"memory_missing"});
 expect((await readAlwaysOnMemoryEntries(w,{ids:["progress:current"]},run)).entries[0]?.text).toBe(progress);
}));

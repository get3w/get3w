import { test, expect, spyOn } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceInfo } from "../src/types";
import { enqueueAlwaysOnDelivery, readAlwaysOnOutbox, changeAlwaysOnOutbox } from "../src/always-on-outbox";
async function fixture(run: (w: WorkspaceInfo) => Promise<void>) {
    const path = await mkdtemp(join(tmpdir(), "outbox-test-"));
    const w: WorkspaceInfo = { id: "fixture", name: "Fixture", path, preset: "starter", workspaceType: "always-on" };
    try {
        await mkdir(join(path, ".get3w/always-on"), { recursive: true });
        await writeFile(join(path, ".get3w/always-on/state.json"), JSON.stringify({ paused: false }));
        await run(w);
    }
    finally {
        await rm(path, { recursive: true, force: true });
    }
}
const input = { id: "event", title: "Fixture", text: "Result available", sessionId: "session", messageId: "message" };
test("edition identity deduplicates revisions while retaining the original result link", () => fixture(async w => {
    await enqueueAlwaysOnDelivery(w,{...input,id:"edition",resultId:"run-1"});
    await enqueueAlwaysOnDelivery(w,{...input,id:"edition",resultId:"run-2",text:"Revised"});
    const items=await readAlwaysOnOutbox(w);
    expect(items).toHaveLength(1);expect(items[0]?.resultId).toBe("run-1");expect(items[0]?.text).toBe(input.text);
}));
test("expired pending deliveries are cancelled without scenario settings", () => fixture(async w => {
    await enqueueAlwaysOnDelivery(w,{...input,id:"old",expiresAt:Date.now()-1000});
    await enqueueAlwaysOnDelivery(w,{...input,id:"current",expiresAt:Date.now()+3600000});
    expect((await changeAlwaysOnOutbox(w,{action:"claim"}))?.id).toBe("current");
    expect((await readAlwaysOnOutbox(w)).find(item=>item.id==="old")?.status).toBe("cancelled");
}));
test("expiry never retries or rewrites an uncertain delivery", () => fixture(async w => {
    await enqueueAlwaysOnDelivery(w,{...input,expiresAt:Date.now()+3600000});
    await changeAlwaysOnOutbox(w,{action:"claim"});
    const path=join(w.path,".get3w/always-on/outbox/messages.json");
    const state=JSON.parse(await readFile(path,"utf8"));
    state.items[0].lastAttemptAt=Date.now()-120000;state.items[0].expiresAt=Date.now()-1000;
    await writeFile(path,JSON.stringify(state));
    expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
    expect((await readAlwaysOnOutbox(w))[0]?.status).toBe("unconfirmed");
}));
test("persistent idempotency, single claim, token protection, explicit retry and cancel", () => fixture(async (w) => {
    await Promise.all([enqueueAlwaysOnDelivery(w, input), enqueueAlwaysOnDelivery(w, input)]);
    expect(await readAlwaysOnOutbox(w)).toHaveLength(1);
    const claims = await Promise.all([changeAlwaysOnOutbox(w, { action: "claim" }), changeAlwaysOnOutbox(w, { action: "claim" })]);
    const claim = claims.find(Boolean);
    expect(claim?.claim).toBeTruthy();
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(Reflect.has((await readAlwaysOnOutbox(w))[0]!, "claim")).toBe(false);
    await expect(changeAlwaysOnOutbox(w, { action: "finish", id: "event", claim: "wrong", result: "submitted" })).rejects.toThrow();
    await changeAlwaysOnOutbox(w, { action: "finish", id: "event", claim: claim?.claim, result: "failed" });
    await changeAlwaysOnOutbox(w, { action: "retry", id: "event" });
    const next = await changeAlwaysOnOutbox(w, { action: "claim" });
    expect(next?.attempts).toBe(2);
    await changeAlwaysOnOutbox(w, { action: "finish", id: "event", claim: next?.claim, result: "blocked" });
    await changeAlwaysOnOutbox(w, { action: "cancel", id: "event" });
    await enqueueAlwaysOnDelivery(w, input);
    expect((await readAlwaysOnOutbox(w))[0]?.status).toBe("cancelled");
}));
test("pause blocks new claims; expired uncertain submissions never auto retry", () => fixture(async (w) => {
    await enqueueAlwaysOnDelivery(w, input);
    await writeFile(join(w.path, ".get3w/always-on/state.json"), JSON.stringify({ paused: true }));
    expect(await changeAlwaysOnOutbox(w, { action: "claim" })).toBeNull();
    await writeFile(join(w.path, ".get3w/always-on/state.json"), JSON.stringify({ paused: false }));
    await changeAlwaysOnOutbox(w, { action: "claim" });
    const path = join(w.path, ".get3w/always-on/outbox/messages.json");
    const data = JSON.parse(await readFile(path, "utf8"));
    data.items[0].lastAttemptAt = 1;
    await writeFile(path, JSON.stringify(data));
    expect((await readAlwaysOnOutbox(w))[0]?.status).toBe("unconfirmed");
    expect(await changeAlwaysOnOutbox(w, { action: "claim" })).toBeNull();
    await expect(changeAlwaysOnOutbox(w, { action: "retry", id: "event" })).rejects.toThrow();
    await changeAlwaysOnOutbox(w, { action: "resolve_sent", id: "event" });
    expect((await readAlwaysOnOutbox(w))[0]?.status).toBe("submitted");
}));
test("ordinary workspaces and unsafe outbox paths reject writes", () => fixture(async (w) => {
    await expect(enqueueAlwaysOnDelivery({ ...w, workspaceType: "local" }, input)).rejects.toThrow();
    await symlink(tmpdir(), join(w.path, ".get3w/always-on/outbox"));
    await expect(enqueueAlwaysOnDelivery(w, input)).rejects.toThrow();
}));

test("uncertain delivery survives a fresh process and explicit resolution never reexecutes a task",()=>fixture(async w=>{
 await enqueueAlwaysOnDelivery(w,input);const claim=await changeAlwaysOnOutbox(w,{action:"claim"});expect(claim?.attempts).toBe(1);
 const path=join(w.path,".get3w/always-on/outbox/messages.json");const data=JSON.parse(await readFile(path,"utf8"));data.items[0].lastAttemptAt=1;await writeFile(path,JSON.stringify(data));
 const child=Bun.spawn([process.execPath,"--eval",`const {readAlwaysOnOutbox,changeAlwaysOnOutbox}=await import(${JSON.stringify(new URL("../src/always-on-outbox.ts",import.meta.url).pathname)});const w=${JSON.stringify(w)};console.log(JSON.stringify({items:await readAlwaysOnOutbox(w),claim:await changeAlwaysOnOutbox(w,{action:"claim"})}));`],{stdout:"pipe",stderr:"pipe"});
 expect(await child.exited).toBe(0);const restored=JSON.parse(await new Response(child.stdout).text());expect(restored.items[0]).toMatchObject({id:"event",status:"unconfirmed",attempts:1});expect(restored.claim).toBeNull();
 await expect(changeAlwaysOnOutbox(w,{action:"retry",id:"event"})).rejects.toThrow();
 await changeAlwaysOnOutbox(w,{action:"resolve_sent",id:"event"});expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
 expect((await readAlwaysOnOutbox(w))[0]).toMatchObject({status:"submitted",attempts:1});
 expect(await readFile(join(w.path,".get3w/always-on/state.json"),"utf8")).toBe(JSON.stringify({paused:false}));
}));

test("prepared delivery waits for its exact time, survives reads and never bypasses expiry",()=>fixture(async w=>{
 let now=Date.now();const clock=spyOn(Date,"now").mockImplementation(()=>now);
 try{
  const due=now+60000;
  await enqueueAlwaysOnDelivery(w,{...input,id:"prepared",notBefore:due,expiresAt:due+60000});
  expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
  now=due-1;expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
  expect((await readAlwaysOnOutbox(w))[0]?.attempts).toBe(0);
  now=due;const claim=await changeAlwaysOnOutbox(w,{action:"claim"});expect(claim?.id).toBe("prepared");
  expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
  await changeAlwaysOnOutbox(w,{action:"finish",id:"prepared",claim:claim?.claim,result:"submitted"});
  await enqueueAlwaysOnDelivery(w,{...input,id:"expired",notBefore:due+10000,expiresAt:due+20000});
  now=due+20000;expect(await changeAlwaysOnOutbox(w,{action:"claim"})).toBeNull();
  expect((await readAlwaysOnOutbox(w)).find(item=>item.id==="expired")?.status).toBe("cancelled");
 }finally{clock.mockRestore();}
}));

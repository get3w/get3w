import { readAlwaysOnOutbox } from "../src/always-on-outbox";
import { mutateAlwaysOnMemory } from "../src/always-on-memory";
import { test, expect } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAlwaysOnOverview, createAlwaysOnWorkspace, createAlwaysOnRunner, initializeAlwaysOnTaskSettings, alwaysOnSettingsSchema } from "../src/always-on";
import { taskPermissionSettings, initializeTaskPermissionMode } from "../src/task-permission-modes";
import { taskCostSettings, initializeTaskCostSettings } from "../src/task-cost-settings";
import { buildWorkspaceInfos } from "../src/workspaces";
import type { ServerConfig, WorkspaceInfo } from "../src/types";
import type { AlwaysOnSettings } from "@get3w/types/workspace";
import type { HeadlessThreadClient, HeadlessThreadSnapshot, HeadlessThreadPending } from "@get3w/headless-threads";
const settings: AlwaysOnSettings = { goal: "Check a local fixture", criteria: "Save a report", behavior: "No external actions", fullAccess: false, costAuto: false, costLimit: "7.00", intervalMinutes: 1 };
async function fixture(run: (config: ServerConfig, workspace: WorkspaceInfo, root: string) => Promise<void>) {
 const root = await mkdtemp(join(tmpdir(), "always-on-"));
 const workspace: WorkspaceInfo = { id: "ws_test", name: "Fixture", path: join(root, "workspace"), preset: "starter", workspaceType: "always-on" };
 await mkdir(workspace.path);
 const config: ServerConfig = {host:"127.0.0.1",port:0,token:"t",hostToken:"h",configPath:join(root,"state","config.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[workspace],authorizedRoots:[workspace.path],readOnly:false,startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
 try { await run(config, workspace, root); } finally { await rm(root, { recursive: true, force: true }); }
}
function native(workspace?: WorkspaceInfo) {
 let snapshot: HeadlessThreadSnapshot = { threadId: "ses_fixture", title: "Fixture", directory: null, status: { type: "idle" }, messages: [], todos: [] };
 let pending: HeadlessThreadPending | null = null;
 let creates = 0, sends = 0, uncertain = false;
 const client: HeadlessThreadClient = {
  async createThread() { creates++; return {id:"ses_fixture",workspaceId:"ws_test",title:"Fixture",directory:null,createdAt:0,started:false,engine:"v2"}; },
  async sendTurn(id, input) {
   sends++;
   snapshot.messages.push({ id: input.messageId!, role: "user", parentId: null, createdAt: 0, error: null, usage: null, parts: [{ id: "part", type: "text", text: input.prompt }] });
   snapshot.status = { type: "busy" };
   if (uncertain) throw Error("Lost submission response");
   return {threadId:id,messageId:input.messageId??null,acceptedAt:0,messageCountBefore:0,alreadyPresent:false};
  },
  async getThreadSnapshot() { return structuredClone(snapshot); },
  async getThreadPending() { return pending; },
  async getThreadWaitingFor() { return pending?.kind ?? null; },
  async answerThread() {},
  async abortThread() { return {threadId:"ses_fixture",accepted:true,observedIdle:false}; },
  async waitForThread() { throw Error("not used"); }, async waitUntilIdle() { throw Error("not used"); }, async exportTranscript() { throw Error("not used"); },
 };
 return { client, prompts: () => snapshot.messages.filter(message=>message.role==="user").flatMap(message=>message.parts.filter(part=>part.type==="text").map(part=>part.text)), counts: () => ({ creates, sends }), idleWithoutResult: () => { snapshot.status = { type: "idle" }; }, pending: (value: HeadlessThreadPending | null) => { pending = value; }, uncertain: () => { uncertain = true; }, async complete(evidence = true, notification?: {action:"send"|"quiet";text?:string;notBefore?:number;expiresAt?:number;dedupeKey?:string}) {
  const user = snapshot.messages.filter(message => message.role === "user").at(-1)!;
  snapshot.messages.push({id:`assistant_${sends}`,role:"assistant",parentId:user.id,createdAt:0,completedAt:1,error:null,usage:null,parts:[{id:"answer",type:"text",text:"Completed fixture"}]});
  snapshot.status = { type: "idle" };
  if (workspace && evidence) {
    const state = JSON.parse(await readFile(join(workspace.path,".get3w/always-on/state.json"),"utf8"));
    await mkdir(join(workspace.path,".get3w/always-on/results"),{recursive:true});
    await writeFile(join(workspace.path,`.get3w/always-on/results/${state.event.id}.json`),JSON.stringify({eventId:state.event.id,outcome:"no_change",summary:"Checked fixture, no changes",artifacts:[],notification}));
    await writeFile(join(workspace.path,".get3w/always-on/checkpoint.md"),`Verified fixture ${state.event.id}`);
    // Tests advance the scheduler clock; evidence must use that run's clock too.
    const savedAt = new Date(Math.max(Date.now(), state.event.startedAt ?? 0) + 1);
    await utimes(join(workspace.path,`.get3w/always-on/results/${state.event.id}.json`),savedAt,savedAt);
    await utimes(join(workspace.path,".get3w/always-on/checkpoint.md"),savedAt,savedAt);
  }
 } };
}
test("creation, serial dispatch, pending approval, pause/resume, timer and workspace-local results", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now = Date.now();
 const runner = createAlwaysOnRunner(config, {client:()=>engine.client,now:()=>now});
 try {
  await Promise.all([runner.tick(),runner.tick(),runner.tick()]);
  expect(engine.counts()).toEqual({creates:1,sends:1});
  engine.pending({kind:"permission",requestId:"p",title:"Allow file",detail:"fixture"});
  await runner.tick(); expect((await runner.status(workspace)).phase).toBe("waiting");
  await runner.control(workspace,"pause"); engine.pending(null); await engine.complete(); await runner.tick();
  expect((await runner.status(workspace)).phase).toBe("idle");
  now += 61000; await runner.tick(); expect(engine.counts().sends).toBe(1);
  await runner.control(workspace,"resume"); await runner.tick(); expect(engine.counts()).toEqual({creates:1,sends:2});
  expect(await readdir(join(workspace.path,".get3w","always-on","runs"))).toHaveLength(1);
  expect((await taskCostSettings(config,"ses_fixture")).policy.enabled).toBe(false);
 } finally { await runner.stop(); }
}));
test("native tools must be prepared before a background turn is submitted", () => fixture(async(config,workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);let ready=false;let attempts=0;
 const previous=globalThis.__get3wPrepareTaskTools;
 globalThis.__get3wPrepareTaskTools=async(workspaceId,sessionId)=>{
  expect(workspaceId).toBe(workspace.id);expect(sessionId).toBe("ses_fixture");
  expect(engine.counts().sends).toBe(0);attempts++;
  if(!ready)throw Error("Native tools unavailable");
 };
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  await runner.tick();expect(engine.counts()).toEqual({creates:1,sends:0});
  ready=true;await runner.tick();expect(engine.counts()).toEqual({creates:1,sends:1});
  expect(attempts).toBe(2);
 }finally{globalThis.__get3wPrepareTaskTools=previous;await runner.stop();}
}));
test("restart observes existing run, uncertain sends never replay, user explicitly retries", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine=native(workspace); engine.uncertain();
 const first=createAlwaysOnRunner(config,{client:()=>engine.client});
 await first.tick(); expect((await first.status(workspace)).phase).toBe("interrupted"); await first.stop();
 const second=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  await second.tick(); await second.tick(); expect(engine.counts().sends).toBe(1);
  await expect(second.control(workspace,"run")).rejects.toThrow("请先处理");
  await engine.complete(); await second.control(workspace,"run"); await second.tick();
  expect(engine.counts()).toEqual({creates:1,sends:2});
 } finally { await second.stop(); }
}));
test("ordinary workspaces never run and always-on authorization never changes ordinary defaults", () => fixture(async(config, workspace, root) => {
 await createAlwaysOnWorkspace(config,workspace,{...settings,fullAccess:true,costAuto:true});
 await initializeAlwaysOnTaskSettings(config,workspace,"always_session");
 await initializeTaskPermissionMode(config,"ordinary_session"); await initializeTaskCostSettings(config,"ordinary_session");
 expect((await taskPermissionSettings(config,"always_session")).mode).toBe("full_access");
 expect((await taskPermissionSettings(config,"ordinary_session")).mode).toBe("default");
 expect((await taskCostSettings(config,"ordinary_session")).policy.currency).toBe("USD");
 // Editing the readable workspace file cannot grant task permissions.
 const file=join(workspace.path,".get3w","always-on","state.json");
 const state=JSON.parse(await readFile(file,"utf8"));state.settings.fullAccess=false;await writeFile(file,JSON.stringify(state));
 await initializeAlwaysOnTaskSettings(config,workspace,"another_session");
 expect((await taskPermissionSettings(config,"another_session")).mode).toBe("full_access");
 const local:WorkspaceInfo={...workspace,id:"local",path:root,workspaceType:"local"};config.workspaces=[local];
 const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});try{await runner.tick();expect(engine.counts()).toEqual({creates:0,sends:0});}finally{await runner.stop();}
 expect(buildWorkspaceInfos([workspace,local],root).map(item=>item.workspaceType)).toEqual(["always-on","local"]);
}));
test("duplicate creation preserves the existing goal; a second process cannot own the same runner", () => fixture(async(config,workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 await expect(createAlwaysOnWorkspace(config,workspace,{...settings,goal:"Overwrite"})).rejects.toThrow();
 const engine=native(workspace);const first=createAlwaysOnRunner(config,{client:()=>engine.client});const second=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{await first.tick();await second.tick();expect(engine.counts()).toEqual({creates:1,sends:1});expect((await first.status(workspace)).settings.goal).toBe([settings.goal,settings.criteria,settings.behavior].join("\n\n"));}finally{await first.stop();await second.stop();}
}));
test("restarting while native is running observes the same message and preserves the timer", () => fixture(async(config,workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const first=createAlwaysOnRunner(config,{client:()=>engine.client});await first.tick();await first.stop();
 const second=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {await second.tick();expect((await second.status(workspace)).phase).toBe("running");await engine.complete();await second.tick();expect((await second.status(workspace)).phase).toBe("idle");expect(engine.counts()).toEqual({creates:1,sends:1});}finally{await second.stop();}
}));


test("settings edits persist, change the next prompt and timer, preserve pause and isolate local defaults", () => fixture(async(config,workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace); let now=Date.now();
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try {
  await runner.tick();
  const next={...settings,goal:"Updated goal",criteria:"",behavior:"",intervalMinutes:10};
  await runner.updateSettings(workspace,next);
  expect((await runner.status(workspace)).settings.goal).toBe(next.goal);
  await expect(runner.updateSettings(workspace,{...next,fullAccess:true})).rejects.toThrow("Finish the current chat");
  await engine.complete();await runner.tick();await runner.control(workspace,"pause");
  const updated=await runner.updateSettings(workspace,{...next,intervalMinutes:20,fullAccess:true,costAuto:true});
  expect(updated.paused).toBe(true);expect(updated.nextRunAt).toBe(now+20*60000);
  expect((await taskPermissionSettings(config,"ses_fixture")).mode).toBe("full_access");
  await initializeAlwaysOnTaskSettings(config,workspace,"new_chat");
  expect((await taskPermissionSettings(config,"new_chat")).mode).toBe("full_access");
  await initializeTaskPermissionMode(config,"local_chat");
  expect((await taskPermissionSettings(config,"local_chat")).mode).toBe("default");
  await expect(runner.updateSettings(workspace,{...next,goal:""})).rejects.toThrow();
  await runner.control(workspace,"run");await runner.tick();
  const snapshot=await engine.client.getThreadSnapshot("ses_fixture");
  expect(snapshot.messages.at(-1)?.parts[0]?.text).toContain("任务目标：\nUpdated goal");
  expect(snapshot.messages.at(-1)?.parts[0]?.text).toContain("Never list any path under .get3w/ in artifacts");
  expect(snapshot.messages.at(-1)?.parts[0]?.text).toContain("Use artifacts:[] when a check only updates runtime records");
  expect(snapshot.messages.at(-1)?.parts[0]?.text).not.toContain("Expected outcomes:");
  expect(snapshot.messages.at(-1)?.parts[0]?.text).not.toContain("Workspace instructions:");
  expect(JSON.parse(await readFile(join(workspace.path,".get3w/always-on/state.json"),"utf8")).settings.goal).toBe("Updated goal");
 } finally {await runner.stop();}
}));


test("freeform instructions preserve user text, accept long content and merge legacy fields once",()=>{
 const goal="  自由描述\nhttps://weibo.com/hot/mine\n"+"任意内容".repeat(6000);
 const parsed=alwaysOnSettingsSchema.parse({...settings,goal,criteria:"",behavior:""});
 expect(parsed.goal).toBe(goal);
 const legacy=alwaysOnSettingsSchema.parse(settings);
 expect(legacy.goal).toBe([settings.goal,settings.criteria,settings.behavior].join("\n\n"));
 expect(alwaysOnSettingsSchema.parse(legacy)).toEqual(legacy);
 expect(alwaysOnSettingsSchema.parse({...settings,goal:"自由输入",criteria:undefined,behavior:undefined}).goal).toBe("自由输入");
});

test("readiness refusals retry the same event with backoff and survive restart without duplicate chats", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now = Date.now(), attempts = 0;
 const { HeadlessThreadError } = await import("@get3w/headless-threads");
 const ids: (string | undefined)[] = [];
 const client: HeadlessThreadClient = { ...engine.client, async sendTurn(id, input) {
  attempts++; ids.push(input.messageId);
  if (attempts < 3) throw new HeadlessThreadError({code:"mcp_tools_not_ready",message:"not ready",status:503,method:"POST",path:"/prompt"});
  return engine.client.sendTurn(id,input);
 }};
 const first = createAlwaysOnRunner(config,{client:()=>client,now:()=>now});
 await first.tick(); const waiting = await first.status(workspace);
 expect(waiting.phase).toBe("queued"); expect(waiting.retryAt).toBe(now+5000); expect(waiting.lastErrorCode).toBe("mcp_tools_not_ready");
 await first.tick(); expect(attempts).toBe(1); await first.stop();
 const second = createAlwaysOnRunner(config,{client:()=>client,now:()=>now});
 try {
  now+=5000; await second.tick(); expect((await second.status(workspace)).retryAt).toBe(now+10000);
  await second.control(workspace,"pause"); now+=10000; await second.tick(); expect(attempts).toBe(2);
  await second.control(workspace,"resume"); await second.tick();
  expect((await second.status(workspace)).phase).toBe("running"); expect((await second.status(workspace)).retryAt).toBeNull();
  expect(new Set(ids).size).toBe(1); expect(engine.counts()).toEqual({creates:1,sends:1});
 } finally { await second.stop(); }
}));

test("persistent readiness failure stops after five retries and allows an explicit retry", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now=Date.now(), attempts=0;
 const { HeadlessThreadError }=await import("@get3w/headless-threads");
 const client:HeadlessThreadClient={...engine.client,async sendTurn(){attempts++;throw new HeadlessThreadError({code:"mcp_tools_not_ready",message:"not ready",status:503,method:"POST",path:"/prompt"});}};
 const runner=createAlwaysOnRunner(config,{client:()=>client,now:()=>now});
 try {
  for(let i=0;i<6;i++){await runner.tick();now+=120000;}
  expect(attempts).toBe(6); expect((await runner.status(workspace)).phase).toBe("error");
  await runner.tick(); expect(attempts).toBe(6);
  await runner.control(workspace,"run"); await runner.tick(); expect(attempts).toBe(7);
  expect((await runner.status(workspace)).retryCount).toBe(1);
 } finally {await runner.stop();}
}));

test("overview reads receipts and pages without executing or exposing local workspaces", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  expect((await readAlwaysOnOverview(workspace)).runs[0]?.phase).toBe("queued");expect(engine.counts().sends).toBe(0);
  await runner.tick();await engine.complete();await runner.tick();
  const overview=await readAlwaysOnOverview(workspace);
  expect(overview.runs).toHaveLength(1);expect(overview.runs[0]?.messageId).toStartWith("msg_");expect(overview.progress).toEqual({total:1,completed:1,active:0,waiting:0,failed:0,paused:0});expect(overview.runs[0]?.summary).toBe("Checked fixture, no changes");expect(overview.runs[0]?.sessionId).toBe("ses_fixture");
  const root=join(workspace.path,".get3w","always-on","runs");
  for(let i=0;i<22;i++)await writeFile(join(root,`fixture-${i}.json`),JSON.stringify({event:{id:`fixture-${i}`,kind:"timer",phase:"done",messageId:`msg_${i}`,createdAt:i,finishedAt:i+1},sessionId:"ses_fixture",messages:[]}));
  await writeFile(join(root,"corrupt.json"),"invalid");
  const page=await readAlwaysOnOverview(workspace);expect(page.progress.total).toBe(23);expect(page.progress.completed).toBe(23);expect(page.nextOffset).toBe(20);expect(page.unreadableCount).toBe(1);
  const next=await readAlwaysOnOverview(workspace,20);expect(next.nextOffset).toBeNull();expect(next.runs.length).toBeGreaterThan(0);
  await expect(readAlwaysOnOverview({...workspace,workspaceType:"local"})).rejects.toThrow("Always-on workspace not found");
  await expect(readAlwaysOnOverview(workspace,-1)).rejects.toThrow("Invalid history offset");expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("source inbox persists, deduplicates, controls receipt, and serially runs queued events after resume", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings); const engine=native(workspace);
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  await runner.control(workspace,"pause");
  const [source]=await runner.saveSource(workspace,{kind:"webhook",name:"Build",scope:""});
  expect(source).toBeDefined();
  expect(await runner.receive(workspace,source!.id,{text:"Build failed",key:"job-1"})).toMatchObject({duplicate:false});
  expect(await runner.receive(workspace,source!.id,{text:"Build failed",key:"job-1"})).toEqual({duplicate:true});
  expect((await runner.inbox(workspace)).pending).toHaveLength(2);
  await runner.tick();expect(engine.counts().sends).toBe(0);
  await runner.controlSource(workspace,source!.id,"disable");
  await expect(runner.receive(workspace,source!.id,{text:"new",key:"job-2"})).rejects.toThrow("停用");
  await runner.controlSource(workspace,source!.id,"enable");
  await runner.saveSource(workspace,{kind:"webhook",name:"Renamed",scope:""},source!.id);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});
  expect((await runner.inbox(workspace)).pending).toHaveLength(2);
  await runner.control(workspace,"resume"); await runner.tick();await engine.complete();await runner.tick();await runner.tick();
  expect(engine.counts().sends).toBe(2);
  const received=(await runner.inbox(workspace)).processing[0]!;
  expect(engine.prompts().at(-1)).toContain(`event created/received locally at ${new Date(received.createdAt).toISOString()}`);
  expect(engine.prompts().at(-1)).toContain("do not replace it with execution time");
  expect(engine.prompts().at(-1)).toContain("A report alone does not complete this run.");
  expect((await runner.inbox(workspace)).processing[0]?.text).toBe("Build failed");
  await runner.controlSource(workspace,source!.id,"delete");
  await expect(runner.receive(workspace,source!.id,{text:"new",key:"job-3"})).rejects.toThrow("删除");
  await engine.complete();await runner.tick();const inbox=await runner.inbox(workspace);
  expect(inbox.sources).toHaveLength(0);expect(inbox.historyTotal).toBe(2);expect(inbox.pending).toHaveLength(0);
  expect((await readAlwaysOnOverview(workspace)).progress.total).toBe(2);
  await expect(runner.inbox({...workspace,workspaceType:"local"})).rejects.toThrow("not found");
 }finally{await runner.stop();}
}));
test("file sources stay inside workspace, ignore runtime files, and enqueue changes once", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  await runner.control(workspace,"pause");
  await expect(runner.saveSource(workspace,{kind:"files",name:"Escape",scope:"../"})).rejects.toThrow("业务目录");
  await expect(runner.saveSource(workspace,{kind:"files",name:"Internal",scope:".get3w"})).rejects.toThrow("业务目录");
  const [source]=await runner.saveSource(workspace,{kind:"files",name:"Documents",scope:"."});
  await runner.tick();expect((await runner.inbox(workspace)).pending).toHaveLength(1);
  await writeFile(join(workspace.path,"report.txt"),"changed");await runner.tick();await runner.tick();
  expect((await runner.inbox(workspace)).pending).toHaveLength(2);
  await runner.controlSource(workspace,source!.id,"disable");await writeFile(join(workspace.path,"report.txt"),"changed again");await runner.tick();
  expect((await runner.inbox(workspace)).pending).toHaveLength(2);
  await runner.controlSource(workspace,source!.id,"enable");await runner.tick();expect((await runner.inbox(workspace)).pending).toHaveLength(2);
 }finally{await runner.stop();}
}));

test("follow-ups persist, queue while paused, trigger once and reuse the executor", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings); const engine = native(workspace); let now = Date.now();
 let runner = createAlwaysOnRunner(config, { client: () => engine.client, now: () => now });
 const id = crypto.randomUUID(); const cancelledId = crypto.randomUUID();
 try {
  await runner.tick(); await engine.complete(); await runner.tick(); await runner.control(workspace, "pause");
  await runner.addFollowup(workspace, { id, text: "Check report tomorrow", dueAt: now + 1000 });
  await runner.addFollowup(workspace, { id, text: "Check report tomorrow", dueAt: now + 1000 });
  await runner.addFollowup(workspace, { id: cancelledId, text: "Do not run", dueAt: now + 1000 });
  await runner.cancelFollowup(workspace, cancelledId);
  await expect(runner.addFollowup(workspace, { id: crypto.randomUUID(), text: "Past", dueAt: now - 1 })).rejects.toThrow();
  await expect(runner.addFollowup({ ...workspace, workspaceType: "local" }, { id: crypto.randomUUID(), text: "Local", dueAt: now + 1000 })).rejects.toThrow();
  await runner.stop(); runner = createAlwaysOnRunner(config, { client: () => engine.client, now: () => now }); now += 1001;
  await runner.tick(); await runner.tick();
  const timers = await runner.timers(workspace); expect(timers.followups).toHaveLength(2);
  expect(timers.followups.find(item => item.id === id)?.state).toBe("triggered");
  expect(timers.followups.find(item => item.id === cancelledId)?.state).toBe("cancelled");
  const inbox = await runner.inbox(workspace, 0, id); expect(inbox.pending).toHaveLength(1); expect(inbox.focusedRun?.text).toBe("Check report tomorrow");
  expect(engine.counts().sends).toBe(1);
  await expect(runner.cancelFollowup(workspace, id)).rejects.toThrow("无法取消");
  await runner.control(workspace, "resume"); await runner.tick(); expect(engine.counts()).toEqual({ creates: 1, sends: 2 });
  await runner.tick(); expect(engine.counts().sends).toBe(2);
  await engine.complete(); await runner.tick(); expect((await runner.inbox(workspace, 0, id)).focusedRun?.phase).toBe("done");
 } finally { await runner.stop(); }
}));

for (const failure of ["missing-file", "missing-directory", "invalid-json", "invalid-schema"]) {
 test(`unavailable always-on state (${failure}) blocks dispatch and mutations without rebuilding data`, () => fixture(async (config, workspace) => {
  await createAlwaysOnWorkspace(config, workspace, settings);
  const engine = native(workspace);
  const runner = createAlwaysOnRunner(config, { client: () => engine.client });
  const directory = join(workspace.path, ".get3w", "always-on");
  const file = join(directory, "state.json");
  try {
   await runner.tick(); // Keep an existing chat and lease before losing state.
   if (failure === "missing-directory") await rm(directory, { recursive: true });
   else if (failure === "missing-file") await rm(file);
   else await writeFile(file, failure === "invalid-json" ? "{broken" : "{}");
   const code = failure.startsWith("missing") ? "always_on_state_missing" : "always_on_state_invalid";
   for (const action of [
    () => runner.status(workspace), () => runner.inbox(workspace), () => runner.timers(workspace),
    () => readAlwaysOnOverview(workspace), () => runner.control(workspace, "resume"),
    () => runner.updateSettings(workspace, settings),
   ]) await expect(action()).rejects.toMatchObject({ status: 409, code });
   await runner.tick(); await runner.tick();
   expect(engine.counts()).toEqual({ creates: 1, sends: 1 });
   if (failure.startsWith("missing")) await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
   else expect(await readFile(file, "utf8")).toBe(failure === "invalid-json" ? "{broken" : "{}");
  } finally { await runner.stop(); }
  // A fresh runner must also refuse to initialize lost state.
  const restarted = createAlwaysOnRunner(config, { client: () => engine.client });
  try { await restarted.tick(); expect(engine.counts()).toEqual({ creates: 1, sends: 1 }); }
  finally { await restarted.stop(); }
 }));
}

test("idle with an unfinished reply blocks later dispatch and records interruption", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now = Date.now();
 const runner = createAlwaysOnRunner(config, { client: () => engine.client, now: () => now });
 try {
  await runner.tick(); engine.idleWithoutResult();
  // A real interrupted turn may contain only completed tool steps or an empty tail.
  engine.client.getThreadSnapshot = async () => ({ threadId: "ses_fixture", title: "Fixture", directory: null,
   status: { type: "idle" }, todos: [], messages: [
    { id: (await runnerState()).messageId, role: "user", parentId: null, createdAt: 1, error: null, usage: null, parts: [] },
    { id: "unfinished", role: "assistant", parentId: (await runnerState()).messageId, createdAt: 2, completedAt: null, error: null, usage: null, parts: [] },
   ] });
  async function runnerState() { return JSON.parse(await readFile(join(workspace.path, ".get3w", "always-on", "state.json"), "utf8")).event; }
  await runner.tick();
  expect(await runner.status(workspace)).toMatchObject({ phase: "interrupted", nextRunAt: null, lastErrorCode: "always_on_incomplete" });
  now += 3600000; await runner.tick(); await runner.tick();
  expect(engine.counts()).toEqual({ creates: 1, sends: 1 });
 } finally { await runner.stop(); }
}));

for (const evidence of [true, false]) test(`explicit empty stop requires verified runtime records (${evidence})`, () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(evidence, {action:"quiet"});
  const snapshot = await engine.client.getThreadSnapshot("ses_fixture");
  const reply = snapshot.messages.at(-1)!;
  reply.parts = []; reply.finish = "stop";
  engine.client.getThreadSnapshot = async () => snapshot;
  await runner.tick();
  expect((await runner.status(workspace)).phase).toBe(evidence ? "idle" : "interrupted");
  expect(engine.counts()).toEqual({creates:1,sends:1});
  expect(await readAlwaysOnOutbox(workspace)).toHaveLength(0);
  if (evidence) {
   const path = join(workspace.path,".get3w/always-on/state.json");
   const state = JSON.parse(await readFile(path,"utf8"));
   state.phase = "interrupted"; state.event.phase = "interrupted"; state.lastErrorCode = "always_on_incomplete";
   state.nextRunAt = null; state.paused = true;
   await writeFile(path,JSON.stringify(state));
   await runner.tick();
   expect(await runner.status(workspace)).toMatchObject({phase:"idle",paused:true,event:{id:state.event.id,phase:"done"}});
   expect(engine.counts()).toEqual({creates:1,sends:1});
  }
 } finally { await runner.stop(); }
}));

test("completed tool-call narration is not a final result", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick();
  const snapshot = await engine.client.getThreadSnapshot("ses_fixture");
  snapshot.status = { type: "idle" };
  snapshot.messages.push({ id: "tool_narration", role: "assistant", parentId: snapshot.messages[0]!.id,
   createdAt: 1, completedAt: 2, finish: "tool-calls", error: null, usage: null,
   parts: [{ id: "narration", type: "text", text: "Checking files now" }] });
  engine.client.getThreadSnapshot = async () => snapshot;
  await runner.tick();
  expect(await runner.status(workspace)).toMatchObject({ phase: "interrupted", nextRunAt: null });
  await runner.tick(); expect(engine.counts().sends).toBe(1);
 } finally { await runner.stop(); }
}));

test("retryable timer failures back off, survive restart, respect pause and stop after three checks", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now = Date.now();
 let runner = createAlwaysOnRunner(config, { client: () => engine.client, now: () => now });
 const snapshot = engine.client.getThreadSnapshot;
 let fail = false;
 engine.client.getThreadSnapshot = async id => {
  const result = await snapshot(id);
  if (fail && result.status.type === "idle") {
   const reply = result.messages.at(-1);
   if (reply?.role === "assistant") reply.error = { name: "temporary", message: "Temporary outage", retryable: true };
  }
  return result;
 };
 try {
  await runner.tick(); await engine.complete(); await runner.tick(); now += 60000;
  await runner.tick(); fail = true; await engine.complete(); await runner.tick();
  expect(await runner.status(workspace)).toMatchObject({ phase: "error", nextRunAt: now + 60000 });
  await runner.stop(); runner = createAlwaysOnRunner(config, { client: () => engine.client, now: () => now });
  await runner.control(workspace, "pause"); now += 60000; await runner.tick(); expect(engine.counts().sends).toBe(2);
  await runner.control(workspace, "resume");
  expect((await runner.status(workspace)).nextRunAt).toBe(now);
  for (let attempt = 0; attempt < 3; attempt++) {
   await runner.tick(); await engine.complete(); await runner.tick();
   now += 120000;
  }
  expect(await runner.status(workspace)).toMatchObject({ phase: "error", nextRunAt: null });
  const sent = engine.counts().sends; await runner.tick(); expect(engine.counts().sends).toBe(sent);
  await runner.control(workspace, "resume"); await runner.tick(); expect(engine.counts().sends).toBe(sent + 1);
 } finally { await runner.stop(); }
}));

for (const unsafe of ["unknown", "tool", "source"]) {
 test(`failed ${unsafe} turn waits for explicit recovery`, () => fixture(async (config, workspace) => {
  await createAlwaysOnWorkspace(config, workspace, settings);
  const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
  try {
   await runner.tick(); await engine.complete();
   const result = await engine.client.getThreadSnapshot("ses_fixture");
   const reply = result.messages.at(-1)!;
   reply.error = { name: "failure", message: "Failed", retryable: unsafe === "unknown" ? null : true };
   if (unsafe === "tool") reply.parts.push({ id: "tool", type: "tool" });
   engine.client.getThreadSnapshot = async () => result;
   {
    const file = join(workspace.path, ".get3w/always-on/state.json");
    const state = JSON.parse(await readFile(file, "utf8")); state.event.kind = unsafe === "source" ? "source" : "timer"; await writeFile(file, JSON.stringify(state));
   }
   await runner.tick(); expect(await runner.status(workspace)).toMatchObject({ phase: "error", nextRunAt: null });
   await runner.tick(); expect(engine.counts().sends).toBe(1);
   engine.pending({ kind: "permission", requestId: "approval", title: "Review", detail: "test" });
   await expect(runner.control(workspace, "resume")).rejects.toThrow("请先处理");
   engine.pending(null); await runner.control(workspace, "resume"); await runner.tick(); expect(engine.counts().sends).toBe(2);
  } finally { await runner.stop(); }
 }));
}

test("promised records remain unverified, block dispatch across restart, and repair the same event without replay", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let now = Date.now();
 let runner = createAlwaysOnRunner(config, {client:()=>engine.client,now:()=>now});
 try {
  await runner.tick(); await engine.complete(false); await runner.tick();
  const first = await runner.status(workspace); const id = first.event!.id; const messageId = first.event!.messageId;
  expect(first).toMatchObject({phase:"interrupted",paused:false,nextRunAt:null,lastErrorCode:"always_on_incomplete",event:{phase:"interrupted",verification:{status:"needs_review",issues:["result_invalid","checkpoint_missing"]}}});
  expect((await readAlwaysOnOverview(workspace)).progress).toMatchObject({waiting:0,completed:0,failed:1});
  await runner.stop(); runner = createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
  now += 120000; await runner.tick(); expect(engine.counts().sends).toBe(1);
  await expect(runner.control(workspace,"run")).rejects.toThrow("Review");
  expect((await runner.inbox(workspace)).history[0]?.verification?.status).toBe("needs_review");
  expect(await runner.attention(workspace)).toMatchObject({items:[],resultReview:{id,sessionId:"ses_fixture",verification:{status:"needs_review"}}});
  await runner.control(workspace,"pause");
  await runner.reviewResult(workspace,id,"verify"); expect(engine.counts().sends).toBe(1);
  await Promise.allSettled([runner.reviewResult(workspace,id,"repair"),runner.reviewResult(workspace,id,"repair")]);
  await runner.tick(); expect(engine.counts().sends).toBe(2);
  const repairing = await runner.status(workspace);
  expect((await runner.attention(workspace)).repairingResult).toBe(true);
  expect(repairing.event?.id).toBe(id); expect(repairing.event?.messageId).not.toBe(messageId); expect(repairing.paused).toBe(true); expect(repairing.event?.repairCount).toBe(1);
  const snapshot = await engine.client.getThreadSnapshot("ses_fixture");
  expect(snapshot.messages.filter(m=>m.role==="user").at(-1)?.parts[0]?.text).toContain("RECORD COMPLETION ONLY");
  expect(await readdir(join(workspace.path,".get3w/always-on/repairs"))).toEqual([`${id}-0.json`]);
  await engine.complete(); await runner.tick();
  expect((await runner.status(workspace)).event?.verification?.status).toBe("verified");
  expect((await runner.attention(workspace)).resultReview).toBeUndefined();
  now += 120000; await runner.tick(); expect(engine.counts().sends).toBe(2);
  await runner.control(workspace,"resume"); await runner.tick(); expect(engine.counts().sends).toBe(3);
 } finally { await runner.stop(); }
}));

test("status, inbox and timers remain responsive during a stalled native dispatch without releasing mutation ordering", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const original=engine.client.sendTurn;
 let release:()=>void=()=>{};let entered:()=>void=()=>{};
 const blocked=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});
 engine.client.sendTurn=async(id,input)=>{entered();await blocked;return original(id,input);};
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 const dispatch=runner.tick();await started;
 try {
  const reads=Promise.all([runner.status(workspace),runner.inbox(workspace),runner.timers(workspace)]);
  const result=await Promise.race([reads,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error("Read blocked behind model dispatch")),1000))]);
  expect(result[0].event?.phase).toBe("submitting");expect(result[1].processing).toHaveLength(1);expect(result[2].status.phase).toBe("queued");
  let paused=false;const pause=runner.control(workspace,"pause").then(()=>{paused=true;});
  await Bun.sleep(20);expect(paused).toBe(false);
  release();await dispatch;await pause;expect((await runner.status(workspace)).paused).toBe(true);expect(engine.counts().sends).toBe(1);
  await expect(runner.status({...workspace,workspaceType:"local"})).rejects.toThrow("not found");
 }finally{release();await dispatch;await runner.stop();}
}));

test("dispatch loads current enabled notes; disabling them supersedes the previous prompt", () => fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);let now=Date.now();
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  let memory=await mutateAlwaysOnMemory(workspace,{action:"save",revision:0,title:"中文偏好",text:"MEMORY_SENTINEL 简洁中文"});
  await runner.tick();let snapshot=await engine.client.getThreadSnapshot("ses_fixture");
  expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain("MEMORY_SENTINEL");
  expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).toContain("中文偏好");
  expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).toContain("never call workspace_file plan/register for anything under .get3w/");
  await engine.complete();await runner.tick();
  memory=await mutateAlwaysOnMemory(workspace,{action:"disable",revision:memory.revision,id:memory.notes[0]!.id});
  now+=61000;await runner.tick();snapshot=await engine.client.getThreadSnapshot("ses_fixture");
  expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain("MEMORY_SENTINEL");
  expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).toContain("replaces older memory snapshots");
 }finally{await runner.stop();}
}));

test("completed runner result collects preference proposals without activating them or replaying", () => fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await engine.complete();
  const state=await runner.status(workspace);const id=state.event!.id;
  const path=join(workspace.path,`.get3w/always-on/results/${id}.json`);
  const result=JSON.parse(await readFile(path,"utf8"));result.memorySuggestions=["Prefer concise source links"];
  await writeFile(path,JSON.stringify(result));await runner.tick();
  const {readAlwaysOnMemory}=await import("../src/always-on-memory");const memory=await readAlwaysOnMemory(workspace);
  expect(memory.suggestions).toHaveLength(1);expect(memory.notes).toHaveLength(0);expect(memory.suggestions![0]!.eventId).toBe(id);
  await runner.tick();expect((await readAlwaysOnMemory(workspace)).suggestions).toHaveLength(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));
test("only completed final chat replies become reported memory",()=>fixture(async(config,workspace)=>{
 const {readAlwaysOnMemory}=await import("../src/always-on-memory");
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();expect((await readAlwaysOnMemory(workspace)).reported ?? []).toHaveLength(0);
  engine.idleWithoutResult();await runner.tick();expect((await readAlwaysOnMemory(workspace)).reported ?? []).toHaveLength(0);
  const interrupted=await runner.status(workspace);await runner.reviewResult(workspace,interrupted.event!.id,"repair");await runner.tick();await engine.complete();await runner.tick();
  await runner.control(workspace,"run");await runner.tick();await engine.complete();await runner.tick();
  const memory=await readAlwaysOnMemory(workspace);expect(memory.reported).toHaveLength(1);expect(memory.reported![0]!.text).toBe("Completed fixture");expect(memory.reported![0]!.messageId).toMatch(/^assistant_/);
  await runner.tick();expect((await readAlwaysOnMemory(workspace)).reported).toHaveLength(1);
 }finally{await runner.stop();}
}));
test("deliverables are read-only verified receipt projections, paged after filtering and safe across restart",()=>fixture(async(config,w)=>{
 const {readAlwaysOnDeliverables}=await import("../src/always-on");
 await createAlwaysOnWorkspace(config,w,settings);
 const root=join(w.path,".get3w/always-on/runs");await mkdir(root,{recursive:true});
 const saved=JSON.parse(await readFile(join(w.path,".get3w/always-on/state.json"),"utf8"));
 for(let n=0;n<7;n++)await writeFile(join(root,`result-${n}.json`),JSON.stringify({event:{...saved.event,id:`result-${n}`,phase:n===6?"error":"done",finishedAt:n+1,originalMessageId:"original",verification:{status:n===5?"needs_review":"verified",checkedAt:1,issues:[],summary:`Conclusion ${n}`,outcome:"changed",artifacts:["report.md","../private","/private",".get3w/always-on/checkpoint.md"]}},sessionId:"session",messages:[]}));
 await writeFile(join(root,"broken.json"),"invalid");
 const before=await readFile(join(w.path,".get3w/always-on/state.json"),"utf8");
 const page=await readAlwaysOnDeliverables(w);expect(page.results.map(r=>r.id)).toEqual(["result-4","result-3","result-2"]);expect(page.nextOffset).toBe(3);expect(page.unreadableCount).toBe(1);expect(page.results[0]?.artifacts).toEqual(["report.md"]);expect(page.results[0]?.messageId).toBe("original");
 const second=await readAlwaysOnDeliverables(w,3);expect(second.results.map(r=>r.id)).toEqual(["result-1","result-0"]);expect(second.nextOffset).toBeNull();
 expect(await readFile(join(w.path,".get3w/always-on/state.json"),"utf8")).toBe(before);
 await expect(readAlwaysOnDeliverables({...w,workspaceType:"local"})).rejects.toMatchObject({status:404});await expect(readAlwaysOnDeliverables(w,-1)).rejects.toMatchObject({status:400});
 const child=Bun.spawn([process.execPath,"--eval",`const {readAlwaysOnDeliverables}=await import(${JSON.stringify(new URL("../src/always-on.ts",import.meta.url).pathname)});console.log(JSON.stringify(await readAlwaysOnDeliverables(${JSON.stringify(w)})));`],{stdout:"pipe",stderr:"pipe"});expect(await child.exited).toBe(0);expect(JSON.parse(await new Response(child.stdout).text()).results).toEqual(page.results);
 const {symlink}=await import("node:fs/promises");await rm(root,{recursive:true});await symlink(config.configPath,root);await expect(readAlwaysOnDeliverables(w)).rejects.toMatchObject({code:"results_unreadable"});
}));

test("completed checks without explicit notification never enqueue",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{await runner.tick();await engine.complete();await runner.tick();await runner.control(workspace,"pause");await runner.tick();expect(await readAlwaysOnOutbox(workspace)).toHaveLength(0);}finally{await runner.stop();}
}));
test("verified runs queue explicit notifications once after durable completion",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await engine.complete(true,{action:"send",text:"Fixture report is ready"});await runner.tick();
  expect((await runner.status(workspace)).event?.phase).toBe("done");
  await runner.control(workspace,"pause");
  await runner.tick();await runner.tick();
  expect(await readAlwaysOnOutbox(workspace)).toHaveLength(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("failed notification persistence preserves a completed run and recovers without another model turn",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();
  const path=join(workspace.path,".get3w/always-on/outbox");await symlink(tmpdir(),path);
  await engine.complete(true,{action:"send",text:"Ready"});await runner.tick();
  await runner.control(workspace,"pause");
  await runner.tick();expect((await runner.status(workspace)).event?.phase).toBe("done");expect(engine.counts().sends).toBe(1);
  await rm(path);await runner.tick();expect(await readAlwaysOnOutbox(workspace)).toHaveLength(1);expect(engine.counts().sends).toBe(1);expect((await runner.status(workspace)).phase).toBe("idle");
 }finally{await runner.stop();}
}));

test("attention reads real pending requests while paused without dispatch or answering", () => fixture(async(config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace);
 const runner = createAlwaysOnRunner(config, {client:()=>engine.client});
 try {
  expect((await runner.attention(workspace)).items).toEqual([]);
  await runner.tick();
  engine.pending({kind:"question",requestId:"question-one",questions:[{header:"Scope",question:"Which files?",options:[{label:"New files",description:"Only additions"}],multiple:false,custom:true}]});
  await runner.tick();await runner.control(workspace,"pause");
  const counts=engine.counts();const result=await runner.attention(workspace);
  expect(result.paused).toBe(true);expect(result.scope).toBe("active-task");
  expect(result.items[0]?.requestId).toBe("question-one");expect(result.items[0]?.request.kind).toBe("question");
  expect(result.items[0]?.sessionId).toBe((await runner.status(workspace)).sessionId);
  expect(engine.counts()).toEqual(counts);
  engine.pending({kind:"permission",requestId:"permission-one",title:"Write report",detail:"reports/test.md",command:"write report"});
  expect((await runner.attention(workspace)).items[0]?.request.kind).toBe("permission");
  const other = {...workspace,id:"ws_other",path:join(workspace.path,"other")};
  await mkdir(other.path);await createAlwaysOnWorkspace(config,other,settings);
  expect((await runner.attention(other)).items).toEqual([]);
  engine.pending(null);expect((await runner.attention(workspace)).items).toEqual([]);
  const originalRead = engine.client.getThreadPending;
  engine.client.getThreadPending = async () => {
   const path = join(workspace.path,".get3w/always-on/state.json");
   const state = JSON.parse(await readFile(path,"utf8"));
   state.event.phase = "done";
   await writeFile(path,JSON.stringify(state));
   return {kind:"permission",requestId:"stale",title:"Old request",detail:"Old task"};
  };
  await expect(runner.attention(workspace)).rejects.toThrow("The active task changed");
  engine.client.getThreadPending = originalRead;
  await expect(runner.attention({...workspace,workspaceType:"local"})).rejects.toThrow("Always-on workspace not found");
 } finally {await runner.stop();}
}));

test("question answers persist while paused, resume the original call once, and reject competing answers",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);
 let replies=0;engine.client.answerThread=async(id,answer)=>{expect(id).toBe("ses_fixture");expect(answer.kind).toBe("question");replies++;engine.pending(null);};
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try {
  await runner.tick();
  const request={kind:"question" as const,requestId:"q",questions:[{header:"Scope",question:"Which files?",options:[{label:"New",description:"New files"}],multiple:false,custom:true}]};
  engine.pending(request);await runner.tick();await runner.control(workspace,"pause");
  const state=await runner.status(workspace);const input={id:crypto.randomUUID(),sessionId:state.sessionId!,eventId:state.event!.id,request,answers:[["New"]]};
  await expect(runner.answerQuestion(workspace,{...input,answers:[[]]})).rejects.toThrow();
  await expect(runner.answerQuestion({...workspace,workspaceType:"local"},input)).rejects.toThrow();
  expect(await runner.answerQuestion(workspace,input)).toEqual({status:"queued"});
  expect(await runner.answerQuestion(workspace,input)).toEqual({status:"queued"});
  await expect(runner.answerQuestion(workspace,{...input,id:crypto.randomUUID()})).rejects.toThrow("already has an answer");
  await runner.tick();expect(replies).toBe(0);expect((await runner.attention(workspace)).items[0]?.answerStatus).toBe("queued");
  expect((await runner.attention(workspace)).items[0]?.savedAnswers).toEqual([["New"]]);
  expect(JSON.parse(await readFile(join(workspace.path,".get3w/always-on/answers.json"),"utf8"))[0].status).toBe("queued");
  await runner.stop();
  // An agent-editable projection cannot alter the authorized answer.
  await writeFile(join(workspace.path,".get3w/always-on/answers.json"),"[]");
  runner=createAlwaysOnRunner(config,{client:()=>engine.client});await runner.tick();expect(replies).toBe(0);
  await runner.control(workspace,"resume");await runner.tick();expect(replies).toBe(1);expect(engine.counts().sends).toBe(1);
  expect((await runner.attention(workspace)).answerStatus).toBe("answered");
  await runner.tick();expect(replies).toBe(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("changed questions are stale and uncertain answer delivery is never replayed after restart",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);let replies=0;
 engine.client.answerThread=async()=>{replies++;throw Error("Lost reply response");};
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await runner.control(workspace,"pause");const state=await runner.status(workspace);
  const request={kind:"question" as const,requestId:"q",questions:[{header:"Scope",question:"Which files?",options:[],multiple:false,custom:true}]};engine.pending(request);
  const input={id:crypto.randomUUID(),sessionId:state.sessionId!,eventId:state.event!.id,request,answers:[["reports"]]};
  await runner.answerQuestion(workspace,input);engine.pending({...request,questions:[{...request.questions[0],question:"Changed"}]});
  await runner.control(workspace,"resume");await runner.tick();expect(replies).toBe(0);expect((await runner.attention(workspace)).answerStatus).toBe("stale");
  engine.pending({...request,requestId:"q2"});await runner.answerQuestion(workspace,{...input,id:crypto.randomUUID(),request:{...request,requestId:"q2"}});
  await runner.tick();expect(replies).toBe(1);expect((await runner.attention(workspace)).answerStatus).toBe("unconfirmed");
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});await runner.tick();await runner.tick();expect(replies).toBe(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));


test("an interrupted saved question remains visible and cannot silently restart the task",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await runner.control(workspace,"pause");
  const state=await runner.status(workspace);
  const request={kind:"question" as const,requestId:"restart-q",questions:[{header:"Scope",question:"Choose scope",options:[],multiple:false,custom:true}]};engine.pending(request);
  await runner.answerQuestion(workspace,{id:crypto.randomUUID(),eventId:state.event!.id,sessionId:state.sessionId!,request,answers:[["reports"]]});
  engine.pending(null);engine.idleWithoutResult();await runner.tick();
  const result=await runner.attention(workspace);
  expect(result.items[0]?.answerStatus).toBe("stale");expect(result.items[0]?.savedAnswers).toEqual([["reports"]]);
  expect(result.items[0]?.messageId).toBe(state.event!.messageId);
  await expect(runner.control(workspace,"resume")).rejects.toThrow("original question was interrupted");
  await expect(runner.control(workspace,"run")).rejects.toThrow("original question was interrupted");
  expect((await runner.status(workspace)).paused).toBe(true);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));


test("explicit deferred adapter binds before dispatch, syncs pause and fails closed on transport errors",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);
 const actions:string[]=[];
 let fail=false;
 const deferred={
  async bind(_workspace:WorkspaceInfo,sessionID:string,paused:boolean){actions.push(`bind:${sessionID}:${paused}`);if(fail)throw Error("isolated transport unavailable");return {workspaceID:workspace.id,sessionID,paused};},
  async setPaused(_workspaceID:string,_sessionID:string,paused:boolean){actions.push(`pause:${paused}`);if(fail)throw Error("isolated transport unavailable");},
  async list(){return {binding:{workspaceID:workspace.id,sessionID:"ses_fixture",paused:false},questions:[]};},
  async read(){return {binding:{workspaceID:workspace.id,sessionID:"ses_fixture",paused:false},question:undefined};},
  async cancel(){throw Error("not used")},async answer(){throw Error("not used")},async resume(){return true;},async commit(){return false;},
 };
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});
 try{
  await runner.tick();expect(engine.counts().sends).toBe(1);
  expect(actions).toEqual(["bind:ses_fixture:false","pause:false"]);
  await runner.control(workspace,"pause");expect(actions.at(-1)).toBe("pause:true");
  fail=true;
  await expect(runner.control(workspace,"resume")).rejects.toThrow("transport unavailable");
  expect((await runner.status(workspace)).paused).toBe(true);
  await runner.tick();expect(engine.counts().sends).toBe(1);
  expect((await runner.status(workspace)).lastError).toContain("transport unavailable");
  fail=false;
  await runner.tick();
  expect((await runner.status(workspace)).lastError).toBeNull();
  expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("durable questions feed attention and the saved answer queue without native forms or replay",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const engine=native(workspace);
 const questions=[{header:"Scope",question:"Which files?",options:[{label:"New files",description:"Create files"}],multiple:false}];
 let question:import("../src/always-on-deferred-client").DeferredQuestion={sessionID:"ses_fixture",messageID:"msg_question",callID:"call_durable",requestID:"request_durable",questions,status:"waiting"};
 let paused=false,answers=0,commits=0,resumes=0,loseCommit=true;
 const deferred={
  async bind(_workspace:WorkspaceInfo,sessionID:string){return {workspaceID:workspace.id,sessionID,paused};},
  async setPaused(_workspaceID:string,_sessionID:string,value:boolean){paused=value;},
  async list(){return {binding:{workspaceID:workspace.id,sessionID:"ses_fixture",paused},questions:question.status==="committed"?[]:[question]};},
  async read(){return {binding:{workspaceID:workspace.id,sessionID:"ses_fixture",paused},question};},
  async answer(_workspaceID:string,input:{answerID:string;answers:string[][]}){answers++;question={...question,...input,status:"answered",content:"canonical result"};return question;},
  async cancel(){throw Error("not used")},
  async resume(){resumes++;return true;},
  async commit(){if(paused)return false;commits++;question={...question,status:"committed",answerID:"answerID" in question?question.answerID:"",answers:"answers" in question?question.answers:[],content:"canonical result"};if(loseCommit){loseCommit=false;throw Error("Lost commit response");}return true;},
 };
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});
 try{
  await runner.tick();expect(engine.counts().sends).toBe(1);
  await runner.tick();expect((await runner.status(workspace)).phase).toBe("waiting");
  const item=(await runner.attention(workspace)).items[0]!;
  expect(item.requestId).toBe("request_durable");
  expect(item.request.kind).toBe("question");
  await runner.control(workspace,"pause");
  await runner.answerQuestion(workspace,{id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:item.request,answers:[["New files"]]});
  await runner.tick();expect(answers).toBe(0);expect(commits).toBe(0);
  await runner.control(workspace,"resume");await runner.tick();expect(answers).toBe(1);expect(commits).toBe(1);
  expect((await runner.attention(workspace)).answerStatus).toBe("unconfirmed");
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});
  await runner.tick();
  expect((await runner.attention(workspace)).answerStatus).toBe("answered");
  expect(answers).toBe(1);expect(commits).toBe(1);expect(resumes).toBe(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));


test("cancellation intent survives a lost response and suppresses saved answers across restart",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);
 const original={sessionID:"ses_fixture",messageID:"msg_question",callID:"call_cancel",requestID:"request_cancel",questions:[{header:"Scope",question:"Which files?",options:[],multiple:false}]};
 let cancelled=false,lost=true,answers=0,cancels=0;
 const deferred={
  async bind(_w:WorkspaceInfo,sessionID:string,paused:boolean){return {workspaceID:workspace.id,sessionID,paused};},async setPaused(){},
  async list(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},questions:cancelled?[]:[{...original,status:"waiting" as const}]};},
  async read(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},question:{...original,status:"waiting" as const}};},
  async cancel(){cancels++;cancelled=true;if(lost){lost=false;throw Error("Lost cancellation response");}return {...original,status:"cancelled" as const};},
  async answer(){answers++;throw Error("Must not submit cancelled answer")},async commit(){return false;},async resume(){return false;},
 };
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});
 try{
  await runner.tick();await runner.tick();const item=(await runner.attention(workspace)).items[0]!;expect(item.canCancel).toBe(true);
  const answer={id:crypto.randomUUID(),sessionId:item.sessionId,eventId:item.eventId,request:{kind:"question" as const,requestId:item.requestId,questions:original.questions.map(q=>({...q,custom:true}))},answers:[["reports"]]};
  await runner.control(workspace,"pause");await runner.answerQuestion(workspace,answer);
  const input={eventId:item.eventId,sessionId:item.sessionId,requestId:item.requestId};
  await expect(runner.updateSettings(workspace,{...settings,goal:"Replacement goal"})).rejects.toThrow("Cancel or answer");
  await expect(runner.cancelQuestion(workspace,input)).rejects.toThrow("Lost cancellation response");
  await expect(runner.control(workspace,"resume")).rejects.toThrow("not yet confirmed");
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});await runner.tick();await runner.tick();
  expect(cancels).toBe(2);expect(answers).toBe(0);expect(engine.counts().sends).toBe(1);
  expect((await runner.status(workspace)).paused).toBe(true);
  expect((await runner.attention(workspace)).answerStatus).toBe("cancelled");
  await expect(runner.updateSettings(workspace,{...settings,goal:"Replacement goal"})).resolves.toMatchObject({paused:true});
  engine.idleWithoutResult();await runner.control(workspace,"resume");await runner.tick();
  const replacement=await runner.status(workspace);expect(replacement.event?.id).not.toBe(item.eventId);
  expect(engine.counts().sends).toBe(2);expect(answers).toBe(0);
  const snapshot=await engine.client.getThreadSnapshot(item.sessionId);expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).toContain("Replacement goal");

  await expect(runner.answerQuestion(workspace,answer)).rejects.toThrow("cancelled");
  await expect(runner.cancelQuestion(workspace,input)).rejects.toThrow("no longer pending");
  await expect(runner.cancelQuestion({...workspace,workspaceType:"local"},input)).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("a committed result wins cancellation without leaving a permanent pending intent",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);
 const original={sessionID:"ses_fixture",messageID:"msg_question",callID:"call_committed",requestID:"request_committed",questions:[{header:"Scope",question:"Which files?",options:[],multiple:false}]};
 let committed=false,cancels=0;
 const deferred={
  async bind(_w:WorkspaceInfo,sessionID:string,paused:boolean){return {workspaceID:workspace.id,sessionID,paused};},async setPaused(){},
  async list(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},questions:committed?[]:[{...original,status:"waiting" as const}]};},
  async read(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},question:{...original,status:"committed" as const,answerID:"winner",answers:[["reports"]],content:"reports"}};},
  async cancel():Promise<never>{cancels++;committed=true;throw Error("Already committed");},
  async answer():Promise<never>{throw Error("not used")},async commit(){return false;},async resume(){return false;},
 };
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client,deferred});
 try{
  await runner.tick();await runner.tick();const item=(await runner.attention(workspace)).items[0]!;
  await expect(runner.cancelQuestion(workspace,{eventId:item.eventId,sessionId:item.sessionId,requestId:item.requestId})).rejects.toThrow("no longer pending");
  expect((await runner.status(workspace)).lastErrorCode).not.toBe("question_cancelled");
  expect((await runner.attention(workspace)).answerStatus).not.toBe("unconfirmed");
  await expect(runner.control(workspace,"resume")).resolves.toMatchObject({paused:false});
  await runner.tick();expect(cancels).toBe(1);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("downgrading a durable task never submits its saved answer through legacy native reply",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);
 const original={sessionID:"ses_fixture",messageID:"msg_question",callID:"call_downgrade",requestID:"request_downgrade",questions:[{header:"Scope",question:"Which files?",options:[],multiple:false}]};
 let available=true;
 const deferred={
  async bind(_w:WorkspaceInfo,sessionID:string,paused:boolean){return {workspaceID:workspace.id,sessionID,paused};},async setPaused(){},
  async list(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},questions:[{...original,status:"waiting" as const}]};},
  async read(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:true},question:{...original,status:"waiting" as const}};},
  async cancel():Promise<never>{throw Error("not used")},async answer():Promise<never>{throw Error("not used")},async commit(){return false;},async resume(){return false;},
 };
 const runner=createAlwaysOnRunner(config,{client:()=>engine.client,get deferred(){return available?deferred:undefined;}});
 try{
  await runner.tick();await runner.tick();const before=await runner.status(workspace);expect(before.deferredQuestions).toBe(true);
  const item=(await runner.attention(workspace)).items[0]!;await runner.control(workspace,"pause");
  await runner.answerQuestion(workspace,{id:crypto.randomUUID(),sessionId:item.sessionId,eventId:item.eventId,request:{kind:"question",requestId:item.requestId,questions:original.questions.map(q=>({...q,custom:true}))},answers:[["reports"]]});
  const mirror=JSON.parse(await readFile(join(workspace.path,".get3w/always-on/state.json"),"utf8"));delete mirror.deferredQuestions;await writeFile(join(workspace.path,".get3w/always-on/state.json"),JSON.stringify(mirror));
  available=false;await runner.tick();const blocked=await runner.status(workspace);
  expect(blocked.event?.id).toBe(before.event?.id);expect(blocked.event?.phase).toBe("waiting");expect(blocked.lastErrorCode).toBe("attention_engine_required");
  await expect(runner.control(workspace,"resume")).rejects.toThrow("requires a deferred-capable engine");
  expect(engine.counts().sends).toBe(1);
  available=true;expect((await runner.attention(workspace)).items[0]?.answerStatus).toBe("queued");
 }finally{await runner.stop();}
}));

test("suspended scheduler coalesces periodic checks but retains each due follow-up and source event",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();
 async function complete(){await engine.complete();const state=await runner.status(w);for(const path of ["checkpoint.md",`results/${state.event!.id}.json`])await utimes(join(w.path,".get3w/always-on",path),now/1000+1,now/1000+1);}
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await complete();await runner.tick();
  const first=await runner.status(w);const due=first.nextRunAt!;
  await runner.stop();now=due+10*60000;
  runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
  await runner.tick();await runner.tick();expect(engine.counts().sends).toBe(2);
  await complete();await runner.tick();expect((await runner.status(w)).nextRunAt).toBe(now+60000);
  await runner.tick();expect(engine.counts().sends).toBe(2);
  await runner.control(w,"pause");
  await runner.addFollowup(w,{id:"11111111-1111-4111-8111-111111111111",text:"A",dueAt:now+1000});
  await runner.addFollowup(w,{id:"22222222-2222-4222-8222-222222222222",text:"B",dueAt:now+2000});
  const sources=await runner.saveSource(w,{kind:"webhook",name:"Recovery",scope:""});
  await runner.receive(w,sources[0]!.id,{key:"source-1",text:"Source"});
  now+=5*60000;await runner.tick();
  expect((await runner.status(w)).queue).toHaveLength(3);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
  await runner.tick();expect((await runner.status(w)).queue).toHaveLength(3);expect(engine.counts().sends).toBe(2);
  await runner.control(w,"resume");
  const ids=[];for(let i=0;i<3;i++){await runner.tick();ids.push((await runner.status(w)).event?.id);await complete();await runner.tick();}
  expect(new Set(ids).size).toBe(3);expect(ids).toContain("11111111-1111-4111-8111-111111111111");expect(ids).toContain("22222222-2222-4222-8222-222222222222");expect(engine.counts().sends).toBe(5);
 }finally{await runner.stop();}
}));

test("transient observation failure recovers the original running message after restart without resending",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let offline=false;
 const read=engine.client.getThreadSnapshot;engine.client.getThreadSnapshot=async(...args)=>{if(offline)throw Error("Injected connection reset");return read(...args);};
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();const before=await runner.status(w);offline=true;await runner.tick();
  expect(await runner.status(w)).toMatchObject({phase:"error",event:{phase:"running",id:before.event!.id,messageId:before.event!.messageId}});
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});await runner.tick();expect(engine.counts().sends).toBe(1);
  await engine.complete(true,{action:"send",text:"Recovered"});offline=false;await runner.tick();await runner.tick();
  expect(await runner.status(w)).toMatchObject({phase:"idle",event:{id:before.event!.id,verification:{status:"verified"}}});
  expect(engine.counts()).toEqual({creates:1,sends:1});expect(await readAlwaysOnOutbox(w)).toHaveLength(1);
 }finally{await runner.stop();}
}));

test("results written before observer restart settle once and paused timers stay paused",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();const before=await runner.status(w);await engine.complete(true,{action:"send",text:"Saved before restart"});await runner.stop();
  runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});await runner.tick();await runner.tick();
  expect((await runner.status(w)).event).toMatchObject({id:before.event!.id,phase:"done",verification:{status:"verified"}});
  expect(await readdir(join(w.path,".get3w/always-on/runs"))).toHaveLength(1);expect(await readAlwaysOnOutbox(w)).toHaveLength(1);expect(engine.counts().sends).toBe(1);
  await runner.control(w,"pause");await runner.stop();now+=600000;
  runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});await runner.tick();expect((await runner.status(w)).paused).toBe(true);expect(engine.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("persisted source deduplication survives restart, distinguishes keys and serializes execution",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(w,"pause");
  const sources=await runner.saveSource(w,{kind:"webhook",name:"Recovery",scope:""});const id=sources[0]!.id;
  const results=await Promise.all([runner.receive(w,id,{key:"same",text:"A"}),runner.receive(w,id,{key:"same",text:"A"})]);expect(results.filter(x=>!x.duplicate)).toHaveLength(1);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});expect(await runner.receive(w,id,{key:"same",text:"A"})).toEqual({duplicate:true});
  expect(await runner.receive(w,id,{key:"different",text:"B"})).toMatchObject({duplicate:false});expect((await runner.status(w)).queue).toHaveLength(2);
  await runner.control(w,"resume");await Promise.all([runner.tick(),runner.tick()]);expect(engine.counts().sends).toBe(2);await runner.tick();expect(engine.counts().sends).toBe(2);
  await engine.complete();await runner.tick();await runner.tick();expect(engine.counts().sends).toBe(3);await engine.complete();await runner.tick();
  expect((await runner.status(w)).queue).toHaveLength(0);expect(await runner.receive(w,id,{key:"same",text:"A"})).toEqual({duplicate:true});
 }finally{await runner.stop();}
}));

test("connection loss before prompt forwarding blocks safely across restart without creating a second chat",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);const read=engine.client.getThreadSnapshot;let offline=true;
 engine.client.getThreadSnapshot=async(...args)=>{if(offline)throw Error("Injected pre-submit disconnect");return read(...args);};
 let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{await runner.tick();const initial=await runner.status(w);expect(engine.counts()).toEqual({creates:1,sends:0});await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});await runner.tick();expect(engine.counts().sends).toBe(0);offline=false;await runner.tick();expect(engine.counts()).toEqual({creates:1,sends:1});expect((await runner.status(w)).event?.id).toBe(initial.event?.id);}finally{await runner.stop();}
}));

test("lost accepted submission response remains blocked for explicit review without automatic replay",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);engine.uncertain();let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{await runner.tick();const initial=await runner.status(w);expect(initial.phase).toBe("interrupted");await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client});await engine.complete(true,{action:"send",text:"Original task completed"});await runner.tick();await runner.tick();expect(engine.counts().sends).toBe(1);expect(await runner.status(w)).toMatchObject({phase:"interrupted",event:{id:initial.event!.id,messageId:initial.event!.messageId,phase:"interrupted"}});expect(await readAlwaysOnOutbox(w)).toHaveLength(0);}finally{await runner.stop();}
}));

test("GitHub source binding persists, replays dedupe and identity is immutable",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);
 const runner=createAlwaysOnRunner(config,{client:()=>native(workspace).client});
 const id=crypto.randomUUID(),subscriptionId=crypto.randomUUID();
 try{
  await runner.saveSource(workspace,{id,kind:"github",name:"Repository",scope:"team/repo",subscriptionId,ownerUserId:"alice",repositoryId:11});
  expect((await runner.receive(workspace,id,{key:"delivery",text:"Issue opened"})).duplicate).toBe(false);
  expect((await runner.receive(workspace,id,{key:"delivery",text:"Issue opened"})).duplicate).toBe(true);
  await runner.recordSourceSync(workspace,id,{subscriptionId,ownerUserId:"alice",failed:true});
  expect((await runner.inbox(workspace)).sources[0]?.syncError).toBe(true);
  await runner.recordSourceSync(workspace,id,{subscriptionId,ownerUserId:"alice",failed:false});
  expect((await runner.inbox(workspace)).sources[0]?.lastSynced).toBeGreaterThan(0);
  await expect(runner.saveSource(workspace,{id:crypto.randomUUID(),kind:"github",name:"Changed",subscriptionId,ownerUserId:"alice",repositoryId:11},id)).rejects.toThrow();
  await runner.controlSource(workspace,id,"disable");
  await expect(runner.receive(workspace,id,{key:"next",text:"Next issue"})).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("connector sources persist binding and receive events without touching ordinary workspaces",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);let runner=createAlwaysOnRunner(config,{client:()=>native(w).client});
 const id=crypto.randomUUID(),subscriptionId=crypto.randomUUID();
 try{
  const source={id,kind:"connector",provider:"gmail",name:"Mail",scope:"Gmail",subscriptionId,ownerUserId:"alice"};
  await runner.saveSource(w,source);expect(await runner.receive(w,id,{key:"mail-1",text:"New mail"})).toMatchObject({duplicate:false});await runner.stop();
  runner=createAlwaysOnRunner(config,{client:()=>native(w).client});expect((await runner.inbox(w)).sources[0]).toMatchObject(source);
  expect(await runner.receive(w,id,{key:"mail-1",text:"New mail"})).toEqual({duplicate:true});
  await expect(runner.saveSource(w,{...source,ownerUserId:"bob"},id)).rejects.toThrow();
  await runner.recordSourceSync(w,id,{subscriptionId,ownerUserId:"alice",failed:false});
  await runner.controlSource(w,id,"delete");await expect(runner.receive(w,id,{key:"mail-2",text:"Next mail"})).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("host completion survives lost tool response, empty final and restart without replay or duplicate delivery", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace);
 const first = createAlwaysOnRunner(config, { client: () => engine.client });
 await first.tick();
 await engine.complete(false);
 const input = { outcome: "no_change", summary: "Verified without changes", artifacts: [], continuity: "Checked fixture", notification: { action: "send", text: "Check completed" } };
 await expect(first.complete(workspace, "wrong", "assistant_1", input)).rejects.toThrow();
 await expect(first.complete(workspace, "ses_fixture", "wrong", input)).rejects.toThrow();
 const receipt = await first.complete(workspace, "ses_fixture", "assistant_1", input);
 expect(receipt.status).toBe("committed");
 expect(await first.complete(workspace, "ses_fixture", "assistant_1", input)).toEqual(receipt);
 // Simulate the native tool returning no final text after the host committed.
 const get = engine.client.getThreadSnapshot;
 engine.client.getThreadSnapshot = async (...args) => {
  const snapshot = await get(...args);
  const answer = snapshot.messages.at(-1)!;
  answer.parts = []; answer.finish = "stop";
  return snapshot;
 };
 await first.stop();
 const second = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await second.tick(); await second.tick();
  const state = await second.status(workspace);
  expect(state.event?.phase).toBe("done");
  expect(state.event?.verification?.status).toBe("verified");
  expect(engine.counts().sends).toBe(1);
  expect(await readAlwaysOnOutbox(workspace)).toHaveLength(1);
  expect((await second.complete(workspace, "ses_fixture", "assistant_1", input)).eventId).toBe(receipt.eventId);
 } finally { await second.stop(); }
}));

test("empty final without completion exposes record repair and never reexecutes", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(false);
  const get = engine.client.getThreadSnapshot;
  engine.client.getThreadSnapshot = async (...args) => {
   const snapshot = await get(...args); snapshot.messages.at(-1)!.parts = []; snapshot.messages.at(-1)!.finish = "stop"; return snapshot;
  };
  await runner.tick();
  const state = await runner.status(workspace);
  expect(state.event?.phase).toBe("interrupted");
  expect(state.lastError).toContain("模型返回了空响应");
  expect(state.lastErrorCode).toBe("always_on_incomplete");
  expect((await runner.attention(workspace)).resultReview?.id).toBe(state.event!.id);
  await runner.tick(); expect(engine.counts().sends).toBe(1);
  await runner.reviewResult(workspace, state.event!.id, "repair");
  expect((await runner.status(workspace)).event?.repairCount).toBe(1);
 } finally { await runner.stop(); }
}));

test("receipt write failure never succeeds and a later identical commit does not rerun work", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(false);
  const state = await runner.status(workspace);
  const directory = join(workspace.path, ".get3w/always-on/completions");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${state.event!.id}.json`);
  await mkdir(path);
  const input = { outcome: "no_change", summary: "Local inspection complete", artifacts: [], continuity: "No change", notification: { action: "quiet" } };
  await expect(runner.complete(workspace, "ses_fixture", "assistant_1", input)).rejects.toThrow();
  await runner.tick();
  expect((await runner.status(workspace)).event?.verification?.status).not.toBe("verified");
  expect(await readAlwaysOnOutbox(workspace)).toHaveLength(0);
  expect(engine.counts().sends).toBe(1);
  await rm(path, { recursive: true });
  await runner.complete(workspace, "ses_fixture", "assistant_1", input);
  await runner.tick();
  expect((await runner.status(workspace)).event?.verification?.status).toBe("verified");
  expect(engine.counts().sends).toBe(1);
 } finally { await runner.stop(); }
}));

test("committed completion survives projection failure and observer disconnect without repeating work", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); let runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(false);
  await runner.complete(workspace, "ses_fixture", "assistant_1", { outcome: "no_change", summary: "Checked", artifacts: [], continuity: "Checked once", notification: { action: "quiet" } });
  const checkpoint = join(workspace.path, ".get3w/always-on/checkpoint.md");
  await mkdir(checkpoint);
  await runner.tick();
  expect((await runner.status(workspace)).event?.phase).not.toBe("done");
  expect(engine.counts().sends).toBe(1);
  await runner.stop(); await rm(checkpoint, { recursive: true });
  const get = engine.client.getThreadSnapshot; let offline = true;
  engine.client.getThreadSnapshot = async (...args) => { if (offline) throw Error("Disconnected at completion"); return get(...args); };
  runner = createAlwaysOnRunner(config, { client: () => engine.client });
  await runner.tick(); expect(engine.counts().sends).toBe(1);
  offline = false; await runner.tick();
  expect((await runner.status(workspace)).event?.verification?.status).toBe("verified");
  expect((await runner.status(workspace)).event?.phase).toBe("done");
  expect(engine.counts().sends).toBe(1);
 } finally { await runner.stop(); }
}));

test("idle without any assistant response offers record repair instead of success or automatic replay", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); engine.idleWithoutResult(); await runner.tick();
  const state = await runner.status(workspace);
  expect(state.event?.phase).toBe("interrupted");
  expect((await runner.attention(workspace)).resultReview?.id).toBe(state.event!.id);
  expect(engine.counts().sends).toBe(1);
  await expect(runner.control(workspace, "run")).rejects.toThrow();
  await expect(runner.control(workspace, "resume")).rejects.toThrow();
 } finally { await runner.stop(); }
}));

test("a transport error after a committed result does not invalidate completion or replay", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(false);
  const input = { outcome: "no_change", summary: "Verified", artifacts: [], continuity: "Completed once", notification: { action: "quiet" } };
  const receipt = await runner.complete(workspace, "ses_fixture", "assistant_1", input);
  const get = engine.client.getThreadSnapshot;
  engine.client.getThreadSnapshot = async (...args) => {
   const snapshot = await get(...args);
   snapshot.messages.at(-1)!.error = { name: "TransportError", message: "Connection ended after commit", retryable: false };
   snapshot.messages.at(-1)!.parts = []; return snapshot;
  };
  expect(await runner.complete(workspace, "ses_fixture", "assistant_1", input)).toEqual(receipt);
  await runner.tick();
  expect((await runner.status(workspace)).event?.phase).toBe("done");
  expect((await runner.status(workspace)).event?.verification?.status).toBe("verified");
  expect(engine.counts().sends).toBe(1);
 } finally { await runner.stop(); }
}));

test("record repair retains original deliverables when model submits no new files and never renotifies", () => fixture(async (config, workspace) => {
 await createAlwaysOnWorkspace(config, workspace, settings);
 const engine = native(workspace); const runner = createAlwaysOnRunner(config, { client: () => engine.client });
 try {
  await runner.tick(); await engine.complete(true);
  let state = await runner.status(workspace);
  const id = state.event!.id;
  const result = join(workspace.path, `.get3w/always-on/results/${id}.json`);
  await writeFile(join(workspace.path, "report.md"), "Original report");
  const data = JSON.parse(await readFile(result, "utf8")); data.artifacts = ["report.md"];
  await writeFile(result, JSON.stringify(data));
  await runner.tick();
  await rm(result); await runner.reviewResult(workspace, id, "verify");
  // The persisted run receipt can be older than the latest reviewed state.
  const runPath = join(workspace.path, `.get3w/always-on/runs/${id}.json`);
  const stale = JSON.parse(await readFile(runPath, "utf8")); delete stale.event.verification.artifacts;
  await writeFile(runPath, JSON.stringify(stale));
  await runner.reviewResult(workspace, id, "repair"); await runner.tick();
  await engine.complete(false);
  await runner.complete(workspace, "ses_fixture", "assistant_2", { outcome: "no_change", summary: "Records repaired", artifacts: [], continuity: "Existing report verified", notification: { action: "send", text: "Do not repeat" } });
  await runner.tick(); state = await runner.status(workspace);
  expect(state.event?.verification?.artifacts).toEqual(["report.md"]);
  expect(state.event?.verification?.notification).toEqual({ action: "quiet" });
  expect(await readFile(join(workspace.path, "report.md"), "utf8")).toBe("Original report");
  expect(await readAlwaysOnOutbox(workspace)).toHaveLength(0);
 } finally { await runner.stop(); }
}));

test("memory reads require the active assistant turn and do not change ordinary chat",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);const runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  const memory=await mutateAlwaysOnMemory(workspace,{action:"save",revision:0,title:"Preference",text:"BODY_SECRET"});
  await runner.tick();await engine.complete(false);
  const input={ids:[memory.notes[0]!.id]};
  await expect(runner.memoryRead(workspace,"ordinary","assistant_1",input)).rejects.toThrow();
  await expect(runner.memoryRead(workspace,"ses_fixture","wrong",input)).rejects.toThrow();
  expect((await runner.memoryRead(workspace,"ses_fixture","assistant_1",input)).entries[0]?.text).toBe("BODY_SECRET");
  await runner.complete(workspace,"ses_fixture","assistant_1",{outcome:"no_change",summary:"Checked",artifacts:[],continuity:"Checked once",notification:{action:"quiet"}});
  await expect(runner.memoryRead(workspace,"ses_fixture","assistant_1",input)).rejects.toThrow("completed");
 }finally{await runner.stop();}
}));

test("independent source tasks own sessions, related followups restore sessions and periodic checks reuse their task",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);let clock=Date.now();let creates=0;
 const sessions=new Map<string,ReturnType<typeof native>>();
 const bootstrap=native(workspace);
 const client:HeadlessThreadClient={...bootstrap.client,
  async createThread(input){const id=`ses_task_${++creates}`;sessions.set(id,native(workspace));return {id,workspaceId:workspace.id,title:input.title??"Task",directory:workspace.path,createdAt:clock,started:false,engine:"v2"};},
  async getThreadSnapshot(id){return sessions.get(id)!.client.getThreadSnapshot(id);},
  async getThreadPending(id){return sessions.get(id)!.client.getThreadPending(id);},
  async sendTurn(id,input){return sessions.get(id)!.client.sendTurn(id,input);},
 };
 let runner=createAlwaysOnRunner(config,{client:()=>client,now:()=>clock});
 try{
  await runner.tick();const check=(await runner.status(workspace)).sessionId!;await sessions.get(check)!.complete();await runner.tick();
  const checkTask=(await runner.timers(workspace)).currentTaskId!;
  const [source]=await runner.saveSource(workspace,{kind:"webhook",name:"Issues"});
  await runner.receive(workspace,source!.id,{key:"A",text:"Independent A"});await runner.tick();
  const a=(await runner.status(workspace)).sessionId!;expect(a).not.toBe(check);
  expect(sessions.get(a)!.prompts().join()).not.toContain('"id":"progress:current"');
  const taskA=(await runner.timers(workspace)).currentTaskId!;
  await sessions.get(a)!.complete();await runner.tick();
  const followupId=crypto.randomUUID();await runner.addFollowup(workspace,{id:followupId,text:"Continue A",dueAt:clock+1000,taskId:taskA});
  await runner.receive(workspace,source!.id,{key:"B",text:"Independent B"});await runner.tick();const b=(await runner.status(workspace)).sessionId!;expect(b).not.toBe(a);
  await sessions.get(b)!.complete();await runner.tick();
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>client,now:()=>clock});clock+=1001;
  await runner.tick();expect((await runner.status(workspace)).sessionId).toBe(a);expect(creates).toBe(3);
  expect(sessions.get(a)!.prompts()).toHaveLength(2);expect(sessions.get(a)!.prompts().at(-1)).toContain("progress:current");
  await sessions.get(a)!.complete();
  const {utimes}=await import("node:fs/promises");const active=(await runner.status(workspace)).event!;for(const path of [join(workspace.path,".get3w/always-on/checkpoint.md"),join(workspace.path,`.get3w/always-on/results/${active.id}.json`)])await utimes(path,new Date(clock+10),new Date(clock+10));
  await runner.tick();clock+=60001;await runner.tick();expect((await runner.status(workspace)).sessionId).toBe(check);expect(creates).toBe(3);
  expect((await runner.timers(workspace)).currentTaskId).toBe(checkTask);
  const inbox=await runner.inbox(workspace,0,followupId);expect(inbox.focusedRun?.sessionId).toBe(a);expect(inbox.focusedRun?.taskId).toBe(taskA);
  await expect(runner.addFollowup(workspace,{id:crypto.randomUUID(),text:"invalid task",dueAt:clock+1000,taskId:crypto.randomUUID()})).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("legacy task adoption is stable across reads and preserves its original session and queued identity",()=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);const engine=native(workspace);let runner=createAlwaysOnRunner(config,{client:()=>engine.client});
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(workspace,"pause");
  const file=join(workspace.path,".get3w/always-on/state.json");const legacy=JSON.parse(await readFile(file,"utf8"));delete legacy.tasks;delete legacy.checkTaskId;delete legacy.event.taskId;await writeFile(file,JSON.stringify(legacy));
  const first=await runner.timers(workspace);const second=await runner.timers(workspace);expect(first.currentTaskId).toBe(second.currentTaskId);expect(first.tasks[0]?.sessionId).toBe("ses_fixture");
  await runner.control(workspace,"run");await runner.tick();expect(engine.counts()).toEqual({creates:1,sends:2});
  const persisted=JSON.parse(await readFile(file,"utf8"));expect(persisted.tasks[0].id).toBe(first.currentTaskId);
 }finally{await runner.stop();}
}));

test.each(["answer","cancel","direct"])("durable suspended task supports %s while independent work executes and restart preserves ownership",mode=>fixture(async(config,workspace)=>{
 await createAlwaysOnWorkspace(config,workspace,settings);let creates=0;let activeResume=0;
 const sessions=new Map<string,ReturnType<typeof native>>();const bootstrap=native(workspace);
 const question={kind:"question" as const,requestId:"wait-A",questions:[{header:"Scope",question:"Which scope?",options:[],multiple:false,custom:true}]};
 let answered=false;let gate=true;let answerID="";
 const client:HeadlessThreadClient={...bootstrap.client,async createThread(){const id=`ses_wait_${++creates}`;sessions.set(id,native(workspace));return {id,workspaceId:workspace.id,title:"Task",directory:workspace.path,createdAt:0,started:false,engine:"v2"};},async getThreadSnapshot(id){return sessions.get(id)!.client.getThreadSnapshot(id);},async getThreadPending(id){return sessions.get(id)!.client.getThreadPending(id);},async sendTurn(id,input){return sessions.get(id)!.client.sendTurn(id,input);}};
 const original={sessionID:"ses_wait_1",messageID:"question-msg",callID:"call-wait",requestID:"wait-A",questions:question.questions};
 const deferred={async bind(_w:WorkspaceInfo,sessionID:string,paused:boolean){return {workspaceID:workspace.id,sessionID,paused};},async setPaused(_w:string,id:string,paused:boolean){if(id==="ses_wait_1")gate=paused;},async list(_w:string,id:string){return {binding:{workspaceID:workspace.id,sessionID:id,paused:gate},questions:id==="ses_wait_1"?[answered?{...original,status:"answered" as const,answerID,answers:[["reports"]],content:"reports"}:{...original,status:"waiting" as const}]:[]};},async read(){return {binding:{workspaceID:workspace.id,sessionID:original.sessionID,paused:gate},question:{...original,status:"committed" as const,answerID,answers:[["reports"]],content:"reports"}};},async answer(_w:string,input:{sessionID:string;answerID:string}){expect(input.sessionID).toBe("ses_wait_1");answered=true;answerID=input.answerID;return {...original,status:"answered" as const,answerID:input.answerID,answers:[["reports"]],content:"reports"};},async commit(){return true;},async resume(){activeResume++;expect((await sessions.get("ses_wait_2")!.client.getThreadSnapshot("ses_wait_2")).status.type).toBe("idle");sessions.get("ses_wait_1")!.pending(null);return true;},async cancel(){sessions.get("ses_wait_1")!.pending(null);return {...original,status:"cancelled" as const};}};
 let runner=createAlwaysOnRunner(config,{client:()=>client,deferred});
 try{
  await runner.tick();sessions.get("ses_wait_1")!.pending(question);
  const [source]=await runner.saveSource(workspace,{kind:"webhook",name:"Other task"});await runner.receive(workspace,source!.id,{key:"B",text:"Independent B"});
  await runner.tick();expect((await runner.status(workspace)).suspended).toHaveLength(1);expect(gate).toBe(true);
  await runner.tick();expect((await runner.status(workspace)).sessionId).toBe("ses_wait_2");expect(creates).toBe(2);
  const attention=await runner.attention(workspace);const item=attention.items.find(item=>item.requestId==="wait-A")!;expect(item.sessionId).toBe("ses_wait_1");
  await expect(runner.updateSettings(workspace,{...settings,goal:"Changed goal"})).rejects.toThrow("Answer suspended questions");
  if(mode==="cancel"){
    await runner.cancelQuestion(workspace,{eventId:item.eventId,sessionId:item.sessionId,requestId:item.requestId});
    expect((await runner.status(workspace)).suspended).toHaveLength(0);expect((await runner.status(workspace)).paused).toBe(false);expect((await runner.status(workspace)).sessionId).toBe("ses_wait_2");expect(activeResume).toBe(0);return;
  }
  if(mode==="direct"){answered=true;answerID=crypto.randomUUID();}
  else await runner.answerQuestion(workspace,{id:crypto.randomUUID(),eventId:item.eventId,sessionId:item.sessionId,request:{...question},answers:[["reports"]]});
  await runner.tick();expect(activeResume).toBe(0);expect((await runner.status(workspace)).sessionId).toBe("ses_wait_2");
  await sessions.get("ses_wait_2")!.complete();await runner.tick();await runner.control(workspace,"pause");await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>client,deferred});
  await runner.tick();expect(activeResume).toBe(0);await runner.control(workspace,"resume");
  await runner.tick();expect((await runner.status(workspace)).sessionId).toBe("ses_wait_1");expect(activeResume).toBe(1);expect(creates).toBe(2);expect(sessions.get("ses_wait_1")!.counts().sends).toBe(1);
 }finally{await runner.stop();}
}));

test("business schedules coalesce missed periods, preserve fixed cadence and never overlap an outstanding occurrence",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(w,"pause");
  const id=crypto.randomUUID();const dueAt=now+60000;
  await runner.addFollowup(w,{id,text:"Business check",dueAt,repeatMinutes:10,missedPolicy:"once"});
  now+=36*60000;await runner.tick();
  let timers=await runner.timers(w);expect(timers.followups[0]?.dueAt).toBe(dueAt+40*60000);expect((await runner.status(w)).queue.filter(item=>item.sourceId===id)).toHaveLength(1);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});now+=50*60000;await runner.tick();
  expect((await runner.status(w)).queue.filter(item=>item.sourceId===id)).toHaveLength(1);expect(engine.counts().sends).toBe(1);
  await runner.cancelFollowup(w,id);expect((await runner.timers(w)).followups[0]?.state).toBe("cancelled");
 }finally{await runner.stop();}
}));

test("skip policy skips late single followups and old recurring periods after pause; defaults still queue once",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(w,"pause");
  const single=crypto.randomUUID(),repeat=crypto.randomUUID();
  await runner.addFollowup(w,{id:single,text:"Expired check",dueAt:now+1000,missedPolicy:"skip"});
  await runner.addFollowup(w,{id:repeat,text:"Skip old periods",dueAt:now+1000,repeatMinutes:10,missedPolicy:"skip"});
  now+=35*60000;await runner.tick();expect((await runner.status(w)).queue).toHaveLength(0);
  await runner.control(w,"resume");await runner.tick();const timers=await runner.timers(w);
  expect(timers.followups.find(item=>item.id===single)?.state).toBe("skipped");expect(timers.followups.find(item=>item.id===repeat)?.dueAt).toBeGreaterThan(now);
  expect((await runner.status(w)).queue.some(item=>item.sourceId===repeat)).toBe(false);
 }finally{await runner.stop();}
}));

test("model followup suggestions remain inactive across restart until explicit user confirmation",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();const state=await runner.status(w);const user=(await engine.client.getThreadSnapshot(state.sessionId!)).messages[0]!;
  // A real completion caller must be an assistant descendant of the active user.
  await engine.complete();const snapshot=await engine.client.getThreadSnapshot(state.sessionId!);const assistant=snapshot.messages.find(item=>item.parentId===user.id)!;
  await runner.complete(w,state.sessionId!,assistant.id,{outcome:"no_change",summary:"Done",artifacts:[],continuity:"No pending operations",notification:{action:"quiet"},followupSuggestions:[{text:"Review tomorrow",dueAt:now+86400000}]});
  await runner.tick();let list=(await runner.timers(w)).followups;expect(list).toHaveLength(1);expect(list[0]?.state).toBe("suggested");const id=list[0]!.id;
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});await runner.tick();expect((await runner.timers(w)).followups).toHaveLength(1);
  await runner.confirmFollowup(w,id);expect((await runner.timers(w)).followups[0]?.state).toBe("scheduled");await runner.control(w,"pause");now+=86400001;await runner.tick();
  expect((await runner.status(w)).queue.filter(item=>item.id===id)).toHaveLength(1);
 }finally{await runner.stop();}
}));

test("same-source same-task bursts execute once and every original links to the shared outcome across restart",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();
  const [source]=await runner.saveSource(w,{kind:"webhook",name:"Grouped",mergeWindowSeconds:5});
  const first=await runner.receive(w,source!.id,{key:"1",text:"First update",taskKey:"issue-42"});now+=1000;
  const second=await runner.receive(w,source!.id,{key:"2",text:"Second update",taskKey:"issue-42"});
  expect(first.merged).toBe(false);expect(second.merged).toBe(true);expect(second.batchId).toBe(first.eventId);
  expect((await runner.status(w)).queue).toHaveLength(1);expect((await runner.inbox(w)).pending).toHaveLength(2);
  await runner.tick();expect(engine.counts().sends).toBe(1);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});now+=4000;await runner.tick();
  expect(engine.counts().sends).toBe(2);const prompt=engine.prompts().at(-1)!;expect(prompt).toContain("First update");expect(prompt).toContain("Second update");expect(prompt).toContain(first.eventId!);expect(prompt).toContain(second.eventId!);
  expect(await runner.receive(w,source!.id,{key:"2",text:"Do not replay",taskKey:"issue-42"})).toEqual({duplicate:true});
  await engine.complete(true,{action:"send",text:"Combined result"});
  for(const path of [join(w.path,`.get3w/always-on/results/${first.eventId}.json`),join(w.path,".get3w/always-on/checkpoint.md")])await utimes(path,new Date(now),new Date(now));
  await runner.tick();await runner.tick();
  const inbox=await runner.inbox(w,0,second.eventId);expect(inbox.focusedRun).toMatchObject({id:second.eventId,batchId:first.eventId,batchSize:2,phase:"done",text:"Second update"});
  expect(inbox.history.filter(item=>item.batchId===first.eventId)).toHaveLength(2);expect((await readAlwaysOnOutbox(w)).filter(item=>item.id===first.eventId)).toHaveLength(1);
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});expect((await runner.inbox(w,0,first.eventId)).focusedRun?.batchSize).toBe(2);
 }finally{await runner.stop();}
}));

test("grouping respects source, task, fixed window, disabled setting and execution boundary",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();
  const sources=await runner.saveSource(w,{kind:"webhook",name:"One",mergeWindowSeconds:5});const a=sources[0]!;
  const b=(await runner.saveSource(w,{kind:"webhook",name:"Two",mergeWindowSeconds:5})).at(-1)!;
  await runner.receive(w,a.id,{key:"1",text:"A",taskKey:"shared"});
  await runner.receive(w,a.id,{key:"2",text:"Different task",taskKey:"other"});
  await runner.receive(w,b.id,{key:"3",text:"Different source",taskKey:"shared"});
  await runner.receive(w,a.id,{key:"4",text:"No task"});await runner.receive(w,a.id,{key:"5",text:"No task again"});
  expect((await runner.status(w)).queue).toHaveLength(5);
  now+=4999;await runner.receive(w,a.id,{key:"6",text:"Within first fixed window",taskKey:"shared"});expect((await runner.status(w)).queue).toHaveLength(5);
  now+=1;await runner.receive(w,a.id,{key:"7",text:"Outside window",taskKey:"shared"});expect((await runner.status(w)).queue).toHaveLength(6);
  await runner.tick();const running=await runner.status(w);expect(running.event?.batch?.members).toHaveLength(2);
  await runner.receive(w,a.id,{key:"8",text:"Later batch",taskKey:"shared"});expect((await runner.status(w)).event?.batch?.members).toHaveLength(2);
  await runner.saveSource(w,{kind:"webhook",name:a.name,mergeWindowSeconds:0},a.id);
  await runner.receive(w,a.id,{key:"9",text:"Disabled",taskKey:"shared"});expect((await runner.status(w)).queue.at(-1)?.batch).toBeUndefined();
  await expect(runner.saveSource(w,{kind:"webhook",name:"Invalid",mergeWindowSeconds:61})).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("group size and bytes are bounded without losing originals or extending the collection deadline",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await runner.control(w,"pause");const [source]=await runner.saveSource(w,{kind:"webhook",name:"Burst",mergeWindowSeconds:60});
  for(let i=0;i<21;i++)await runner.receive(w,source!.id,{key:String(i),text:`Update ${i}`,taskKey:"same"});
  let queued=(await runner.status(w)).queue;expect(queued).toHaveLength(2);expect(queued[0]?.batch?.members).toHaveLength(20);expect(queued[1]?.batch?.members).toHaveLength(1);
  for(let i=0;i<5;i++)await runner.receive(w,source!.id,{key:`large${i}`,text:"x".repeat(16000),taskKey:"large"});
  queued=(await runner.status(w)).queue;expect(queued.filter(item=>item.batch?.members.some(row=>row.text.length===16000))).toHaveLength(2);
  expect((await runner.inbox(w)).pending).toHaveLength(26);
  await expect(runner.receive(w,source!.id,{key:"bad",text:"Invalid task",taskId:crypto.randomUUID()})).rejects.toThrow();
 }finally{await runner.stop();}
}));

test("merged failure preserves every original and file bursts share only their own source task",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();
  await mkdir(join(w.path,"watched"));await writeFile(join(w.path,"watched/a.txt"),"A");
  const [source]=await runner.saveSource(w,{kind:"files",name:"Files",scope:"watched",mergeWindowSeconds:5});
  await writeFile(join(w.path,"watched/a.txt"),"changed first");await runner.tick();now+=1000;
  await writeFile(join(w.path,"watched/a.txt"),"changed second with more bytes");await runner.tick();
  expect((await runner.status(w)).queue).toHaveLength(1);expect((await runner.status(w)).queue[0]?.batch?.members).toHaveLength(2);
  now+=4000;await runner.tick();engine.idleWithoutResult();await runner.tick();
  const inbox=await runner.inbox(w);expect(inbox.history.filter(row=>row.sourceId===source!.id)).toHaveLength(2);expect(inbox.history.filter(row=>row.sourceId===source!.id).every(row=>row.phase==="interrupted")).toBe(true);
 }finally{await runner.stop();}
}));

test("an earlier collecting batch blocks only its own task, even if a later event disables grouping",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 try{
  await runner.tick();await engine.complete();await runner.tick();
  const [source]=await runner.saveSource(w,{kind:"webhook",name:"Order",mergeWindowSeconds:60});
  const first=await runner.receive(w,source!.id,{key:"1",text:"First",taskKey:"same"});
  await runner.saveSource(w,{kind:"webhook",name:"Order",mergeWindowSeconds:0},source!.id);
  await runner.receive(w,source!.id,{key:"2",text:"Later same",taskKey:"same"});
  const other=await runner.receive(w,source!.id,{key:"3",text:"Independent",taskKey:"other"});
  await runner.tick();expect((await runner.status(w)).event?.id).toBe(other.eventId);await engine.complete();await runner.tick();
  await runner.tick();expect((await runner.status(w)).queue).toHaveLength(2);
  now+=60000;await runner.tick();expect((await runner.status(w)).event?.id).toBe(first.eventId);
 }finally{await runner.stop();}
}));

test("task calendar schedules persist, coalesce offline dates and retain Shanghai wall time",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.parse("2026-11-22T00:00:00Z");let runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 const id=crypto.randomUUID();const calendar={kind:"daily",at:"09:00",timeZone:"Asia/Shanghai"};
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(w,"pause");
  const input={id,text:"Publish prepared report",dueAt:Date.parse("2026-11-22T01:00:00Z"),calendar};
  await runner.addFollowup(w,input);await runner.addFollowup(w,input);
  await expect(runner.addFollowup(w,{...input,calendar:{...calendar,at:"10:00"}})).rejects.toThrow();
  await expect(runner.addFollowup(w,{...input,id:crypto.randomUUID(),repeatMinutes:1440})).rejects.toThrow();
  now=Date.parse("2026-11-25T04:00:00Z");await runner.tick();
  let state=await runner.status(w);expect(state.queue.filter(item=>item.sourceId===id)).toHaveLength(1);
  expect(state.queue.find(item=>item.sourceId===id)?.createdAt).toBe(Date.parse("2026-11-25T01:00:00Z"));
  expect((await runner.timers(w)).followups[0]?.dueAt).toBe(Date.parse("2026-11-26T01:00:00Z"));
  await runner.stop();runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});await runner.tick();
  expect((await runner.status(w)).queue.filter(item=>item.sourceId===id)).toHaveLength(1);
  now=Date.parse("2026-11-27T02:00:00Z");await runner.tick();state=await runner.status(w);
  expect(state.queue.filter(item=>item.sourceId===id)).toHaveLength(1);
  expect(state.queue.find(item=>item.sourceId===id)?.createdAt).toBe(Date.parse("2026-11-27T01:00:00Z"));
  await runner.control(w,"resume");await runner.tick();expect(engine.counts().sends).toBe(2);
  const dispatched=engine.prompts().at(-1)!;
  expect(dispatched).toContain("Trusted saved runtime configuration");
  expect(dispatched).toContain(JSON.stringify({kind:"daily",at:"09:00",timeZone:"Asia/Shanghai"}));
  expect(dispatched).toContain('"dueAt":'+Date.parse("2026-11-28T01:00:00Z"));
  expect(dispatched).toContain('"intervalMinutes":'+settings.intervalMinutes);
  expect(dispatched).toContain("A saved schedule does not prove it ran or delivered");

  await runner.tick();expect(engine.counts().sends).toBe(2);
 }finally{await runner.stop();}
}));

test("calendar validation and skip policy do not accept mismatched dates or replay late work",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);let now=Date.parse("2026-11-22T00:00:00Z");const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 const calendar={kind:"daily",at:"09:00",timeZone:"Asia/Shanghai"};
 try{
  await runner.tick();await engine.complete();await runner.tick();await runner.control(w,"pause");
  await expect(runner.addFollowup(w,{id:crypto.randomUUID(),text:"Invalid first occurrence",dueAt:Date.parse("2026-11-22T02:00:00Z"),calendar})).rejects.toThrow("First occurrence");
  await expect(runner.addFollowup(w,{id:crypto.randomUUID(),text:"Invalid zone",dueAt:Date.parse("2026-11-22T01:00:00Z"),calendar:{...calendar,timeZone:"invalid"}})).rejects.toThrow();
  const id=crypto.randomUUID();await runner.addFollowup(w,{id,text:"Skip late check",dueAt:Date.parse("2026-11-22T01:00:00Z"),calendar,missedPolicy:"skip"});
  now=Date.parse("2026-11-25T04:00:00Z");await runner.control(w,"resume");await runner.tick();
  expect((await runner.timers(w)).followups[0]?.dueAt).toBe(Date.parse("2026-11-26T01:00:00Z"));
  expect((await runner.status(w)).queue.some(item=>item.sourceId===id)).toBe(false);
 }finally{await runner.stop();}
}));
test("workspace settings strip scenario-specific fields",()=>{
 const parsed=alwaysOnSettingsSchema.parse({...settings,dailyBriefing:{timeZone:"Asia/Shanghai",sendAt:"09:00"}});
 expect(Reflect.has(parsed,"dailyBriefing")).toBe(false);
});

test("verified prepared results retain scheduled delivery metadata and revisions share one outbox identity",()=>fixture(async(config,w)=>{
 await createAlwaysOnWorkspace(config,w,settings);const engine=native(w);const now=Date.now();const runner=createAlwaysOnRunner(config,{client:()=>engine.client,now:()=>now});
 const notification={action:"send" as const,text:"Prepared report",notBefore:now+60000,expiresAt:now+86400000,dedupeKey:"instance:date:system"};
 try{
  await runner.tick();const first=(await runner.status(w)).event!.id;
  await engine.complete(true,notification);await runner.tick();await runner.tick();
  const initial=await readAlwaysOnOutbox(w);expect(initial).toHaveLength(1);expect(initial[0]).toMatchObject({resultId:first,notBefore:notification.notBefore,expiresAt:notification.expiresAt,attempts:0,status:"pending"});
  await runner.control(w,"run");await runner.tick();await engine.complete(true,{...notification,text:"Revised report"});await runner.tick();await runner.tick();
  const revised=await readAlwaysOnOutbox(w);expect(revised).toHaveLength(1);expect(revised[0]?.resultId).toBe(first);expect(revised[0]?.text).toBe("Prepared report");
 }finally{await runner.stop();}
}));

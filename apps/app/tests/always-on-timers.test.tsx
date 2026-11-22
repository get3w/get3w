import { beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { AlwaysOnFollowup } from "@get3w/types/workspace";
import { act } from "react";
import { setLocale } from "../src/i18n";
let AlwaysOnTimersPage: typeof import("../src/react-app/domains/workspace/always-on-timers-page")["AlwaysOnTimersPage"];
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async () => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost" }); Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true); setLocale("zh"); createRoot = (await import("react-dom/client")).createRoot; AlwaysOnTimersPage = (await import("../src/react-app/domains/workspace/always-on-timers-page")).AlwaysOnTimersPage; });
test("timers reads real paused state and cancels persisted follow-ups", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const requests: string[] = []; let settingsOpened = false;
  const cancellations: string[] = [];
  const client = { cancelAlwaysOnFollowup: async (_workspace: string, id: string): Promise<AlwaysOnFollowup> => { cancellations.push(id); return { id, text: "Check report", dueAt: 1234, createdAt: 1, state: "cancelled" }; }, addAlwaysOnFollowup: async () => { throw Error("not called"); }, alwaysOnTimers: async (id: string): Promise<import("@get3w/types/workspace").AlwaysOnTimers> => { requests.push(id); return { followups: [{ id: "followup_1", text: "Check report", dueAt: 1234, createdAt: 1, state: "scheduled" }], status: { settings: { goal: "Monitor reports", intervalMinutes: 45, fullAccess: false, costAuto: false, costLimit: "7" }, paused: true, phase: "idle", sessionId: null, nextRunAt: 1234, lastError: null } }; } };
  try {
    await act(async () => root.render(<AlwaysOnTimersPage client={client} workspaceId="ws_test" onOpenEvent={() => {}} onClose={() => {}} onOpenSettings={() => { settingsOpened = true; }} />));
    expect(requests).toEqual(["ws_test"]);
    expect(host.textContent).toContain("45"); expect(host.textContent).toContain("已暂停"); expect(host.textContent).toContain("Check report"); expect(host.textContent).not.toContain("界面预览");
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.find(button => button.textContent === "取消跟进")?.disabled).toBe(false);
    await act(async () => buttons.find(button => button.textContent === "取消跟进")?.click()); expect(cancellations).toEqual(["followup_1"]);
    await act(() => buttons.find(button => button.textContent === "检查设置")?.click()); expect(settingsOpened).toBe(true);
  } finally { await act(() => root.unmount()); host.remove(); }
});
test("timers fails visibly instead of presenting a fabricated schedule", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<AlwaysOnTimersPage client={null} workspaceId="ws_test" onOpenEvent={() => {}} onClose={() => {}} onOpenSettings={() => {}} />));
    expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).toContain("重新加载");
    expect(host.querySelector('section[aria-label="定期检查"]')).toBeNull();
  } finally { await act(() => root.unmount()); host.remove(); }
});
test("follow-up editor uses calendar and time choices, saves once and shows persisted result", async () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const followups: AlwaysOnFollowup[] = [];
 const client = {
  alwaysOnTimers: async () => ({ followups: [...followups], status: { settings: { goal: "Fixture", intervalMinutes: 60, fullAccess: false, costAuto: false, costLimit: "7" }, paused: true, phase: "idle" as const, sessionId: null, nextRunAt: null, lastError: null } }),
  addAlwaysOnFollowup: async (_: string, input: Pick<AlwaysOnFollowup,"id"|"text"|"dueAt">) => { const item: AlwaysOnFollowup = {...input, createdAt: Date.now(), state:"scheduled"}; followups.push(item); return item; },
  cancelAlwaysOnFollowup: async (_: string, id: string) => { const item=followups.find(item=>item.id===id)!; item.state="cancelled"; return item; },
 };
 try {
  await act(async()=>root.render(<AlwaysOnTimersPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenEvent={()=>{}}/>));
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("添加跟进"))?.click());
  expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  expect(document.querySelector('[aria-label="日期"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="小时"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="分钟"]')).not.toBeNull();
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="日期"]')?.click());
  expect(document.querySelector('[aria-label="上一月"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="下一月"]')).not.toBeNull();
  expect(document.querySelector('[aria-label*="Go to"]')).toBeNull();
  const days=[...document.querySelectorAll<HTMLButtonElement>('[data-day] button')].filter(button=>!button.disabled);
  expect(days.length).toBeGreaterThan(0);
  await act(async()=>days.at(-1)?.click());
  expect(document.querySelector('[data-day]')).toBeNull();
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="小时"]')?.click());
  const hourOption=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent==="15");
  expect(hourOption).toBeDefined();
  await act(async()=>{ hourOption?.dispatchEvent(new PointerEvent("pointerdown",{pointerType:"touch",bubbles:true,button:0})); hourOption?.click(); });
  expect(document.querySelector('[aria-label="小时"]')?.textContent).toContain("15");
  const area=document.querySelector("textarea");
  await act(async()=>{ if(area){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(area,"核验报告");area.dispatchEvent(new Event("input",{bubbles:true}));area.dispatchEvent(new Event("change",{bubbles:true}));} });
  await act(async()=>document.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(followups).toHaveLength(1); expect(followups[0]?.text).toBe("核验报告"); expect(followups[0]!.dueAt).toBeGreaterThan(Date.now());
  expect(host.textContent).toContain("核验报告");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="取消跟进")?.click());
  expect(host.textContent).toContain("已取消");
 } finally {await act(()=>root.unmount());host.remove();}
});

test("followup task selector lists persisted tasks and defaults to current task",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const tasks=[{id:"task-a",title:"Issue A",sessionId:"session-a"},{id:"task-b",title:"Issue B",sessionId:"session-b"}];
 const client={alwaysOnTimers:async()=>({tasks,currentTaskId:"task-a",followups:[],status:{settings:{goal:"Fixture",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7"},paused:true,phase:"idle" as const,sessionId:"session-a",nextRunAt:null,lastError:null}}),addAlwaysOnFollowup:async()=>{throw Error("not called");},cancelAlwaysOnFollowup:async()=>{throw Error("not called");}};
 try{
  await act(async()=>root.render(<AlwaysOnTimersPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenEvent={()=>{}}/>));
  await act(()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("添加跟进"))?.click());
  expect(document.querySelector('[aria-label="关联任务"]')?.textContent).toContain("Issue A");
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="关联任务"]')?.click());
  expect(document.body.textContent).toContain("Issue B");
 }finally{await act(()=>root.unmount());host.remove();}
});

test("separates recurring plans, single followups and inactive model suggestions; confirmation activates only the chosen suggestion",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const confirmed:string[]=[];
 const followups:AlwaysOnFollowup[]=[{id:"business",text:"Daily business review",dueAt:Date.now()+3600000,createdAt:1,state:"scheduled",repeatMinutes:1440,missedPolicy:"skip"},{id:"suggestion",text:"Suggested check",dueAt:Date.now()+86400000,createdAt:1,state:"suggested"}];
 const client={alwaysOnTimers:async()=>({followups:[...followups],status:{settings:{goal:"Fixture",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7"},paused:true,phase:"idle" as const,sessionId:null,nextRunAt:null,lastError:null}}),addAlwaysOnFollowup:async()=>{throw Error("not called");},cancelAlwaysOnFollowup:async()=>{throw Error("not called");},confirmAlwaysOnFollowup:async(_:string,id:string)=>{confirmed.push(id);const item=followups.find(row=>row.id===id)!;item.state="scheduled";return item;}};
 try{
  await act(()=>root.render(<AlwaysOnTimersPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenEvent={()=>{}}/>));
  expect(host.querySelector('section[aria-label="业务周期计划"]')?.textContent).toContain("Daily business review");expect(host.querySelector('section[aria-label="单次跟进"]')?.textContent).not.toContain("Suggested check");
  expect(host.querySelector('section[aria-label="待确认跟进"]')?.textContent).toContain("Suggested check");
  await act(()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="确认跟进")?.click());
  expect(confirmed).toEqual(["suggestion"]);expect(host.querySelector('section[aria-label="单次跟进"]')?.textContent).toContain("Suggested check");
 }finally{await act(()=>root.unmount());host.remove();}
});

test("daily business plan saves a task-local calendar and displays its timezone",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const followups:AlwaysOnFollowup[]=[];
 const client={alwaysOnTimers:async()=>({followups:[...followups],status:{settings:{goal:"Fixture",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7"},paused:true,phase:"idle" as const,sessionId:null,nextRunAt:null,lastError:null}}),addAlwaysOnFollowup:async(_:string,input:Pick<AlwaysOnFollowup,"id"|"text"|"dueAt"|"calendar"|"repeatMinutes">)=>{const row:AlwaysOnFollowup={...input,createdAt:Date.now(),state:"scheduled"};followups.push(row);return row;},cancelAlwaysOnFollowup:async()=>{throw Error("unused");}};
 try{
  await act(()=>root.render(<AlwaysOnTimersPage client={client} workspaceId="isolated" onClose={()=>{}} onOpenSettings={()=>{}} onOpenEvent={()=>{}}/>));
  await act(()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("添加周期计划"))?.click());
  if(!document.querySelector('[aria-label="重复方式"]'))throw Error("Business editor missing");
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="重复方式"]')?.click());
  await act(()=>{const option=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent==="每日");option?.dispatchEvent(new PointerEvent("pointerdown",{pointerType:"touch",bubbles:true,button:0}));option?.click();});
  expect(document.querySelector('input[type="time"]')).toBeNull();
  expect(document.querySelector("[data-time-picker]")).not.toBeNull();
  const area=document.querySelector("textarea");
  await act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(area,"Prepare a report");area?.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(()=>document.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(followups).toHaveLength(1);expect(followups[0]?.calendar?.kind).toBe("daily");expect(followups[0]?.repeatMinutes).toBeUndefined();
  expect(host.querySelector('section[aria-label="业务周期计划"]')?.textContent).toContain(followups[0]!.calendar!.timeZone);
  expect(host.querySelector('section[aria-label="单次跟进"]')?.textContent).not.toContain("Prepare a report");
 }finally{await act(()=>root.unmount());host.remove();}
});

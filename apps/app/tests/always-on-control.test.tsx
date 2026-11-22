import { beforeAll, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { MemoryRouter } from "react-router";
import type { AlwaysOnStatus } from "@get3w/types/workspace";
import { setLocale } from "../src/i18n";
import { createGet3wServerClient, Get3wServerError } from "../src/app/lib/get3w-server";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import { AlwaysOnWorkspaceControl } from "../src/react-app/domains/workspace/always-on-workspace-control";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;});
test("retry state has translated guidance and a single full-width pause/resume control",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const actions:unknown[]=[];
 const status:AlwaysOnStatus={settings:{goal:"检查新闻",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:1},paused:false,phase:"queued",sessionId:"ses_test",nextRunAt:null,lastError:"This connection is saved, but its tools are not ready yet. Retry.",lastErrorCode:"mcp_tools_not_ready",retryAt:Date.now()+30000};
 const client=createGet3wServerClient({baseUrl:"http://fixture",token:"test"});
 client.alwaysOnStatus=async()=>status;
 client.controlAlwaysOn=async(_id,action)=>{actions.push(action);return{...status,paused:action==="pause"};};
 try{
  await act(async()=>root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="ws_test" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="ws_test"/></WorkspaceProvider></MemoryRouter>));
  expect(host.textContent).toContain("等待重试");expect(host.textContent).toContain("下次重试");expect(host.textContent).not.toContain("This connection");
  const buttons=[...host.querySelectorAll("button")];expect(buttons).toHaveLength(1);expect(host.textContent).not.toContain("立即运行");expect(host.textContent).not.toContain("查看运行");
  expect(buttons[0]?.classList.contains("w-full")).toBe(true);
  await act(async()=>buttons[0]?.click());expect(actions).toContain("pause");expect(host.textContent).toContain("已暂停");
  expect(buttons[0]?.textContent).toBe("恢复");await act(async()=>buttons[0]?.click());expect(actions).toContain("resume");expect(buttons[0]?.textContent).toBe("暂停");
 }finally{await act(()=>root.unmount());host.remove();}
});

test("missing state reports recovery guidance and never offers resume", async () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const client = createGet3wServerClient({ baseUrl: "http://fixture", token: "test" });
 client.alwaysOnStatus = async () => { throw new Get3wServerError(409, "always_on_state_missing", "持续运行数据缺失，请从备份恢复后重试。"); };
 try {
  await act(async () => root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="ws_test" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="ws_test"/></WorkspaceProvider></MemoryRouter>));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("数据缺失");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("从备份恢复");
  expect(host.querySelectorAll("button")).toHaveLength(0);
 } finally { await act(() => root.unmount()); host.remove(); }
});

test("blocked workspace offers explicit continuation and clears failure after acceptance", async () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const status: AlwaysOnStatus = { settings: { goal: "检查新闻", fullAccess: false, costAuto: false, costLimit: "7.00", intervalMinutes: 1 }, paused: false, phase: "error", sessionId: "ses_test", nextRunAt: null, lastError: "Get3W inference unavailable. Check model usage before trying again." };
 const client = createGet3wServerClient({ baseUrl: "http://fixture", token: "test" });
 const actions: string[] = [];
 client.alwaysOnStatus = async () => status;
 client.controlAlwaysOn = async (_id, action) => { actions.push(action); return { ...status, phase: "queued", lastError: null }; };
 try {
  await act(async () => root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="ws_test" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="ws_test" /></WorkspaceProvider></MemoryRouter>));
  const button = [...host.querySelectorAll("button")].find(item => item.textContent === "继续运行");
  expect(button).toBeDefined(); expect(host.textContent).toContain("暂停");
  await act(async () => button?.click()); expect(actions).toEqual(["run"]);
  expect(host.textContent).not.toContain("继续运行"); expect(host.textContent).not.toContain("请求未完成");
 } finally { await act(() => root.unmount()); host.remove(); }
});

test("scheduled timer recovery shows its time without offering duplicate continuation", async () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const client = createGet3wServerClient({ baseUrl: "http://fixture", token: "test" });
 client.alwaysOnStatus = async () => ({ settings: { goal: "检查新闻", fullAccess: false, costAuto: false, costLimit: "7.00", intervalMinutes: 1 }, paused: false, phase: "error", sessionId: "ses_test", nextRunAt: Date.now() + 60000, lastError: "Temporary failure" });
 try {
  await act(async () => root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="ws_test" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="ws_test" /></WorkspaceProvider></MemoryRouter>));
  expect(host.querySelector('[role="status"]')?.textContent).toBe("等待重试");
  expect(host.textContent).toContain("下次重试"); expect(host.textContent).not.toContain("继续运行");
  expect(host.querySelectorAll("button")).toHaveLength(1);
 } finally { await act(() => root.unmount()); host.remove(); }
});

test("incomplete result shows a blocked state and links to attention instead of rerunning",async()=>{
 const host=document.createElement("div");const root=createRoot(host);const client=createGet3wServerClient({baseUrl:"http://fixture",token:"test"});let opened=false;
 client.alwaysOnStatus=async()=>({settings:{goal:"Check",fullAccess:false,costAuto:false,costLimit:"0",intervalMinutes:1},paused:false,phase:"idle",sessionId:"s",nextRunAt:null,lastError:null,event:{id:"e",messageId:"m",kind:"timer",phase:"done",createdAt:1,finishedAt:2,verification:{status:"needs_review",checkedAt:2,issues:["result_invalid"]}}});
 try{await act(async()=>root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="w" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="w" onOpenAttention={()=>{opened=true;}}/></WorkspaceProvider></MemoryRouter>));expect(host.querySelector('[role="status"]')?.textContent).toContain("运行已阻塞");expect(host.textContent).not.toContain("继续运行");await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="待你处理")?.click());expect(opened).toBe(true);}finally{await act(()=>root.unmount());}
});


test("idle workspace can explicitly run updated instructions without changing its schedule", async () => {
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const status: AlwaysOnStatus = { settings: { goal: "修订来源核验规则", fullAccess: false, costAuto: false, costLimit: "7.00", intervalMinutes: 120 }, paused: false, phase: "idle", sessionId: "ses_test", nextRunAt: Date.now() + 60000, lastError: null };
 const client = createGet3wServerClient({ baseUrl: "http://fixture", token: "test" });
 let resolveRun: ((value: AlwaysOnStatus) => void) | undefined;
 const actions: string[] = [];
 client.alwaysOnStatus = async () => status;
 client.controlAlwaysOn = async (_id, action) => { actions.push(action); return new Promise<AlwaysOnStatus>(resolve => { resolveRun = resolve; }); };
 try {
  await act(async () => root.render(<MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId="ws_test" selectedWorkspaceRoot=""><AlwaysOnWorkspaceControl workspaceId="ws_test" /></WorkspaceProvider></MemoryRouter>));
  const run = [...host.querySelectorAll("button")].find(button => button.textContent === "立即运行");
  expect(run).toBeDefined();
  await act(async () => run?.click());
  expect(run?.disabled).toBe(true);
  await act(async () => run?.click());
  expect(actions).toEqual(["run"]);
  await act(async () => resolveRun?.({ ...status, phase: "queued", nextRunAt: null }));
  expect(host.textContent).not.toContain("立即运行");
  expect(status.settings.intervalMinutes).toBe(120);
 } finally { await act(() => root.unmount()); host.remove(); }
});

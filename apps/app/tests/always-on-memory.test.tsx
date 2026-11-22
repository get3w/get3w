import { beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { setLocale } from "../src/i18n";
import type { AlwaysOnMemory, AlwaysOnMemoryChange } from "@get3w/types/workspace";
import { Get3wServerError } from "../src/app/lib/get3w-server";
let Page: typeof import("../src/react-app/domains/workspace/always-on-memory-page")["AlwaysOnMemoryPage"];
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async () => {
 if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost" });
 Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true); setLocale("zh");
 createRoot = (await import("react-dom/client")).createRoot;
 Page = (await import("../src/react-app/domains/workspace/always-on-memory-page")).AlwaysOnMemoryPage;
});
const memoryClient = { alwaysOnMemory: async (): Promise<AlwaysOnMemory> => ({ version: 1, revision: 0, useNotes: true, notes: [] }), changeAlwaysOnMemory: async (_: string, _change: AlwaysOnMemoryChange): Promise<AlwaysOnMemory> => { throw Error("not called"); } };
const status = { settings: { goal: "Fixture", intervalMinutes: 60, fullAccess: false, costAuto: false, costLimit: "7" }, paused: true, phase: "idle" as const, sessionId: null, nextRunAt: null, lastError: null };
test("memory shows actual checkpoint read-only, filters categories and opens authoritative settings", async () => {
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const reads:string[]=[];let opened=false;
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async(id:string,path:string)=>{reads.push(`${id}:${path}`);return {path,content:"已核对报告，等待下一次检查。",bytes:48,updatedAt:1000};}};
 try {
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{opened=true;}}/>));
  expect(reads).toEqual(["fixture:.get3w/always-on/checkpoint.md"]);
  expect(host.textContent).toContain("已核对报告");expect(host.textContent).toContain("只读");expect(host.querySelector("textarea")).toBeNull();
  expect([...host.querySelectorAll("button")].find(b=>b.textContent==="新增")?.disabled).toBe(false);
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="偏好与纠正")?.click());
  expect(host.textContent).toContain("尚无偏好与纠正");expect(host.textContent).not.toContain("已核对报告");
  await act(()=>host.querySelector<HTMLButtonElement>('[role="tab"][data-slot="tabs-trigger"]:last-child')?.click());
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="持续运行设置")?.click());expect(opened).toBe(true);
  expect(host.textContent).not.toContain("尚未开放");expect(host.querySelector('[role="switch"]')).not.toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});
test("missing checkpoint is empty, other read failures are errors", async()=>{
 for(const missing of [true,false]){
  const host=document.createElement("div");const root=createRoot(host);
  try{
   await act(async()=>root.render(<Page workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} client={{...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(missing?404:403,missing?"file_not_found":"forbidden","Denied");}}}/>));
   expect(Boolean(host.querySelector('[role="alert"]'))).toBe(!missing);
   if(missing)expect(host.textContent).toContain("尚无任务进度");else expect(host.textContent).not.toContain("尚无任务进度");
  }finally{await act(()=>root.unmount());}
 }
});
test("rejected workspace status never reads files",async()=>{
 const host=document.createElement("div");const root=createRoot(host);let reads=0;
 try{
  await act(async()=>root.render(<Page workspaceId="local" onClose={()=>{}} onOpenSettings={()=>{}} client={{...memoryClient,alwaysOnStatus:async()=>{throw Error("not found");},readWorkspaceFile:async()=>{reads++;throw Error("must not read");}}}/>));
  expect(reads).toBe(0);expect(host.querySelector('[role="alert"]')).not.toBeNull();
 }finally{await act(()=>root.unmount());}
});
test("manual note editor persists content and displays saved state",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 let memory:AlwaysOnMemory={version:1,revision:0,useNotes:true,notes:[]};const writes:AlwaysOnMemoryChange[]=[];
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async()=>memory,changeAlwaysOnMemory:async(_:string,input:AlwaysOnMemoryChange)=>{writes.push(input);if(input.action==="save")memory={...memory,revision:1,notes:[{id:"f7a394c1-abd0-4c53-b827-42e763140688",text:input.text,enabled:true,locked:true,updatedAt:1000}]};return memory;}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="新增")?.click());
  const area=document.querySelector("textarea");expect(area).not.toBeNull();
  await act(()=>{if(area){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(area,"简洁中文，保留来源");area.dispatchEvent(new Event("input",{bubbles:true}));}});
  await act(async()=>document.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(writes).toEqual([{action:"save",revision:0,id:undefined,text:"简洁中文，保留来源"}]);
  expect(host.textContent).toContain("简洁中文，保留来源");expect(host.textContent).toContain("已锁定");expect(document.querySelector("textarea")).toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});

test("review shows inactive proposals, opens source and accepts into saved memory",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let source="";
 let memory:AlwaysOnMemory={version:1,revision:0,useNotes:true,extract:true,notes:[],suggestions:[{id:"f7a394c1-abd0-4c53-b827-42e763140688",text:"优先列出阻塞事项",eventId:"event",sessionId:"ses_source",messageId:"msg_source",createdAt:1000}]};
 const writes:AlwaysOnMemoryChange[]=[];
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async()=>memory,changeAlwaysOnMemory:async(_:string,input:AlwaysOnMemoryChange)=>{writes.push(input);memory={...memory,revision:1,suggestions:[],notes:[{id:"f7a394c1-abd0-4c53-b827-42e763140688",text:"优先列出阻塞事项",enabled:true,locked:true,updatedAt:1000}]};return memory;}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={(s,m)=>{source=`${s}:${m}`;}}/>));
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent?.startsWith("待确认"))?.click());
  expect(host.textContent).toContain("尚未生效");expect(host.textContent).toContain("优先列出阻塞事项");
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="查看来源")?.click());expect(source).toBe("ses_source:msg_source");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="接受")?.click());
  expect(writes[0]).toEqual({action:"accept",id:"f7a394c1-abd0-4c53-b827-42e763140688",revision:0});expect(host.textContent).toContain("暂无待确认记忆");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("settings exposes persisted history, run snapshots and unblock action",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const hash="a".repeat(64);const writes:AlwaysOnMemoryChange[]=[];
 let memory:AlwaysOnMemory={version:1,revision:0,useNotes:true,notes:[],blocked:[hash],blockedEntries:[{hash,text:"blocked preference",createdAt:1}],history:[{id:"h",action:"save",after:"saved preference",createdAt:1}],usage:[{eventId:"e",sessionId:"s",messageId:"m",revision:0,notes:[{id:"n",text:"snapshot preference"}],submittedAt:1}]};
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async()=>memory,changeAlwaysOnMemory:async(_:string,input:AlwaysOnMemoryChange)=>{writes.push(input);memory={...memory,revision:1,blocked:[],blockedEntries:[]};return memory;}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent==="记忆设置")?.click());
  expect(host.textContent).toContain("saved preference");expect(host.textContent).toContain("snapshot preference");expect(host.textContent).toContain("blocked preference");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="允许再次提取")?.click());expect(writes).toEqual([{action:"unblock",hash,revision:0}]);expect(host.textContent).toContain("暂无拦截记录");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("reported records show completed chat evidence and navigate to the assistant reply",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let source="";
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async():Promise<AlwaysOnMemory>=>({version:1,revision:0,useNotes:true,notes:[],reported:[{eventId:"event",sessionId:"session",messageId:"assistant",text:"已核对本地资料，无新变化。",truncated:false,completedAt:1000}]})};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={(s,m)=>{source=`${s}:${m}`;}}/>));
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="已汇报记录")?.click());
  expect(host.textContent).toContain("已生成回复");expect(host.textContent).toContain("无新变化");expect(host.textContent).not.toContain("暂无已汇报记录");
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="查看来源")?.click());expect(source).toBe("session:assistant");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("clear requires explicit confirmation and sends the revision captured when opened",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const writes:AlwaysOnMemoryChange[]=[];
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},changeAlwaysOnMemory:async(_:string,input:AlwaysOnMemoryChange)=>{writes.push(input);return {version:1 as const,revision:1,useNotes:true,notes:[]};}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent==="记忆设置")?.click());
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="清空记忆")?.click());
  expect(writes).toEqual([]);expect(document.querySelector('[role="dialog"]')?.textContent).toContain("执行检查点");
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==="清空记忆")?.click());
  expect(writes).toEqual([{action:"clear",revision:0}]);expect(document.querySelector('[role="dialog"]')).toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});
test("export downloads a fresh complete JSON snapshot without modifying memory",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let reads=0;let blob:Blob|undefined;let downloaded="";
 const originalCreate=URL.createObjectURL;const originalRevoke=URL.revokeObjectURL;const originalClick=HTMLAnchorElement.prototype.click;
 URL.createObjectURL=value=>{if(value instanceof Blob)blob=value;return "blob:fixture";};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async()=>({version:1 as const,revision:++reads,useNotes:true,notes:[],reported:[{eventId:"e",sessionId:"s",messageId:"m",text:"saved report",truncated:false,completedAt:1}]})};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent==="记忆设置")?.click());
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="导出记忆")?.click());
  const result=JSON.parse(await blob!.text());expect(result.workspaceId).toBe("fixture");expect(result.memory.revision).toBe(2);expect(result.memory.reported[0].text).toBe("saved report");expect(downloaded).toEndWith(".json");expect(host.textContent).toContain("已发起下载");
 }finally{await act(()=>root.unmount());host.remove();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;HTMLAnchorElement.prototype.click=originalClick;}
});
test("failed clear keeps the confirmation open and preserves displayed records",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},changeAlwaysOnMemory:async()=>{throw new Get3wServerError(409,"memory_conflict","Memory changed");}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent==="记忆设置")?.click());
  await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="清空记忆")?.click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==="清空记忆")?.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(document.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});

test("notification submission never implies viewing; acknowledgement requires explicit action",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let acknowledgements=0;
 let memory:AlwaysOnMemory={version:1,revision:0,useNotes:true,notes:[],reported:[{eventId:"event",sessionId:"session",messageId:"assistant",text:"Result generated",truncated:false,completedAt:1000}]};
 const client={...memoryClient,alwaysOnStatus:async()=>status,readWorkspaceFile:async()=>{throw new Get3wServerError(404,"file_not_found","missing");},alwaysOnMemory:async()=>memory,alwaysOnOutbox:async()=>[{id:"event",resultId:"event",title:"Report",text:"Report",sessionId:"session",messageId:"assistant",status:"submitted" as const,createdAt:1000,attempts:1}],markAlwaysOnReplyViewed:async(_:string,eventId:string)=>{expect(eventId).toBe("event");acknowledgements++;memory={...memory,reported:memory.reported?.map(item=>({...item,viewedAt:2000}))};return memory;}};
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}}/>));
  expect(host.textContent).toContain("用户是否查看未知");expect(acknowledgements).toBe(0);
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="我已查看")?.click());
  expect(acknowledgements).toBe(1);expect(host.textContent).toContain("用户已确认查看");expect(host.textContent).not.toContain("用户是否查看未知");
 }finally{await act(()=>root.unmount());host.remove();}
});

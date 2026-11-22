import { beforeAll, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import type { AlwaysOnInbox } from "@get3w/types/workspace";
import { setLocale } from "../src/i18n";
import { AlwaysOnInboxPage } from "../src/react-app/domains/workspace/always-on-inbox-page";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async () => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({url:"http://localhost"}); Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true); setLocale("zh"); createRoot=(await import("react-dom/client")).createRoot; });
test("inbox shows real events, pages history and opens the exact run", async () => {
 const data:AlwaysOnInbox={status:{settings:{goal:"Monitor reports",fullAccess:false,costAuto:false,costLimit:"7",intervalMinutes:60},paused:true,phase:"idle",sessionId:"ses_a",nextRunAt:null,lastError:null},pending:[],processing:[],history:Array.from({length:10},(_,index)=>({id:`event_${index}`,kind:"manual",phase:"done",messageId:"msg_a",sessionId:"ses_a",createdAt:1,finishedAt:2,summary:"Real result"})),historyTotal:11,nextOffset:10,unreadableCount:0,sources:[]};
 const offsets:number[]=[];const actions:string[]=[];const client={reviewAlwaysOnResult:async()=>{throw Error("not used");},alwaysOnInbox:async(_id:string,offset=0)=>{offsets.push(offset);return offset===0?data:{...data,history:[],nextOffset:null};},saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[],receiveAlwaysOnEvent:async()=>({duplicate:false})};
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<AlwaysOnInboxPage client={client} workspaceId="ws_a" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={(id,message)=>actions.push(`${id}:${message}`)}/>));
  expect(host.textContent).toContain("Real result");expect(host.textContent).not.toContain("示例");
  expect(host.textContent).not.toContain("目标对话");
  expect(host.querySelector("ol")).toBeNull();
  expect(host.querySelector("details")).toBeNull();
  async function click(label:string){await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent===label)?.click());}
  await click("查看对话");expect(actions).toEqual(["ses_a:msg_a"]);
  expect(host.querySelectorAll("article")).toHaveLength(3);
  await click("加载更多");expect(host.querySelectorAll("article")).toHaveLength(6);
  await click("加载更多");expect(host.querySelectorAll("article")).toHaveLength(9);
  await click("加载更多");expect(offsets).toContain(10);
  expect(host.textContent).not.toContain("上一页");
  data.focusedRun = data.history[0];
  await act(async()=>root.render(<AlwaysOnInboxPage eventId="event_0" client={client} workspaceId="ws_a" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={()=>{}}/>));
  expect(host.querySelectorAll('section[aria-label="关联事件"] article')).toHaveLength(1);
  expect(host.querySelectorAll('section[aria-label="已处理"] article')).toHaveLength(9);

 }finally{await act(async()=>root.unmount());host.remove();}
});
test("inbox failure remains recoverable without fabricated events",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<AlwaysOnInboxPage client={null} workspaceId="ws_a" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={()=>{}}/>));expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.textContent).toContain("重新加载");expect(host.querySelectorAll("article")).toHaveLength(0);}finally{await act(async()=>root.unmount());host.remove();}
});

test("each original shows its batch and opens the shared conversation; source grouping control shows the persisted setting",async()=>{
 const data:AlwaysOnInbox={status:{settings:{goal:"Monitor",fullAccess:false,costAuto:false,costLimit:"7",intervalMinutes:60},paused:true,phase:"idle",sessionId:null,nextRunAt:null,lastError:null},pending:[],processing:[],history:[{id:"original-2",batchId:"batch-1",batchSize:2,kind:"source",phase:"done",messageId:"shared-msg",sessionId:"shared-session",createdAt:1,finishedAt:2,summary:"Combined",text:"Original second update"}],historyTotal:1,nextOffset:null,unreadableCount:0,sources:[{id:"source",kind:"webhook",name:"Merge source",scope:"",enabled:true,lastReceived:null,mergeWindowSeconds:0}]};
 const saved:number[]=[];const opened:string[]=[];
 const client={alwaysOnInbox:async()=>data,reviewAlwaysOnResult:async()=>{throw Error("not used");},saveAlwaysOnSource:async(_:string,input:{mergeWindowSeconds?:number})=>{saved.push(input.mergeWindowSeconds!);data.sources[0]!.mergeWindowSeconds=input.mergeWindowSeconds;return data.sources;},controlAlwaysOnSource:async()=>[],receiveAlwaysOnEvent:async()=>({duplicate:false})};
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<AlwaysOnInboxPage client={client} workspaceId="fixture" onClose={()=>{}} onOpenSettings={()=>{}} onOpenSession={(session,message)=>opened.push(`${session}:${message}`)}/>));
  expect(host.textContent).toContain("本轮合并 2 条事件");expect(host.textContent).toContain("Original second update");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="查看对话")?.click());expect(opened).toEqual(["shared-session:shared-msg"]);
  await act(async()=>[...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab=>tab.textContent==="来源")?.click());
  const trigger=document.querySelector<HTMLElement>('[aria-label="Merge source · 事件合并"]');expect(trigger).not.toBeNull();
  expect(trigger?.textContent).toContain("逐条处理");expect(saved).toEqual([]);
 }finally{await act(async()=>root.unmount());host.remove();}
});

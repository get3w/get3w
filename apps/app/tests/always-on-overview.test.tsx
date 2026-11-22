import { beforeAll, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { setLocale } from "../src/i18n";
import type { AlwaysOnOverview } from "@get3w/types/workspace";
let createRoot: typeof import("react-dom/client")["createRoot"];
let AlwaysOnOverviewPage: typeof import("../src/react-app/domains/workspace/always-on-overview-page")["AlwaysOnOverviewPage"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;AlwaysOnOverviewPage=(await import("../src/react-app/domains/workspace/always-on-overview-page")).AlwaysOnOverviewPage;});
test("real overview shows paused goal/history, opens chat and settings, and pages without execution",async()=>{
 const data:AlwaysOnOverview={status:{settings:{goal:"真实测试目标",fullAccess:false,costAuto:false,costLimit:"7",intervalMinutes:15},paused:true,phase:"idle",sessionId:"ses_real",nextRunAt:Date.now(),lastError:null},runs:[{id:"run1",messageId:"msg_run1",kind:"timer",phase:"done",createdAt:1,finishedAt:2,sessionId:"ses_real",summary:"真实结果"}],nextOffset:20,unreadableCount:0,progress:{total:45,completed:40,active:1,waiting:2,failed:1,paused:1}};
 const offsets:number[]=[];const actions:string[]=[];
 const client={reviewAlwaysOnResult:async()=>{throw Error("not used");},alwaysOnOverview:async(_id:string,offset=0)=>{offsets.push(offset);return offset===0?data:{...data,runs:[],nextOffset:null};}};
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<AlwaysOnOverviewPage client={client} workspaceId="ws_real" onOpenSettings={()=>actions.push("settings")} onClose={()=>actions.push("back")} onOpenSession={(id,messageId)=>actions.push(`${id}:${messageId}`)} />));
  expect(host.textContent).toContain("真实测试目标");expect(host.textContent).toContain("已暂停");expect(host.textContent).toContain("真实结果");expect(host.textContent).not.toContain("示例");expect(host.textContent).toContain("工作进展");expect(host.textContent).toContain("45");
  async function click(label:string){await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent===label)?.click());}
  await click("查看对话");await click("调整目标");expect(actions).toEqual(["ses_real:msg_run1","settings"]);
  await click("下一页");expect(offsets).toEqual([0,20]);expect(host.textContent).toContain("尚无运行记录");
  await click("上一页");expect(offsets).toEqual([0,20,0]);await click("返回对话");expect(actions).toContain("back");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("missing server shows a recoverable error instead of example or empty success",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<AlwaysOnOverviewPage client={null} workspaceId="ws_test" onOpenSettings={()=>{}} onClose={()=>{}} onOpenSession={()=>{}}/>));expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.textContent).toContain("重新加载");expect(host.textContent).not.toContain("示例");}finally{await act(()=>root.unmount());host.remove();}
});

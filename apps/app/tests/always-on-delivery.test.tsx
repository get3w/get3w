import { beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { setLocale } from "../src/i18n";
import type { DeliveryPreviewRecord } from "../src/react-app/domains/workspace/always-on-delivery-page";
let Page: typeof import("../src/react-app/domains/workspace/always-on-delivery-page")["AlwaysOnDeliveryPage"];
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;Page=(await import("../src/react-app/domains/workspace/always-on-delivery-page")).AlwaysOnDeliveryPage;});
test("production page does not invent records",async()=>{
 const host=document.createElement("div");const root=createRoot(host);let closed=false;
 try{await act(async()=>root.render(<Page workspaceId="fixture" client={{alwaysOnDeliverables:async()=>({results:[],nextOffset:null,unreadableCount:0}),readWorkspaceFile:async()=>{throw Error("unused");}}} onClose={()=>{closed=true;}}/>));expect(host.textContent).toContain("Desktop 通知");expect(host.textContent).toContain("尚无已核验成果");expect(host.querySelector("article")).toBeNull();await act(()=>host.querySelector<HTMLButtonElement>('[role="tab"]:last-child')?.click());expect(host.textContent).toContain("Desktop 通知");await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="返回对话")?.click());expect(closed).toBe(true);}finally{await act(()=>root.unmount());}
});
test("preview supports file viewing, result links, filtering, load more and blocked send controls",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const states:DeliveryPreviewRecord["status"][]=["failed","pending","submitted","unconfirmed","blocked","cancelled"];
 const preview={results:[{id:"r",title:"Report",summary:"Saved conclusion",createdAt:1,files:[{path:"report.md",content:"Preview file"}]}],deliveries:states.map((status,i)=>({id:`d${i}`,resultId:"r",title:"Notice",text:"Result available",status,createdAt:1,attempts:1}))};
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)?.click());
 try{
 await act(()=>root.render(<Page onClose={()=>{}} preview={preview}/>));expect(host.textContent).toContain("已保存");await click("report.md");expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Preview file");await act(()=>document.querySelector<HTMLButtonElement>('[role="dialog"] [data-slot="dialog-close"]')?.click());
 await click("查看交付记录");expect(host.querySelectorAll("article")).toHaveLength(3);expect([...host.querySelectorAll("button")].find(b=>b.textContent==="重试发送")?.disabled).toBe(true);
 await click("加载更多");expect(host.querySelectorAll("article")).toHaveLength(6);await click("发送失败");expect(host.querySelectorAll("article")).toHaveLength(1);await click("已提交通知");expect(host.textContent).toContain("不代表用户已看到");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("live results page loads three at a time, opens actual files, and navigates to the original run",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const offsets:number[]=[];const reads:string[]=[];let source="";
 const client={alwaysOnDeliverables:async(_:string,offset=0)=>{offsets.push(offset);return {results:[{id:`r${offset}`,summary:`Actual result ${offset}`,createdAt:1,sessionId:"session",messageId:"message",artifacts:offset===0?["report.md"]:[]}],nextOffset:offset===0?3:null,unreadableCount:1};},readWorkspaceFile:async(_:string,path:string,options?:{fileScope?:string})=>{reads.push(`${path}:${options?.fileScope}`);return {path,content:"Real file content",bytes:17,updatedAt:1};}};
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)?.click());
 try{
 await act(async()=>root.render(<Page workspaceId="fixture" client={client} onClose={()=>{}} onOpenSession={(s,m)=>{source=`${s}:${m}`;}}/>));
 expect(offsets).toEqual([0]);expect(reads).toEqual([]);expect(host.textContent).toContain("Actual result 0");expect(host.textContent).toContain("(1)");
 await click("查看对话");expect(source).toBe("session:message");await click("report.md");expect(reads).toEqual(["report.md:workspace"]);expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Real file content");
 await act(()=>document.querySelector<HTMLButtonElement>('[role="dialog"] [data-slot="dialog-close"]')?.click());await click("加载更多");expect(offsets).toEqual([0,0,3]);expect(host.querySelectorAll("article")).toHaveLength(2);expect(host.textContent).toContain("Actual result 3");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("file read failure remains visible without inventing file content",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const client={alwaysOnDeliverables:async()=>({results:[{id:"r",summary:"Saved",createdAt:1,sessionId:null,messageId:"m",artifacts:["missing.md"]}],nextOffset:null,unreadableCount:0}),readWorkspaceFile:async()=>{throw Error("File missing");}};
 try{await act(async()=>root.render(<Page workspaceId="fixture" client={client} onClose={()=>{}}/>));await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="missing.md")?.click());expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("File missing");expect(host.textContent).toContain("Saved");expect(document.querySelector('[role="dialog"] pre')?.textContent).toBe("");}finally{await act(()=>root.unmount());host.remove();}
});
test("live outbox retries only the notification and cancels without removing the result",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const changes:unknown[]=[];
 let status:DeliveryPreviewRecord["status"]="failed";
 const client={alwaysOnDeliverables:async()=>({results:[],nextOffset:null,unreadableCount:0}),readWorkspaceFile:async()=>{throw Error("unused");},alwaysOnOutbox:async()=>[{id:"d",resultId:"r",title:"Actual notice",text:"Report available",sessionId:"s",messageId:"m",createdAt:1,attempts:1,status}],changeAlwaysOnOutbox:async(_:string,change:import("@get3w/types/workspace").AlwaysOnDeliveryChange)=>{changes.push(change);status=change.action==="retry"?"pending":"cancelled";return null;}};
 const click=async(text:string)=>act(async()=>[...document.querySelectorAll("button")].filter(b=>b.textContent===text).at(-1)?.click());
 try{
  await act(async()=>root.render(<Page client={client} workspaceId="fixture" onClose={()=>{}}/>));
  await click("交付记录");expect(host.textContent).toContain("发送失败");await click("重试发送");expect(document.querySelector('[role="dialog"]')?.textContent).toContain("不重新执行任务");await click("重试发送");expect(changes).toEqual([{id:"d",action:"retry"}]);
  await click("取消发送");await click("取消发送");expect(changes).toEqual([{id:"d",action:"retry"},{id:"d",action:"cancel"}]);expect(host.querySelector('article')?.textContent).toContain("已取消");
 }finally{await act(()=>root.unmount());host.remove();}
});

test("delivery timestamps distinguish the planned window from actual OS submission",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const due=Date.parse("2026-11-22T01:00:00Z"),expires=due+86400000,submitted=due+1500;
 const preview={results:[],deliveries:[{id:"pending",resultId:"r",title:"Prepared notice",text:"Ready",status:"pending" as const,createdAt:due-600000,attempts:0,notBefore:due,expiresAt:expires},{id:"sent",resultId:"r2",title:"Submitted notice",text:"Ready",status:"submitted" as const,createdAt:due-600000,attempts:1,notBefore:due,submittedAt:submitted}]};
 try{
  await act(()=>root.render(<Page preview={preview} onClose={()=>{}}/>));
  await act(()=>host.querySelector<HTMLButtonElement>('[role="tab"]:last-child')?.click());
  const rows=host.querySelectorAll("article");
  expect(rows[0]?.textContent).toContain("计划发送");expect(rows[0]?.textContent).toContain("到期时间");expect(rows[0]?.textContent).not.toContain("实际提交通知");
  expect(rows[0]?.querySelector('time')?.dateTime).toBe(new Date(due).toISOString());
  expect(rows[1]?.textContent).toContain("实际提交通知");expect(rows[1]?.querySelectorAll('time')[1]?.dateTime).toBe(new Date(submitted).toISOString());
 }finally{await act(()=>root.unmount());host.remove();}
});

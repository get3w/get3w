import { beforeAll, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { setLocale } from "../src/i18n";
let Page: typeof import("../src/react-app/domains/workspace/always-on-attention-page")["AlwaysOnAttentionPage"];
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;Page=(await import("../src/react-app/domains/workspace/always-on-attention-page")).AlwaysOnAttentionPage;});
test("unconnected page never claims no pending requests or offers approval",async()=>{
 const host=document.createElement("div");const root=createRoot(host);let closed=false;
 try {await act(()=>root.render(<Page onClose={()=>{closed=true;}}/>));expect(host.textContent).toContain("请求尚未接入");expect(host.textContent).not.toContain("暂无记录");expect(host.querySelector("article")).toBeNull();await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="返回对话")?.click());expect(closed).toBe(true);}finally{await act(()=>root.unmount());}
});
test("preview paginates, separates resolved requests, and cannot authorize",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const preview:import("../src/react-app/domains/workspace/always-on-attention-page").AttentionPreviewRequest[]=Array.from({length:4},(_,i)=>({id:String(i),kind:"permission",title:`Action ${i}`,task:"Sample task",detail:"Workspace file",status:"pending"}));preview.push({id:"old",kind:"question",title:"Old question",task:"Sample task",detail:"Withdrawn",status:"stale"});
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)?.click());
 try{await act(()=>root.render(<Page preview={preview} onClose={()=>{}}/>));expect(host.querySelectorAll("article")).toHaveLength(3);expect([...host.querySelectorAll("article button")].every(b=>b.hasAttribute("disabled"))).toBe(true);await click("加载更多");expect(host.querySelectorAll("article")).toHaveLength(4);await click("已处理");expect(host.querySelectorAll("article")).toHaveLength(1);expect(host.textContent).toContain("已失效");expect(host.querySelector("article button")).toBeNull();}finally{await act(()=>root.unmount());host.remove();}
});

test("live request is read-only and opens the matching conversation",async()=>{
 const host=document.createElement("div");const root=createRoot(host);let opened="";
 const client={alwaysOnAttention:async()=>({paused:true,checkedAt:1,scope:"active-task" as const,items:[{eventId:"e",sessionId:"s",messageId:"m",requestId:"p",createdAt:1,request:{kind:"permission" as const,title:"Write report",detail:"reports/test.md",command:"write"}}]})};
 try{await act(async()=>root.render(<Page client={client} workspaceId="w" onClose={()=>{}} onOpenSession={(s,m)=>{opened=`${s}:${m}`;}}/>));expect(host.textContent).toContain("Write report");expect(host.textContent).toContain("已暂停");expect(host.textContent).not.toContain("允许本次");await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="前往对话处理")?.click());expect(opened).toBe("s:m");}finally{await act(()=>root.unmount());}
});
test("failed reads never claim that requests are empty",async()=>{
 const host=document.createElement("div");const root=createRoot(host);
 try{await act(async()=>root.render(<Page client={{alwaysOnAttention:async()=>{throw Error("offline");}}} workspaceId="w" onClose={()=>{}}/>));expect(host.querySelector('[role="alert"]')?.textContent).toContain("未确认");expect(host.textContent).not.toContain("没有待处理请求");}finally{await act(()=>root.unmount());}
});

test("question answer submits once with the original ids and preserves drafts on failure",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let calls=0;let fail=true;
 const client={alwaysOnAttention:async()=>({paused:true,checkedAt:1,scope:"active-task" as const,items:[{eventId:"e",sessionId:"s",messageId:"m",requestId:"q",createdAt:1,request:{kind:"question" as const,questions:[{header:"Scope",question:"Which files?",options:[{label:"New",description:""}],multiple:false,custom:false}]}}]}),answerAlwaysOnQuestion:async(w:string,input:import("@get3w/types/workspace").AlwaysOnQuestionAnswer)=>{calls++;expect(w).toBe("w");expect(input.sessionId).toBe("s");expect(input.eventId).toBe("e");expect(input.request.requestId).toBe("q");expect(input.answers).toEqual([["New"]]);if(fail)throw Error("offline");return {status:"queued" as const};}};
 const button=(text:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)!;
 try{await act(async()=>root.render(<Page client={client} workspaceId="w" onClose={()=>{}}/>));expect(button("保存答复，恢复后继续").disabled).toBe(true);await act(()=>button("New").click());await act(async()=>button("保存答复，恢复后继续").click());expect(host.textContent).toContain("offline");expect(button("New").getAttribute("aria-pressed")).toBe("true");fail=false;await act(async()=>button("保存答复，恢复后继续").click());expect(host.textContent).toContain("答复已保存");expect(calls).toBe(2);expect(host.querySelector("fieldset")?.disabled).toBe(true);}finally{await act(()=>root.unmount());host.remove();}
});


test("cancelling a durable question requires confirmation and reports the persisted outcome",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let calls=0;
 const item={eventId:"e",sessionId:"s",messageId:"m",requestId:"q",createdAt:1,canCancel:true,request:{kind:"question" as const,questions:[{header:"Scope",question:"Which files?",options:[],multiple:false,custom:true}]}};
 const client={alwaysOnAttention:async()=>({paused:true,checkedAt:1,scope:"active-task" as const,answerStatus:calls?"cancelled" as const:undefined,items:calls?[]:[item]}),cancelAlwaysOnQuestion:async(w:string,input:{eventId:string;sessionId:string;requestId:string})=>{expect(w).toBe("w");expect(input).toEqual({eventId:"e",sessionId:"s",requestId:"q"});calls++;return {status:"cancelled" as const};}};
 try{
 await act(async()=>root.render(<Page client={client} workspaceId="w" onClose={()=>{}}/>));
 await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="取消本次提问")?.click());expect(calls).toBe(0);
 expect(document.body.textContent).toContain("已保存的答复不会提交");
 await act(async()=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==="取消本次提问")?.click());
 expect(calls).toBe(1);expect(host.textContent).toContain("提问已取消");expect(host.querySelector("article")).toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});

 test("blocked result is actionable without a model question and disappears after verification",async()=>{
 const host=document.createElement("div");const root=createRoot(host);let reviewed=false;let opened="";
 const run:import("@get3w/types/workspace").AlwaysOnRun={id:"event",messageId:"message",sessionId:"session",kind:"timer",phase:"done",createdAt:1,finishedAt:2,summary:"",verification:{status:"needs_review",checkedAt:2,issues:["result_invalid","checkpoint_missing"]}};
 const client={alwaysOnAttention:async()=>({paused:false,checkedAt:2,scope:"active-task" as const,items:[],resultReview:reviewed?undefined:run}),reviewAlwaysOnResult:async(w:string,id:string,action:"verify"|"repair")=>{expect(w).toBe("w");expect(id).toBe("event");expect(action).toBe("verify");reviewed=true;return {version:1,settings:{goal:"x",criteria:"",behavior:"",fullAccess:false,costAuto:false,costLimit:"0",intervalMinutes:1},paused:false,phase:"idle" as const,sessionId:"session",engine:"v2" as const,nextRunAt:3,lastError:null};}};
 try{await act(async()=>root.render(<Page client={client} workspaceId="w" onClose={()=>{}} onOpenSession={(s,m)=>{opened=`${s}:${m}`;}}/>));expect(host.textContent).toContain("运行已阻塞");expect(host.textContent).not.toContain("暂无待处理请求");await act(()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="查看对话")?.click());expect(opened).toBe("session:message");await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="重新核验")?.click());expect(reviewed).toBe(true);expect(host.textContent).not.toContain("运行已阻塞");expect(host.textContent).toContain("暂无待处理请求");}finally{await act(()=>root.unmount());}
 });

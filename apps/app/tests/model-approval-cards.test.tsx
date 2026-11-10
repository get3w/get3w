import { afterAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
GlobalRegistrator.register({url:"http://localhost/"});
Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
const {ModelApprovalCards}=await import("../src/react-app/domains/cloud/model-approval-cards");
afterAll(()=>GlobalRegistrator.unregister());
test("a trusted quote renders its cost and sends an explicit scoped reply",async()=>{
 (await import("../src/i18n")).setLocale("zh");
 const calls: unknown[]=[];
 const item={id:"approval",workspaceId:"ws",modelTask:{sessionId:"chat-session-123456",quoteId:"quote",slug:"provider/model/run",amountUsd:"0.123456",expiresAt:Date.now()+60000}};
 // Install only the narrow method under test, without account credentials.
 Reflect.set(window,"__GET3W_ACCOUNT__",{modelApprovals:async(input: {action:string})=>{calls.push(input);return {items:input.action==="list"?[item]:[]};}});
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 try {
  await act(async()=>root.render(createElement(ModelApprovalCards,{workspaceId:"ws",sessionId:"chat-session-123456"})));
  expect(container.textContent).toContain("¥0.864192");
  await act(async()=>(await import("../src/i18n")).setLocale("en"));
  expect(container.textContent).toContain("$0.123456");
  await act(async()=>(await import("../src/i18n")).setLocale("zh"));
  expect(container.textContent).toContain("停止等待不会撤销任务");
  const button=Array.from(container.querySelectorAll("button")).find(el=>el.textContent==="批准费用并运行");
  expect(button).toBeDefined();
  await act(async()=>button?.click());
  expect(calls).toContainEqual({workspaceId:"ws",sessionId:"chat-session-123456",action:"respond",id:"approval",reply:"allow"});
  expect(container.textContent).toBe("");
 } finally {await act(async()=>root.unmount());container.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});

import {afterAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
GlobalRegistrator.register({url:"http://localhost/"});
Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
const {TaskPermissionControl}=await import("../src/react-app/domains/session/chat/task-permission-control");
const {setLocale}=await import("../src/i18n");
afterAll(()=>GlobalRegistrator.unregister());
test("full access requires risk acknowledgement and an explicit scoped save",async()=>{
 setLocale("zh"); const calls: unknown[]=[];
 Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async(input:{action:string;mode?:string})=>{calls.push(input);return {mode:input.mode??"default",defaultMode:input.mode??"default",grants:[]};}});
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 try {
  await act(async()=>root.render(createElement(TaskPermissionControl,{workspaceId:"ws",sessionId:"ses_test"})));
  expect(container.textContent).toContain("审批设置");
  await act(async()=>container.querySelector("button")?.click());
  expect(document.querySelector('section[aria-label="权限批准"]')).not.toBeNull();
  expect(document.querySelector('section[aria-label="费用批准"]')).not.toBeNull();
  expect(document.body.textContent).toContain("限额内自动批准付费调用");
  const toggle=document.querySelector<HTMLButtonElement>('[role="switch"]');expect(toggle).not.toBeNull();
  await act(async()=>toggle?.click());
  expect(document.body.textContent).toContain("确认允许完全访问？");
  const allow=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(el=>el.textContent==="允许完全访问");
  expect(allow()?.disabled).toBe(true);
  await act(async()=>document.querySelector<HTMLLabelElement>('[role="checkbox"]')?.closest("label")?.click());
  expect(allow()?.disabled).toBe(false);
  await act(async()=>allow()?.click());
  expect(calls).toContainEqual({action:"set",workspaceId:"ws",sessionId:"ses_test",mode:"full_access",confirmed:true,index:undefined});
  expect(container.textContent).toContain("审批设置");
 } finally {await act(async()=>root.unmount());container.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});

test("cancel, Escape and failed saves preserve the verified mode; disabling needs no confirmation",async()=>{
 setLocale("zh");let mode="default";let fail=true;const writes: string[]=[];
 Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async(input:{action:string;mode?:string})=>{
  if(input.action==="set"){writes.push(input.mode??"");if(fail)throw Error("Isolated save failure");mode=input.mode??mode;}
  return {mode,defaultMode:mode,grants:[]};
 }});
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 const button=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(el=>el.textContent===text);
 const openConfirm=async()=>{await act(async()=>container.querySelector("button")?.click());await act(async()=>document.querySelector<HTMLButtonElement>('[role="switch"]')?.click());};
 try {
  await act(async()=>root.render(createElement(TaskPermissionControl,{workspaceId:"ws",sessionId:"ses_test"})));
  await openConfirm();await act(async()=>button("取消")?.click());expect(writes).toEqual([]);
  await openConfirm();await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true})));
  expect(writes).toEqual([]);expect(document.querySelector('[role="dialog"]')).toBeNull();
  await openConfirm();await act(async()=>document.querySelector('[role="checkbox"]')?.closest("label")?.click());
  await act(async()=>button("允许完全访问")?.click());expect(document.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).toContain("审批设置");
  fail=false;await act(async()=>button("允许完全访问")?.click());expect(container.textContent).toContain("审批设置");
  await act(async()=>container.querySelector("button")?.click());await act(async()=>document.querySelector<HTMLButtonElement>('[role="switch"]')?.click());
  expect(container.textContent).toContain("审批设置");expect(writes).toEqual(["full_access","full_access","default"]);
 }finally{await act(async()=>root.unmount());container.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("models report automatic enablement without configuration and discard the previous account result",async()=>{
 const {t}=await import("../src/i18n");
 const {Get3wManagedModels}=await import("../src/react-app/domains/cloud/get3w-managed-models");
 const calls:{userId:string;action:string}[]=[];let finish:(value:{enabled:boolean;state:string})=>void=()=>{};
 window.__GET3W_ACCOUNT__={managedModels:async input=>{calls.push(input);return new Promise(resolve=>{finish=resolve;});},models:async()=>({models:[]}),balance:async()=>({balance:null}),status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async()=>{throw Error()}};
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try {
  await act(async()=>{root.render(<Get3wManagedModels key="a" userId="a"/>);});
  expect(calls).toEqual([{userId:"a",action:"status"}]);
  expect(node.textContent).toContain("Get3W Models");
  expect(node.querySelector("button")).toBeNull();
  const old=finish;
  await act(async()=>{root.render(<Get3wManagedModels key="b" userId="b"/>);});
  await act(async()=>{old({enabled:true,state:"connected"});});
  expect(node.textContent).not.toContain(t("ui.6db179a68676"));
  await act(async()=>{finish({enabled:true,state:"pending"});});
  expect(node.textContent).toContain(t("ui.1ac979a8e0de"));
  await act(async()=>{node.querySelector("button")?.click();});
  expect(calls).toEqual([{userId:"a",action:"status"},{userId:"b",action:"status"},{userId:"b",action:"status"}]);
  await act(async()=>{finish({enabled:true,state:"connected"});});
  expect(node.textContent).toContain(t("ui.6db179a68676"));
  expect(node.querySelector("button")).toBeNull();
 }finally{await act(async()=>{root.unmount();});node.remove();delete window.__GET3W_ACCOUNT__;}
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("models require explicit connection and discard the previous account result",async()=>{
 const {Get3wManagedModels}=await import("../src/react-app/domains/cloud/get3w-managed-models");
 const calls:{userId:string;action:string}[]=[];let finish:(value:{enabled:boolean;state:string})=>void=()=>{};
 window.__OPENWORK_ACCOUNT__={updateMember:async()=>({ok:true}),managedModels:async input=>{calls.push(input);return new Promise(resolve=>{finish=resolve;});},models:async()=>({models:[]}),balance:async()=>({balance:null}),organizations:async()=>({organizations:[],selectedOrganization:null}),members:async()=>({organization_id:"",members:[]}),status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async()=>{throw Error()}};
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try {
  await act(async()=>{root.render(<Get3wManagedModels key="a" userId="a"/>);});
  expect(calls).toEqual([{userId:"a",action:"status"}]);
  await act(async()=>{finish({enabled:false,state:"disconnected"});});
  expect(node.textContent).toContain("Connect models");
  await act(async()=>{node.querySelector("button")?.click();});
  expect(calls[1]).toEqual({userId:"a",action:"enable"});
  const old=finish;
  await act(async()=>{root.render(<Get3wManagedModels key="b" userId="b"/>);});
  await act(async()=>{old({enabled:true,state:"connected"});});
  expect(node.textContent).not.toContain("Connected to the local engine");
  await act(async()=>{finish({enabled:true,state:"pending"});});
  expect(node.textContent).toContain("Waiting for the engine to become idle");
 }finally{await act(async()=>{root.unmount();});node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

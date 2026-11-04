import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import type { BalanceSnapshot } from "../src/react-app/domains/cloud/get3w-balance";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("balance discards previous account responses and clears stale values on failure",async()=>{
  const {Get3wBalance}=await import("../src/react-app/domains/cloud/get3w-balance");
  let finish:(value:BalanceSnapshot)=>void=()=>{};let fail=false;
  window.__OPENWORK_ACCOUNT__={updateMember:async()=>({ok:true}),managedModels:async()=>({enabled:false,state:"disconnected"}),models:async()=>({models:[]}),balance:async()=>{if(fail)throw Error("Offline. Retry.");return new Promise(resolve=>{finish=resolve;});},organizations:async()=>({organizations:[],selectedOrganization:null}),members:async()=>({organization_id:"",members:[]}),status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async()=>{throw Error()}};
  const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
  const click=async()=>{await act(async()=>{node.querySelector("button")?.click();});};
  try {
    await act(async()=>{root.render(<Get3wBalance key="a" userId="a"/>);});await click();
    await act(async()=>{root.render(<Get3wBalance key="b" userId="b"/>);finish({balance:{amount:"12.123456",currency:"USD"}});});
    expect(node.textContent).toContain("Balance not checked");expect(node.textContent).not.toContain("12.123456");
    await click();await act(async()=>{finish({balance:{amount:"0.000000",currency:"CNY"}});});
    expect(node.textContent).toContain("CNY 0.000000");
    fail=true;await click();expect(node.textContent).toContain("Offline. Retry.");expect(node.textContent).not.toContain("CNY");
  }finally{await act(async()=>{root.unmount();});node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

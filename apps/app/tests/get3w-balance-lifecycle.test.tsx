import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { formatAccountBalance } from "../src/i18n/money";
import type { BalanceSnapshot } from "../src/react-app/domains/cloud/get3w-balance";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{(await import("../src/i18n")).setLocale("en");GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("balance discards previous account responses and clears stale values on failure",async()=>{
  const {Get3wBalance}=await import("../src/react-app/domains/cloud/get3w-balance");
  let finish:(value:BalanceSnapshot)=>void=()=>{};let fail=false;const requests:string[]=[];
  window.__GET3W_ACCOUNT__={managedModels:async()=>({enabled:false,state:"disconnected"}),models:async()=>({models:[]}),balance:async({userId})=>{requests.push(userId);if(fail)throw Error("Offline. Retry.");return new Promise(resolve=>{finish=resolve;});},status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async()=>{throw Error()}};
  const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
  const click=async()=>{await act(async()=>{node.querySelector("button")?.click();});};
  try {
    await act(async()=>{root.render(<Get3wBalance userId="a"/>);});expect(requests).toEqual(["a"]);const old=finish;
    await act(async()=>{root.render(<Get3wBalance userId="b"/>);old({balance:{amount:"12.123456",currency:"USD"}});});
    expect(requests).toEqual(["a","b"]);expect(node.querySelector("[aria-busy=true]")).not.toBeNull();expect(node.textContent).not.toContain("12.123456");
    await act(async()=>{finish({balance:{amount:"0.000000",currency:"CNY"}});});
    expect(node.textContent).toContain(formatAccountBalance("0.000000","CNY"));
    const count=requests.length;
    await act(async()=>{window.dispatchEvent(new Event("focus"));});
    expect(requests.length).toBe(count+1);
    await act(async()=>{finish({balance:{amount:"70.000000",currency:"CNY"}});});
    expect(node.textContent).toContain(formatAccountBalance("70.000000","CNY"));
    fail=true;await click();expect(node.textContent).toContain("Service unavailable. Check your connection and try again.");expect(node.textContent).not.toContain(formatAccountBalance("0.000000","CNY"));
  }finally{await act(async()=>{root.unmount();});node.remove();delete window.__GET3W_ACCOUNT__;}
});

test("top up follows refresh balance and opens the Web recharge page", async () => {
 const { Get3wBalance } = await import("../src/react-app/domains/cloud/get3w-balance");
 const originalOpen = window.open;
 const opened: string[] = [];
 window.open = (url) => { opened.push(String(url)); return null; };
 const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
 try {
  await act(async () => root.render(<Get3wBalance userId="top-up-test" />));
  const buttons = [...node.querySelectorAll("button")];
  expect(buttons.map(button => button.textContent)).toEqual(["Refresh balance", "Top up"]);
  expect(buttons[1]?.disabled).toBe(false);
  await act(async () => buttons[1]?.click());
  expect(opened).toEqual(["https://get3w.com/top-up"]);
 } finally { await act(() => root.unmount()); node.remove(); window.open = originalOpen; }
});

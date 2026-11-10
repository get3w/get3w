import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import type { SettingsDocument } from "../src/react-app/domains/cloud/get3w-settings-policy";
const local = {showThinking:false,desktopNotifications:"off",linkOpenDestination:"openwork",keepAwake:true,apiKey:"private",defaultModel:{modelID:"local"}};
let applied=local;
mock.module("../src/react-app/kernel/local-provider",()=>({useLocal:()=>({prefs:applied,setPrefs:(update:(p:typeof local)=>typeof local)=>{applied=update(applied)}})}));
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{(await import("../src/i18n")).setLocale("en");GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("account switch discards late cloud responses and requires a new read",async()=>{
  const {Get3wSettings}=await import("../src/react-app/domains/cloud/get3w-settings");
  let complete: (value:SettingsDocument)=>void=()=>{};
  const calls:string[]=[];
  window.__GET3W_ACCOUNT__={managedModels:async()=>({enabled:false,state:"disconnected"}),models:async()=>({models:[]}),balance:async()=>({balance:null}),status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async(input)=>{calls.push(input.userId);return new Promise(resolve=>{complete=resolve;});}};
  const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
  const click=async(label:string)=>{const button=Array.from(node.querySelectorAll("button")).find(b=>b.textContent===label);expect(button).toBeDefined();await act(async()=>{button?.click();});};
  try {
    await act(async()=>{root.render(<Get3wSettings key="a" userId="a"/>);});
    await click("Reload cloud settings");
    await act(async()=>{root.render(<Get3wSettings key="b" userId="b"/>);});
    await act(async()=>{complete({schema_version:1,revision:5,preferences:{showThinking:true,desktopNotifications:"all",linkOpenDestination:"external",keepAwake:false}});});
    expect(node.textContent).toContain("Cloud settings not loaded");
    expect(node.textContent).not.toContain("Use cloud settings");
    expect(applied).toEqual(local);
    await click("Reload cloud settings");expect(calls).toEqual(["a","b"]);
    await act(async()=>{root.unmount();});
    await act(async()=>{complete({schema_version:1,revision:1,preferences:null});});
    expect(applied).toEqual(local);
  }finally {await act(async()=>{root.unmount();});node.remove();delete window.__GET3W_ACCOUNT__;}
});

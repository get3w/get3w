import { beforeAll, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { AlwaysOnResult } from "../src/react-app/domains/workspace/always-on-result";
import { setLocale } from "../src/i18n";
import type { AlwaysOnRun, AlwaysOnStatus } from "@get3w/types/workspace";
let createRoot: typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;});
test("result review shows missing evidence, invokes explicit repair, reports failures and hides historical actions",async()=>{
 const run:AlwaysOnRun={id:"event",messageId:"msg",kind:"timer",phase:"interrupted",createdAt:1,finishedAt:2,sessionId:"ses",summary:"Will save",verification:{status:"needs_review",checkedAt:3,issues:["result_invalid","checkpoint_missing"]}};
 const calls:string[]=[];let updated=0;
 const client={async reviewAlwaysOnResult(_workspace:string,id:string,action:"verify"|"repair"):Promise<AlwaysOnStatus>{calls.push(`${id}:${action}`);if(action==="verify")throw Error("Offline");return {settings:{goal:"Goal",fullAccess:false,costAuto:false,costLimit:"7",intervalMinutes:60},paused:false,phase:"queued",sessionId:"ses",nextRunAt:null,lastError:null};}};
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<AlwaysOnResult run={run} client={client} workspaceId="ws" canReview onUpdated={()=>updated++}/>));
  expect(host.textContent).toContain("结果待核对");expect(host.textContent).toContain("缺少有效的本轮结果记录");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="重新核验")?.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Offline");
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="补全记录")?.click());
  expect(calls).toEqual(["event:verify","event:repair"]);expect(updated).toBe(1);
  await act(async()=>root.render(<AlwaysOnResult run={run} client={client} workspaceId="ws" canReview={false} onUpdated={()=>{}}/>));expect(host.querySelector("button")).toBeNull();
 }finally{await act(()=>root.unmount());host.remove();}
});

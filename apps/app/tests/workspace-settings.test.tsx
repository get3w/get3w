import {beforeAll,test,expect} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
import type {AlwaysOnSettings,AlwaysOnStatus} from "@get3w/types/workspace";
import {setLocale} from "../src/i18n";
let createRoot:typeof import("react-dom/client")["createRoot"];
let Modal:typeof import("../src/react-app/domains/workspace/rename-workspace-modal")["RenameWorkspaceModal"];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("zh");createRoot=(await import("react-dom/client")).createRoot;Modal=(await import("../src/react-app/domains/workspace/rename-workspace-modal")).RenameWorkspaceModal;});
const settings:AlwaysOnSettings={goal:"检查资料",criteria:"形成报告",behavior:"保留来源",intervalMinutes:60,fullAccess:false,costAuto:false,costLimit:"7.00"};
const status:AlwaysOnStatus={settings,paused:true,phase:"idle",sessionId:null,nextRunAt:null,lastError:null};
test("shared always-on settings contain only generic controls",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<Modal open title="持续项目" workspace={{id:"generic",path:"/tmp/generic",workspaceType:"always-on"}} busy={false} canSave onClose={()=>{}} onSave={()=>{}} onTitleChange={()=>{}} client={{alwaysOnStatus:async()=>status,updateAlwaysOnSettings:async()=>status}}/>));
  expect(document.body.textContent).not.toContain("每日简报");
  expect(document.body.textContent).not.toContain("冻结候选");
  expect(document.querySelectorAll('input[type="time"]').length).toBe(0);
  expect(document.querySelectorAll('[role="switch"]').length).toBe(2);
  expect(document.body.textContent).toContain("检查间隔");
 }finally{await act(()=>root.unmount());host.remove();}
});
test("local settings retain name saving and don't request always-on data",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);let reads=0,saves=0;
 try{await act(async()=>root.render(<Modal open title="标准项目" workspace={{id:"local",path:"/tmp/local",workspaceType:"local"}} busy={false} canSave onClose={()=>{}} onSave={()=>{saves++;}} onTitleChange={()=>{}} client={{alwaysOnStatus:async()=>{reads++;return status;},updateAlwaysOnSettings:async()=>status}}/>));
 expect(document.body.textContent).toContain("修改设置");expect(document.body.textContent).toContain("/tmp/local");expect(document.querySelectorAll("textarea").length).toBe(0);
 await act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="保存")?.click());expect(saves).toBe(1);expect(reads).toBe(0);
 }finally{await act(()=>root.unmount());host.remove();}
});
test("always-on settings load and reuse creation fields, reject empty goal and retain errors",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const saved:AlwaysOnSettings[]=[];let fail=true,saves=0;
 try{await act(async()=>root.render(<Modal open title="持续项目" workspace={{id:"always",path:"/tmp/always",workspaceType:"always-on"}} busy={false} canSave onClose={()=>{}} onSave={()=>{saves++;}} onTitleChange={()=>{}} client={{alwaysOnStatus:async()=>status,updateAlwaysOnSettings:async(_,value)=>{if(fail)throw Error("服务暂不可用");saved.push(value);return {...status,settings:value};}}}/>));
 expect(document.querySelector("textarea")?.value).toBe("检查资料\n\n形成报告\n\n保留来源");
 expect(document.querySelectorAll("textarea").length).toBe(1);expect(document.body.textContent).toContain("检查间隔");expect(document.body.textContent).toContain("费用批准");
 const goal=document.querySelector("textarea");const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
 async function change(value:string){await act(async()=>{setter?.call(goal,value);goal?.dispatchEvent(new Event("input",{bubbles:true}));});}
 const save=()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="保存");
 await change("");expect(save()?.disabled).toBe(true);await change("调整后的目标");await act(async()=>save()?.click());expect(document.querySelector('[role="alert"]')?.textContent).toContain("服务暂不可用");expect(saves).toBe(0);
 fail=false;await act(async()=>save()?.click());expect(saved[0]?.goal).toBe("调整后的目标");expect(saves).toBe(1);
 }finally{await act(()=>root.unmount());host.remove();}
});

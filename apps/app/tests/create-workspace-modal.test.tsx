import {beforeAll,test,expect} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
let CreateWorkspaceModal:typeof import("../src/react-app/domains/workspace/create-workspace-modal")["CreateWorkspaceModal"];
import {setLocale} from "../src/i18n";
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("en");createRoot=(await import("react-dom/client")).createRoot;CreateWorkspaceModal=(await import("../src/react-app/domains/workspace/create-workspace-modal")).CreateWorkspaceModal;});
test("add workspace opens the compact form directly and submits the selected folder and project name",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const calls:unknown[]=[];let picks=0;
 const props={open:true,onClose:()=>{},onPickFolder:async()=>{picks++;return "/workspace/design";},onConfirm:(...args:unknown[])=>{calls.push(args);}};
 try{
  await act(async()=>root.render(<CreateWorkspaceModal {...props}/>));
  const dialog=document.querySelector('[role="dialog"]');expect(dialog).not.toBeNull();
  expect(dialog?.querySelectorAll("input").length).toBe(1);
  expect(dialog?.querySelector('[aria-label="Back"]')).toBeNull();
  expect(dialog?.textContent).not.toContain("analytics");expect(dialog?.textContent).not.toContain("team template");
  const buttons=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
  const confirm=()=>buttons().find(button=>button.textContent?.includes("Create Workspace"));
  expect(confirm()?.disabled).toBe(true);
  const input=dialog?.querySelector("input");if(!input)throw Error("Missing project name");
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
  await act(async()=>{setter?.call(input,"Design");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>{buttons().find(button=>button.textContent?.includes("Select folder"))?.click();await new Promise(resolve=>setTimeout(resolve,50));});
  expect(picks).toBe(1);expect(dialog?.textContent).toContain("/workspace/design");expect(confirm()?.disabled).toBe(false);
  await act(async()=>confirm()?.click());
  expect(calls).toEqual([["starter","/workspace/design",{projectLabel:"Design"}]]);
  await act(async()=>root.render(<CreateWorkspaceModal {...props} open={false}/>));
  await act(async()=>root.render(<CreateWorkspaceModal {...props}/>));
  expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("");expect(confirm()?.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());node.remove();}
});
test("unavailable local file picker keeps creation disabled with its reason",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try{
  await act(async()=>root.render(<CreateWorkspaceModal open onClose={()=>{}} onPickFolder={async()=>null} onConfirm={()=>{throw Error("Must not create");}} localDisabled localDisabledReason="Desktop required"/>));
  const dialog=document.querySelector('[role="dialog"]');expect(dialog?.textContent).toContain("Desktop required");
  for(const button of dialog?.querySelectorAll<HTMLButtonElement>('button')??[])if(/Select folder|Create Workspace/.test(button.textContent??""))expect(button.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());node.remove();}
});

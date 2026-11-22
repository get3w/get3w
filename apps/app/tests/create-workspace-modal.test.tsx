import {beforeAll,test,expect} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
let CreateWorkspaceModal:typeof import("../src/react-app/domains/workspace/create-workspace-modal")["CreateWorkspaceModal"];
import {setLocale} from "../src/i18n";
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);setLocale("en");createRoot=(await import("react-dom/client")).createRoot;CreateWorkspaceModal=(await import("../src/react-app/domains/workspace/create-workspace-modal")).CreateWorkspaceModal;});
async function chooseType(name: string) {
 await act(async()=>{Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(b=>b.textContent?.startsWith(name))?.click();});
}
test("add workspace opens type selection first and submits the selected folder and project name",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const calls:unknown[]=[];let picks=0;
 const props={open:true,onClose:()=>{},onPickFolder:async()=>{picks++;return "/workspace/design";},onConfirm:(...args:unknown[])=>{calls.push(args);}};
 try{
  await act(async()=>root.render(<CreateWorkspaceModal {...props}/>));
  expect(document.querySelector('[role="dialog"] input')).toBeNull();
  await chooseType("Standard");
  const dialog=document.querySelector('[role="dialog"]');expect(dialog).not.toBeNull();
  expect(dialog?.querySelectorAll('input:not([type="hidden"]):not([type="radio"])').length).toBe(1);
  expect(dialog?.querySelector('[aria-label="Back"]')).toBeNull();
  expect(dialog?.textContent).not.toContain("analytics");expect(dialog?.textContent).not.toContain("team template");
  const buttons=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
  const confirm=()=>buttons().find(button=>button.textContent?.includes("Create Workspace"));
  expect(confirm()?.disabled).toBe(true);
  const input=dialog?.querySelector('input:not([type="hidden"]):not([type="radio"])');if(!input)throw Error("Missing project name");
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
  await act(async()=>{setter?.call(input,"Design");input.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>{buttons().find(button=>button.textContent?.includes("Select folder"))?.click();await new Promise(resolve=>setTimeout(resolve,50));});
  expect(picks).toBe(1);expect(dialog?.textContent).toContain("/workspace/design");expect(confirm()?.disabled).toBe(false);
  await act(async()=>confirm()?.click());
  expect(calls).toEqual([["starter","/workspace/design",{projectLabel:"Design"}]]);
  await act(async()=>root.render(<CreateWorkspaceModal {...props} open={false}/>));
  await act(async()=>root.render(<CreateWorkspaceModal {...props}/>));
  expect(document.querySelector('[role="dialog"] input')).toBeNull();
  await chooseType("Standard");
  expect(document.querySelector<HTMLInputElement>('[role="dialog"] input:not([type="hidden"]):not([type="radio"])')?.value).toBe("");expect(confirm()?.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());node.remove();}
});
test("unavailable local file picker keeps creation disabled with its reason",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try{
  await act(async()=>root.render(<CreateWorkspaceModal open onClose={()=>{}} onPickFolder={async()=>null} onConfirm={()=>{throw Error("Must not create");}} localDisabled localDisabledReason="Desktop required"/>));
  await chooseType("Standard");
  const dialog=document.querySelector('[role="dialog"]');expect(dialog?.textContent).toContain("Desktop required");
  for(const button of dialog?.querySelectorAll<HTMLButtonElement>('button')??[])if(/Select folder|Create Workspace/.test(button.textContent??""))expect(button.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());node.remove();}
});
test("always-on creation validates a goal and submits the complete settings without changing local creation",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);const calls:unknown[]=[];
 try{
  await act(async()=>root.render(<CreateWorkspaceModal open onClose={()=>{}} onPickFolder={async()=>"/workspace/always-on"} onConfirm={(...args)=>{calls.push(args);}}/>));
  await chooseType("Always-on");
  expect(document.querySelectorAll('[role="dialog"] textarea').length).toBe(1);
  expect(document.querySelectorAll('[role="dialog"] [role="switch"]').length).toBe(2);
  const create=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(b=>b.textContent==="Create and run");
  expect(create()?.disabled).toBe(true);
  await act(async()=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.includes("Select folder"))?.click());
  expect(create()?.disabled).toBe(true);
  const goal=document.querySelector('textarea');if(!goal)throw Error("Goal missing");
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(goal,"Check local reports");goal.dispatchEvent(new Event("input",{bubbles:true}));});
  expect(create()?.disabled).toBe(false);
  await act(async()=>create()?.click());
  expect(calls).toEqual([["starter","/workspace/always-on",{projectLabel:null,workspaceType:"always-on",alwaysOn:{goal:"Check local reports",criteria:"",behavior:"",fullAccess:false,costAuto:false,costLimit:"7.00",intervalMinutes:60}}]]);
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Back to workspace types"]')?.click());
  await chooseType("Standard");expect(document.querySelector('[role="dialog"] textarea')).toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();}
});

test("always-on full access requires confirmation and resets acknowledgement on cancellation",async()=>{
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const toggle=()=>document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Allow full access"]');
 const button=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===name && b.closest('[role="dialog"][data-open]')?.querySelector('[role="checkbox"]'));
 const confirm=()=>document.querySelector('[role="dialog"][data-open] [role="checkbox"]');
 try{
  await act(async()=>root.render(<CreateWorkspaceModal open onClose={()=>{}} onPickFolder={async()=>null} onConfirm={()=>{throw Error("Preview must not create");}}/>));
  await chooseType("Always-on");
  await act(async()=>toggle()?.click());
  expect(toggle()?.getAttribute("aria-checked")).toBe("false");
  expect(button("Allow full access")?.disabled).toBe(true);
  await act(async()=>confirm()?.closest("label")?.click());
  expect(button("Allow full access")?.disabled).toBe(false);
  await act(async()=>button("Cancel")?.click());
  expect(toggle()?.getAttribute("aria-checked")).toBe("false");
  await act(async()=>toggle()?.click());
  expect(button("Allow full access")?.disabled).toBe(true);
  await act(async()=>button("Cancel")?.click());
  expect(document.querySelector('[role="checkbox"]')?.closest('[role="dialog"]')?.hasAttribute('data-open') ?? false).toBe(false);
  expect(toggle()?.getAttribute("aria-checked")).toBe("false");
  await act(async()=>toggle()?.click());
  await act(async()=>confirm()?.closest("label")?.click());
  await act(async()=>button("Allow full access")?.click());
  expect(toggle()?.getAttribute("aria-checked")).toBe("true");
  await act(async()=>toggle()?.click());
  expect(toggle()?.getAttribute("aria-checked")).toBe("false");
 }finally{await act(async()=>root.unmount());node.remove();}
});

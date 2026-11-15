/** @jsxImportSource react */
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
const ownsDom = !GlobalRegistrator.isRegistered;
if (ownsDom) GlobalRegistrator.register({ url: "http://localhost/" });
const {act} = await import("react");
const {createRoot} = await import("react-dom/client");
Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
import type {OpenworkServerClient,OpenworkWorkspaceCatalogEntry} from "../src/app/lib/openwork-server";
const files:OpenworkWorkspaceCatalogEntry[]=[{path:"report.txt",kind:"file",size:10,mtimeMs:1,revision:"1"},{path:"other.txt",kind:"file",size:5,mtimeMs:1,revision:"1"}];
mock.module("../src/react-app/domains/session/artifacts/workspace-file-tree",()=>({WorkspaceFileTree:({entries,onOpenFile}:{entries:OpenworkWorkspaceCatalogEntry[];onOpenFile:(entry:OpenworkWorkspaceCatalogEntry)=>void})=><div>{entries.map(entry=><button key={entry.path} onClick={()=>onOpenFile(entry)}>{entry.path}</button>)}</div>}));
mock.module("../src/react-app/domains/session/artifacts/artifact-text-editor",()=>({ArtifactTextEditor:({value,onChange}:{value:string;onChange:(value:string)=>void})=><textarea value={value} onChange={event=>onChange(event.target.value)}/>}));
mock.module("../src/react-app/domains/session/artifacts/artifact-code-view",()=>({ArtifactCodeView:({content}:{content:string})=><pre>{content}</pre>}));
const {createOpenworkServerClient}=await import("../src/app/lib/openwork-server");
const {setLocale}=await import("../src/i18n"); setLocale("en");
const {OutputsPage}=await import("../src/react-app/domains/cloud/outputs-page");
let root:ReturnType<typeof createRoot>|null=null;
let host:HTMLDivElement;
let writes:Record<string,unknown>[]=[];
let failSave=false;
let reads:string[]=[];
let resolveSlow:((response:Response)=>void)|undefined;
const originalFetch=globalThis.fetch;
let testScope=0;
async function mount(workspace=`test-${++testScope}`, localWorkspace=false){
 if(!root){host=document.createElement("div");document.body.append(host);root=createRoot(host);}
 const client:OpenworkServerClient=createOpenworkServerClient({baseUrl:"http://localhost:8989",token:"test"});
 globalThis.fetch=Object.assign(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith("/browser"))return Response.json({items:files,truncated:false});
  if(url.pathname.endsWith("/stat"))return Response.json({size:10,updatedAt:1});
  if(init?.method==="POST"){
   writes.push(JSON.parse(String(init.body)));
   if(failSave)return Response.json({message:"conflict"},{status:409});
   return Response.json({updatedAt:2});
  }
  reads.push(url.toString());
  if(url.searchParams.get("path")==="slow.txt")return new Promise<Response>(resolve=>{resolveSlow=resolve;});
  return Response.json({content:`${workspace} file content`,updatedAt:1});
 },{preconnect:originalFetch.preconnect});
 await act(async()=>{root?.render(<OutputsPage client={client} workspaceId={workspace} workspaceRoot={`/workspace/${workspace}`} localWorkspace={localWorkspace} />);await new Promise(resolve=>setTimeout(resolve,10));});
}
async function click(label:string){
 const button=[...host.querySelectorAll("button")].find(button=>button.textContent===label||button.getAttribute("aria-label")===label);
 if(!button)throw Error(`Missing ${label}`);
 await act(async()=>{button.click();await new Promise(resolve=>setTimeout(resolve,10));});
}
async function edit(value="my draft"){
 await click("report.txt");await click("Edit");
 const input=host.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));});
}
afterEach(async()=>{await act(async()=>root?.unmount());root=null;host?.remove();globalThis.fetch=originalFetch;writes=[];reads=[];failSave=false;resolveSlow=undefined;});
afterAll(async()=>{if(ownsDom)await GlobalRegistrator.unregister();});
test("workspace page loads files without account or conversation state",async()=>{
 await mount();await click("report.txt");expect(host.textContent).toContain("file content");expect(host.textContent).not.toContain("All conversations");expect(reads[0]).toContain("fileScope=workspace");expect(reads[0]).not.toContain("session=");
});
test("switching files protects drafts and saving writes only the current workspace file",async()=>{
 await mount();await edit();await click("other.txt");
 expect(document.body.textContent).toContain("Unsaved changes");
 const save=[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent==="Save");expect(save).toBeDefined();
 await act(async()=>{if(save instanceof HTMLElement)save.click();await new Promise(resolve=>setTimeout(resolve,20));});
 expect(writes[0]).toMatchObject({path:"report.txt",content:"my draft",baseUpdatedAt:1,fileScope:"workspace"});expect(host.textContent).toContain("other.txt");
});
test("save conflicts retain draft and keep pending navigation blocked",async()=>{
 await mount();await edit();failSave=true;await click("other.txt");
 const save=[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent==="Save");
 await act(async()=>{if(save instanceof HTMLElement)save.click();await new Promise(resolve=>setTimeout(resolve,20));});
 expect(host.querySelector("textarea")?.value).toBe("my draft");expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(host.textContent).toContain("Your draft is retained");
});
test("switching workspaces isolates selected files and restores retained drafts only in their workspace",async()=>{
 const scope=`isolation-${++testScope}`;
 await mount(scope);await edit();
 await mount(scope+"-other");expect(host.querySelector("textarea")).toBeNull();expect(host.textContent).toContain("Select a file");
 await mount(scope);await click("report.txt");
 expect(host.querySelector("textarea")?.value).toBe("my draft");
 await click("Discard changes");
});
test("a delayed old workspace read cannot replace the new workspace preview",async()=>{
 files.push({path:"slow.txt",kind:"file",size:1,mtimeMs:1,revision:"1"});
 try{
  await mount("old-scope");await click("slow.txt");
  await mount("new-scope");await click("report.txt");
  await act(async()=>{resolveSlow?.(Response.json({content:"stale old content",updatedAt:1}));await new Promise(resolve=>setTimeout(resolve,10));});
  expect(host.textContent).toContain("new-scope file content");expect(host.textContent).not.toContain("stale old content");
 }finally{files.pop();}
});

test("external open joins workspace-relative paths before invoking the native boundary",async()=>{
 const calls:Array<{command:string;args:unknown[]}>=[];
 Reflect.set(window,"__OPENWORK_ELECTRON__",{invokeDesktop:async(command:string,...args:unknown[])=>{
  calls.push({command,args});
  if(command==="__joinPath")return args.join("/");
  if(command==="__openWorkspaceFile")return {ok:true,action:"opened"};
  throw Error(`Unexpected ${command}`);
 }});
 try{
  await mount("native-open",true);await click("report.txt");await click("Open");
  expect(calls).toEqual([{command:"__joinPath",args:["/workspace/native-open","report.txt"]},{command:"__openWorkspaceFile",args:["/workspace/native-open","/workspace/native-open/report.txt",{reveal:false}]}]);
  expect(host.textContent).not.toContain("Error:");
 }finally{Reflect.deleteProperty(window,"__OPENWORK_ELECTRON__");}
});


test("preview actions live in the main header and retain reload, save and discard behavior",async()=>{
 await mount();await click("report.txt");
 const header=host.querySelector("header")!;
 const reload=header.querySelector<HTMLButtonElement>('button[aria-label="Reload"]');
 expect(reload).not.toBeNull();
 expect(host.querySelector("section button")).toBeNull();
 const initialReads=reads.length;
 await click("Reload");expect(reads.length).toBe(initialReads+1);
 await edit();
 expect(reload?.disabled).toBe(true);
 expect(header.textContent).toContain("Unsaved changes");
 await click("Save");
 expect(writes[0]).toMatchObject({path:"report.txt",content:"my draft",fileScope:"workspace"});
 expect(reload?.disabled).toBe(false);
 await click("Preview");await edit("another draft");
 await click("Discard changes");
 expect(host.querySelector("textarea")).toBeNull();
 expect(header.textContent).not.toContain("Unsaved changes");
});

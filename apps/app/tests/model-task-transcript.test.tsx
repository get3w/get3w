import {beforeAll,expect,test} from "bun:test";
import type {UIMessage} from "ai";
import type {ModelTask} from "../src/react-app/domains/cloud/get3w-account";
let modelTaskAnchors:typeof import("../src/react-app/domains/cloud/model-task-status")["modelTaskAnchors"];
beforeAll(async()=>{
 const {GlobalRegistrator}=await import("@happy-dom/global-registrator");
 if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
 modelTaskAnchors=(await import("../src/react-app/domains/cloud/model-task-status")).modelTaskAnchors;
});
const messages:UIMessage[]=[
 {id:"first",role:"assistant",parts:[],metadata:{opencode:{created:100}}},
 {id:"follow-up",role:"user",parts:[],metadata:{opencode:{created:300}}},
 {id:"second",role:"assistant",parts:[],metadata:{opencode:{created:400}}},
];
const task=(patch:Partial<ModelTask>):ModelTask=>({key:"image",slug:"provider/image/run",status:"processing",requestId:"request",updatedAt:500,outputs:[],...patch});
test("task stays at its original message through completion and follow-up turns",()=>{
 for(const status of ["processing","completed","detached","failed"]){
  expect(modelTaskAnchors([task({messageId:"first",status})],messages).get("image")).toBe("first");
 }
});
test("legacy tasks use submission time instead of completion time",()=>{
 expect(modelTaskAnchors([task({createdAt:200,status:"completed"})],messages).get("image")).toBe("first");
});
test("unloaded historical messages never fall back to the current turn",()=>{
 expect(modelTaskAnchors([task({messageId:"unloaded",createdAt:450})],messages).size).toBe(0);
 expect(modelTaskAnchors([task({createdAt:50})],messages).size).toBe(0);
 expect(modelTaskAnchors([task({})],messages).size).toBe(0);
});

test("polled tasks render once between their turn and a later conversation, with scoped actions",async()=>{
 const {GlobalRegistrator}=await import("@happy-dom/global-registrator");
 if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
 Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
 const {act,createElement}=await import("react");
 const {createRoot}=await import("react-dom/client");
 const {MemoryRouter}=await import("react-router");
 const {Get3wAccount}=await import("../src/react-app/domains/cloud/get3w-account");
 const {ModelTasksProvider,ModelTaskStatus}=await import("../src/react-app/domains/cloud/model-task-status");
 const calls:unknown[]=[];
 const original=task({messageId:"first"});
 Reflect.set(window,"__GET3W_ACCOUNT__",{
  status:async()=>({status:"signed_in",user:{id:"fixture",name:"Fixture"},error:null,pending:false}),
  taskCatalog:async()=>({catalog_version:"fixture",expiresAt:Date.now()+60000,offline:false,models:[]}),
  modelTasks:async(input:{action:string})=>{calls.push(input);return {items:[{...original,status:input.action==="detach"?"detached":"processing"}]};},
 });
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try{
  await act(async()=>root.render(createElement(MemoryRouter,{},createElement(Get3wAccount),createElement(ModelTasksProvider,{workspaceId:"ws",sessionId:"session",messages,children:createElement("div",{},
   createElement("p",{},"Original reply"),createElement(ModelTaskStatus,{messageIds:["first"]}),
   createElement("p",{},"Follow-up"),createElement(ModelTaskStatus,{messageIds:["second"]}))}))));
  expect(node.querySelectorAll('[data-model-task="image"]').length).toBe(1);
  const row=node.querySelector('[data-model-task="image"]');
  expect(row?.closest("section")?.previousElementSibling?.textContent).toBe("Original reply");
  expect(row?.closest("section")?.nextElementSibling?.textContent).toBe("Follow-up");
  const button=row?.querySelector("button");
  await act(async()=>button?.click());
  expect(calls).toContainEqual({userId:"fixture",workspaceId:"ws",sessionId:"session",key:"image",action:"detach"});
 }finally{await act(async()=>root.unmount());node.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});

test("deduplication only uses displayed assistant images from the original turn",async()=>{
 const {modelTaskImageSources,hasDisplayedTaskImage}=await import("../src/react-app/domains/cloud/model-task-status");
 const turns:UIMessage[]=[
  {id:"user",role:"user",parts:[{type:"file",mediaType:"image/png",url:"https://example.com/reference.png"}]},
  {id:"first",role:"assistant",parts:[{type:"file",mediaType:"image/png",url:"data:image/png;base64,Y3Vw"}]},
  {id:"reply",role:"assistant",parts:[{type:"text",text:"![Cup](https://xianchou.com/cup.png)\n[Download](https://xianchou.com/link.png)"}]},
  {id:"next-user",role:"user",parts:[]},
  {id:"next",role:"assistant",parts:[{type:"file",mediaType:"image/png",url:"https://xianchou.com/next.png"}]},
 ];
 const sources=modelTaskImageSources(turns,"reply");
 expect(hasDisplayedTaskImage(sources,["https://xianchou.com/cup.png"])).toBe(true);
 expect(hasDisplayedTaskImage(sources,[],"Y3Vw")).toBe(true);
 for(const url of ["https://example.com/reference.png","https://xianchou.com/link.png","https://xianchou.com/next.png"])expect(hasDisplayedTaskImage(sources,[url])).toBe(false);
 expect(hasDisplayedTaskImage(sources,[],"b3RoZXI=")).toBe(false);
 expect(modelTaskImageSources(turns,"missing").size).toBe(0);
});

test("duplicate local image keeps its download link but omits the second preview",async()=>{
 const {GlobalRegistrator}=await import("@happy-dom/global-registrator");
 if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
 Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
 const {act,createElement}=await import("react");
 const {createRoot}=await import("react-dom/client");
 const originalObserver=globalThis.IntersectionObserver;
 Reflect.set(globalThis,"IntersectionObserver",undefined);
 const {OutputPreview}=await import("../src/react-app/domains/cloud/output-preview");
 const {hasDisplayedTaskImage}=await import("../src/react-app/domains/cloud/model-task-status");
 const sources=new Set(["data:image/png;base64,Y3Vw"]);
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const file={path:"output-result.png",mimeType:"image/png",sizeBytes:3};
 const read=async()=>({dataBase64:"Y3Vw",mimeType:"image/png",sizeBytes:3});
 try{
  await act(async()=>root.render(createElement(OutputPreview,{file,read,compact:true,hideImage:value=>hasDisplayedTaskImage(sources,[],value.dataBase64)})));
  expect(node.querySelector("img")).toBeNull();
  expect(node.querySelector("a[download]")?.getAttribute("download")).toBe("output-result.png");
  sources.clear();
  await act(async()=>root.render(createElement(OutputPreview,{file,read,compact:true,hideImage:value=>hasDisplayedTaskImage(sources,[],value.dataBase64)})));
  expect(node.querySelector("img")).not.toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();Reflect.set(globalThis,"IntersectionObserver",originalObserver);}
});

test("re-encoded read previews match pixels while different images and aspect ratios stay visible",async()=>{
 const {GlobalRegistrator}=await import("@happy-dom/global-registrator");if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register();
 const {hasMatchingTaskImage}=await import("../src/react-app/domains/cloud/model-task-status");
 const originalImage=window.Image,originalCreate=document.createElement.bind(document);
 class DecodedImage{src="";naturalWidth=100;naturalHeight=100;async decode(){if(this.src.includes("wide"))this.naturalWidth=200;}}
 Reflect.set(window,"Image",DecodedImage);
 let source="";
 Reflect.set(document,"createElement",(name:string)=>name==="canvas"?{getContext:()=>({fillRect:()=>{},drawImage:(image:DecodedImage)=>{source=image.src;},getImageData:()=>({data:new Uint8ClampedArray(4096).fill(source.includes("different")?200:source.includes("jpeg")?101:100)})})}:originalCreate(name));
 try{
  expect(await hasMatchingTaskImage(new Set(["data:image/jpeg;base64,preview"]),[],"original","image/png")).toBe(true);
  expect(await hasMatchingTaskImage(new Set(["data:image/jpeg;base64,different"]),[],"original","image/png")).toBe(false);
  expect(await hasMatchingTaskImage(new Set(["data:image/jpeg;base64,wide"]),[],"original","image/png")).toBe(false);
 }finally{Reflect.set(window,"Image",originalImage);Reflect.set(document,"createElement",originalCreate);}
});

test("an inline image never hides the task metadata or other outputs",async()=>{
 const {GlobalRegistrator}=await import("@happy-dom/global-registrator");if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:"http://localhost/"});
 Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
 const {act,createElement,useEffect}=await import("react");const {createRoot}=await import("react-dom/client");const {MemoryRouter}=await import("react-router");
 const {Get3wAccount}=await import("../src/react-app/domains/cloud/get3w-account");
 const {ModelTasksProvider,ModelTaskStatus,useTaskImageRegistration}=await import("../src/react-app/domains/cloud/model-task-status");
 const turns:UIMessage[]=[{id:"first",role:"assistant",parts:[{type:"text",text:"[Cup](cup.png)"}]}];
 Reflect.set(window,"__GET3W_ACCOUNT__",{
  status:async()=>({status:"signed_in",user:{id:"fixture"},error:null,pending:false}),
  taskCatalog:async()=>({catalog_version:"fixture",expiresAt:Date.now()+60000,offline:false,models:[]}),
  modelTasks:async()=>({items:[task({messageId:"first",slug:"demo/text-to-image",status:"completed"})]}),
 });
 function LoadedImage({loaded}:{loaded:boolean}){const register=useTaskImageRegistration();useEffect(()=>loaded?register?.("cup.png"):undefined,[loaded,register]);return null;}
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 const render=(loaded:boolean)=>createElement(MemoryRouter,{},createElement(Get3wAccount),createElement(ModelTasksProvider,{workspaceId:"ws",sessionId:"session",messages:turns,children:createElement("div",{},createElement(LoadedImage,{loaded}),createElement(ModelTaskStatus,{messageIds:["first"]}))}));
 try{
  await act(async()=>root.render(render(false)));expect(node.querySelector('[data-model-task="image"]')).not.toBeNull();
  await act(async()=>root.render(render(true)));expect(node.querySelector('[data-model-task="image"]')).not.toBeNull();
  await act(async()=>root.render(render(false)));expect(node.querySelector('[data-model-task="image"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});

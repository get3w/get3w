import {expect,test} from "bun:test";
import type {UIMessage} from "ai";
import type {ModelTask} from "../src/react-app/domains/cloud/get3w-account";
import {modelTaskAnchors} from "../src/react-app/domains/cloud/model-task-status";
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
 GlobalRegistrator.register({url:"http://localhost/"});
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
 }finally{await act(async()=>root.unmount());node.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");GlobalRegistrator.unregister();}
});

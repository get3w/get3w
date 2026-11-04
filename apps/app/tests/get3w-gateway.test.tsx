import {afterAll,beforeAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test("gateway requires explicit workspace consent and ignores old organization replies",async()=>{
 const {Get3wGateway}=await import("../src/react-app/domains/cloud/get3w-gateway");
 const {WorkspaceProvider}=await import("../src/react-app/shell/workspace-provider");
 const calls:{organizationId?:string;action:string;workspaceId:string}[]=[];
 let finish:(v:{enabled:boolean;state:string})=>void=()=>{};
 window.__OPENWORK_ACCOUNT__={managedMcp:async input=>{calls.push(input);return new Promise(resolve=>{finish=resolve;});},managedModels:async()=>({enabled:false,state:'disconnected'}),updateMember:async()=>({ok:true}),models:async()=>({models:[]}),balance:async()=>({balance:null}),organizations:async()=>({organizations:[],selectedOrganization:null}),members:async()=>({organization_id:'',members:[]}),status:async()=>{throw Error()},begin:async()=>{throw Error()},poll:async()=>{throw Error()},cancel:async()=>{throw Error()},logout:async()=>{throw Error()},settings:async()=>{throw Error()}};
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const page=(org?:string,ws='ws')=><WorkspaceProvider client={null} workspaceId={ws} selectedWorkspaceRoot="/test"><Get3wGateway key={org} userId="u" organizationId={org}/></WorkspaceProvider>;
 try {
  await act(async()=>{root.render(page('a'));});expect(calls[0].action).toBe('status');
  await act(async()=>{finish({enabled:false,state:'disconnected'});});
  await act(async()=>{node.querySelector('button')?.click();});expect(calls[1]).toEqual({userId:'u',organizationId:'a',workspaceId:'ws',action:'enable'});
  const old=finish;await act(async()=>{root.render(page('b'));});
  await act(async()=>{old({enabled:true,state:'configured'});});expect(node.textContent).not.toContain('Added to this workspace');
  await act(async()=>{finish({enabled:false,state:'disconnected'});root.render(page('b',''));});
  expect(node.querySelector('button')?.disabled).toBe(true);
  await act(async()=>{root.render(page());});
  await act(async()=>{finish({enabled:true,state:'configured'});});
  expect(node.querySelector('button')?.disabled).toBe(false);
  expect(node.querySelector('button')?.textContent).toBe('Disconnect tools');
  await act(async()=>{node.querySelector('button')?.click();});
  expect(calls.at(-1)?.action).toBe('disable');
  await act(async()=>{finish({enabled:false,state:'disconnected'});});
  expect(node.querySelector('button')?.disabled).toBe(true);
 }finally{await act(async()=>{root.unmount();});node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

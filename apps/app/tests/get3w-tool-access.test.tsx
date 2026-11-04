import {afterAll,beforeAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test('publication does not grant; grant/revoke are explicit and access loss clears rows',async()=>{
 const {Get3wToolAccess}=await import('../src/react-app/domains/cloud/get3w-tool-access');
 let published=false,granted=false,denied=false;const writes:string[]=[];
 Object.defineProperty(window,'__OPENWORK_ACCOUNT__',{configurable:true,value:{
  members:async()=>({organization_id:'a',members:[{user_id:'u',role:'owner'}]}),
  toolAccess:async(input:{action:string;enabled?:boolean})=>{
   if(denied)throw Error('Organization access changed');
   if(input.action==='publish'){published=true;writes.push('publish');return {ok:true};}
   if(input.action==='grant'){granted=input.enabled===true;writes.push(granted?'grant':'revoke');return {ok:true};}
   return {organization_id:'a',member_id:'u',capabilities:published?[{name:'models',description:'Get3W model catalog',granted}]:[],next_cursor:null};
  }
 }});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const click=async(label:string)=>act(async()=>{const button=[...node.querySelectorAll('button')].find(b=>b.textContent===label);expect(button).toBeDefined();button?.click();});
 try {
  await act(async()=>root.render(<Get3wToolAccess userId="u" organizationId="a"/>));
  expect(writes).toEqual([]);
  await click('Manage tool access');expect(node.textContent).toContain('No published tools');
  await click('Publish Get3W model catalog');expect(writes).toEqual(['publish']);expect(node.textContent).toContain('Not granted');
  await click('Grant access');expect(writes).toEqual(['publish','grant']);expect(node.textContent).toContain('Granted');
  await click('Revoke access');expect(writes.at(-1)).toBe('revoke');expect(node.textContent).toContain('Not granted');
  denied=true;await click('Reload tool access');expect(node.querySelectorAll('li').length).toBe(0);expect(node.querySelector('[role=alert]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

import {afterAll,beforeAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test('usage requires refresh, shows exact money and clears stale identity results',async()=>{
 const {Get3wModelUsage}=await import('../src/react-app/domains/cloud/get3w-model-usage');
 let denied=false;const actions:string[]=[];
 Object.defineProperty(window,'__OPENWORK_ACCOUNT__',{configurable:true,value:{modelUsage:async(input:{action:string})=>{
  if(denied)throw Error('Account changed. Reload usage.');actions.push(input.action);
  return {organization_id:'org',billing:'personal',quota:{unit:'requests',period:'2026-11',organization:{limit:10,used:2,remaining:8},member:{limit:3,used:1,remaining:2}},entries:[{request_id:'r',requested_model:'openwork-auto',actual_model:'qwen3.6-flash',billing_model:'qwen3.6-flash',task_id:'t',status:'cancelled',created_at:1,charge:{amount:'0.123456',currency:'CNY'},balance_after:{amount:'9.876544',currency:'CNY'}}],next_cursor:null};
 }}});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const click=async()=>act(async()=>{[...node.querySelectorAll('button')].find(b=>b.textContent==='Refresh model usage')?.click();});
 try{
  await act(async()=>root.render(<Get3wModelUsage userId="u" organizationId="org" role="admin"/>));
  expect(actions).toEqual([]);expect(node.querySelectorAll('input').length).toBe(2);
  await click();expect(node.textContent).toContain('8 of 10 remaining');expect(node.textContent).toContain('cancelled');expect(node.textContent).toContain('CNY 0.123456');expect(node.textContent).toContain('CNY 9.876544');
  denied=true;await click();expect(node.querySelectorAll('li').length).toBe(0);expect(node.textContent).toContain('Account changed');
  await act(async()=>root.render(<Get3wModelUsage userId="other" organizationId="b" role="member"/>));
  expect(node.textContent).not.toContain('9.876544');expect(node.querySelectorAll('input').length).toBe(0);expect(node.textContent).toContain('Only an organization administrator');
 }finally{await act(async()=>root.unmount());node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

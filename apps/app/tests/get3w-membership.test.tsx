import {afterAll,beforeAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test('membership inbox requires explicit join and clears rejected/stale rows',async()=>{
 const {Get3wMembership}=await import('../src/react-app/domains/cloud/get3w-membership');
 let denied=false,changed=0;const actions:string[]=[];
 Object.defineProperty(window,'__OPENWORK_ACCOUNT__',{configurable:true,value:{membership:async(input:{action:string})=>{
  if(denied)throw Error('Account changed. Reload organizations.');
  actions.push(input.action);
  if(input.action==='inbox')return {invitations:[{invitation_id:'inv',organization_id:'a',organization_name:'Invited team',recipient_id:'u',role:'member',status:'pending',created_at:1,expires_at:2000}],next_cursor:null};
  return {ok:true};
 }}});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const click=async(label:string)=>act(async()=>{const b=[...node.querySelectorAll('button')].find(b=>b.textContent===label&&!b.disabled);expect(b).toBeDefined();b?.click();});
 try{
  await act(async()=>root.render(<Get3wMembership userId="u" onChanged={async()=>{changed++;}}/>));
  expect(actions).toEqual([]);await click('View my invitations');expect(node.textContent).toContain('Invited team');
  expect(actions).toEqual(['inbox']);await click('Join organization');expect(actions).toEqual(['inbox','accept']);expect(changed).toBe(1);expect(node.querySelectorAll('li').length).toBe(0);
  await click('View my invitations');denied=true;await click('View my invitations');expect(node.querySelectorAll('li').length).toBe(0);expect(node.textContent).toContain('Account changed');
  await act(async()=>root.render(<Get3wMembership userId="other" organizationId="b" role="viewer" onChanged={async()=>{}}/>));
  expect(node.textContent).not.toContain('Invited team');expect(node.querySelector('input')).toBeNull();expect(node.textContent).toContain('Only an organization administrator');
 }finally{await act(async()=>root.unmount());node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

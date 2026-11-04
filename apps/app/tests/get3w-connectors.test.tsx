import {afterAll,beforeAll,expect,test} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";
import {act} from "react";
let createRoot:typeof import("react-dom/client")["createRoot"];
beforeAll(async()=>{GlobalRegistrator.register({url:"http://localhost"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);createRoot=(await import("react-dom/client")).createRoot;});
afterAll(async()=>{await GlobalRegistrator.unregister();});
test('connections require explicit actions and retain last verified state on outage',async()=>{
 const {Get3wConnectors}=await import('../src/react-app/domains/cloud/get3w-connectors');
 let connected=false,offline=false;const writes:string[]=[];
 Object.defineProperty(window,'__OPENWORK_ACCOUNT__',{configurable:true,value:{connectors:async(input:{action:string;provider?:string})=>{
  if(offline)throw Error('Connections could not be verified. Reload connections before retrying.');
  if(input.action!=='status'){writes.push(input.action);if(input.action==='disconnect')connected=false;return {ok:true};}
  return {connectors:[{provider:'google',configured:true,connected},{provider:'microsoft',configured:false,connected:false}]};
 }}});
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const click=async(label:string)=>act(async()=>{const b=[...node.querySelectorAll('button')].find(b=>b.textContent===label&&!b.disabled);expect(b).toBeDefined();b?.click();});
 try{
  await act(async()=>root.render(<Get3wConnectors userId="u" organizationId="a" role="member"/>));
  expect(writes).toEqual([]);expect(node.textContent).toContain('Connections not verified');
  await click('Reload connections');expect(node.textContent).toContain('Not configured');
  await click('Connect');expect(writes).toEqual(['authorize']);expect(node.textContent).toContain('Finish authorization');expect(node.textContent).not.toContain('>Connected<');
  connected=true;await click('Reload connections');expect(node.textContent).toContain('Connected');
  offline=true;await click('Reload connections');expect(node.textContent).toContain('Could not verify');expect(node.textContent).toContain('Connected');
  offline=false;await click('Disconnect');expect(writes).toEqual(['authorize','disconnect']);expect(node.textContent).toContain('Provider consent remains');
  await act(async()=>root.render(<Get3wConnectors userId="u" organizationId="b" role="viewer"/>));
  expect(node.textContent).toContain('Member access required');expect([...node.querySelectorAll('button')].every(b=>b.disabled)).toBe(true);
 }finally{await act(async()=>root.unmount());node.remove();delete window.__OPENWORK_ACCOUNT__;}
});

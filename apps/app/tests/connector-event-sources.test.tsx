import {beforeAll,test,expect} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {act} from 'react';
import {ConnectorEventSources} from '../src/react-app/domains/workspace/connector-event-sources';
import {setLocale} from '../src/i18n';
let createRoot:typeof import('react-dom/client')['createRoot'];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:'http://localhost'});Reflect.set(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);setLocale('zh');createRoot=(await import('react-dom/client')).createRoot;});
test('source controls stop cloud first and show pending and reconnect status without credentials',async()=>{
 const calls:string[]=[];const item={id:'sub',source_id:'source',workspace_id:'ws',provider:'gmail',name:'Mail',enabled:true,state:'reconnect',pending:2,settings:{},gap_at:null,last_checked:null,last_error:'source_reconnect_required'};
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async({path,method,body}:{path:string;method:string;body?:{action:string}})=>{
  if(path==='/catalog')return {ok:true,json:{configured:true,items:[{id:'gmail',name:'Gmail',category:'email',transport:'poll',auth:'google'}]}};
  if(method==='PATCH'){calls.push('cloud:'+body?.action);item.enabled=body?.action==='enable';}
  return {ok:true,json:{items:[item]}};
 }});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<ConnectorEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async(_w,_s,action)=>{calls.push('local:'+action);return [];}}} onUpdated={()=>{}}/>));
  expect(host.textContent).toContain('需要重新连接');expect(host.textContent).toContain('2');expect(host.textContent).toContain('Gmail');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='停用')?.click());expect(calls).toEqual(['cloud:disable','local:disable']);
 }finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});
test('periodic refresh preserves a failed operation until another user action',async()=>{
 const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval;let refresh:(()=>void)|undefined;
 Reflect.set(globalThis,'setInterval',(fn:()=>void)=>{refresh=fn;return 1;});Reflect.set(globalThis,'clearInterval',()=>{});
 const item={id:'sub',source_id:'s',workspace_id:'ws',provider:'rss',name:'Feed',enabled:true,state:'ready',pending:0,settings:{},gap_at:null,last_checked:null,last_error:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async({path,method}:{path:string;method:string})=>method==='PATCH'?{ok:false,status:500}:path==='/catalog'?{ok:true,json:{configured:true,items:[{id:'rss',name:'RSS',category:'web',transport:'poll',auth:'none'}]}}:{ok:true,json:{items:[item]}}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<ConnectorEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='停用')?.click());expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async()=>{refresh?.();});expect(host.querySelector('[role="alert"]')).not.toBeNull();
 }finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');Reflect.set(globalThis,'setInterval',originalSet);Reflect.set(globalThis,'clearInterval',originalClear);}
});

test('RSS upstream failure does not request authorization',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async({path}:{path:string})=>({ok:true,json:path==='/catalog'?{configured:true,items:[{id:'rss',name:'RSS',category:'web',transport:'poll',auth:'none'}]}:{items:[{id:'s',source_id:'s',workspace_id:'ws',provider:'rss',name:'Feed',enabled:false,state:'retrying',pending:0,settings:{},gap_at:null,last_checked:null,last_error:'source_upstream_unavailable'}]}})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<ConnectorEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>));
  expect(host.textContent).toContain('来源暂时不可用');expect(host.textContent).not.toContain('重新授权');
 }finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

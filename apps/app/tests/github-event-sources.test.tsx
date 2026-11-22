import {beforeAll,test,expect} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {act} from 'react';
import {githubSourceFailure,GitHubEventSources} from '../src/react-app/domains/workspace/github-event-sources';
import {setLocale} from '../src/i18n';
let createRoot:typeof import('react-dom/client')['createRoot'];
beforeAll(async()=>{if(!GlobalRegistrator.isRegistered)GlobalRegistrator.register({url:'http://localhost'});Reflect.set(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);setLocale('zh');createRoot=(await import('react-dom/client')).createRoot;});
test('GitHub source shows pending count, cloud controls and local synchronization failure',async()=>{
 const calls:string[]=[];const item={id:'sub',source_id:'source',workspace_id:'ws',repository:'team/repo',repository_id:1,name:'Project',enabled:true,state:'receiving',pending:4,last_received:null,gap_at:null};
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async({path,method,body}:{path:string;method:string;body?:{action:string}})=>{
  if(path==='/github')return {ok:true,json:{configured:true,state:'connected',account:'team'}};
  if(method==='PATCH'){calls.push('cloud:'+body?.action);item.enabled=body?.action==='enable';item.state=item.enabled?'receiving':'disabled';}
  return {ok:true,json:{items:[item]}};
 }});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<GitHubEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async(_w,_s,action)=>{calls.push('local:'+action);return [];}}} onUpdated={()=>{}} localSources={[{id:'source',kind:'github',name:'Project',scope:'team/repo',enabled:true,lastReceived:null,subscriptionId:'sub',syncError:true}]}/>));
  expect(host.textContent).toContain('待同步 4');expect(host.textContent).toContain('同步失败');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='停用')?.click());
  expect(calls).toEqual(['cloud:disable','local:disable']);
 }finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});
test('unconfigured GitHub remains visible with disabled connect action',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async()=>({ok:true,json:{configured:false,state:'unconfigured'}})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<GitHubEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>));expect(host.textContent).toContain('GitHub App');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='连接 GitHub')?.disabled).toBe(true);}finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('GitHub failures distinguish missing deployment, configuration and authorization',()=>{
 expect(githubSourceFailure(404,{detail:'Not Found'})).toContain('尚未部署');
 expect(githubSourceFailure(503,{error:{code:'github_not_configured'}})).toContain('尚未配置');
 expect(githubSourceFailure(401,{})).toContain('重新登录');
 expect(githubSourceFailure(409,{error:{code:'github_reconnect_required'}})).toContain('重新授权');
 expect(githubSourceFailure(429,{})).toContain('稍后重试');
});

test('local missing route directs a local restart rather than cloud deployment',()=>{
 expect(githubSourceFailure(404,{},'http://127.0.0.1:6605')).toContain('pnpm dev:local');
 expect(githubSourceFailure(404,{},'http://127.0.0.1:6605')).not.toContain('云端');
});

test('unavailable identity does not masquerade as signed out',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:'unavailable',user:null})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<GitHubEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>));expect(host.textContent).toContain('暂时无法核验');expect(host.textContent).not.toContain('登录 Get3W 后连接');}finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('signing out clears an earlier service error',async()=>{
 let signedIn=true;
 Reflect.set(window,'__GET3W_ACCOUNT__',{status:async()=>({status:signedIn?'signed_in':'signed_out',user:signedIn?{id:'alice'}:null}),eventSources:async()=>({ok:false,status:404,json:{},serviceOrigin:'http://127.0.0.1:6605'})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<GitHubEventSources workspaceId="ws" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>));expect(host.textContent).toContain('pnpm dev:local');signedIn=false;
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='重新加载')?.click());
  expect(host.textContent).toContain('登录 Get3W 后连接');expect(host.textContent).not.toContain('pnpm dev:local');
 }finally{await act(()=>root.unmount());host.remove();Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

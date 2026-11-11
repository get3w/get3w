import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGet3wManagedMcp} from './get3w-managed-mcp.mjs';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';

test('workspace ownership, explicit reconnect, account changes and policy failures',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-mcp-'));
 let snapshot={status:'signed_in',user:{id:'u'}},closed=0,created=0,deny=false;
 const configs={existing:{type:'remote',url:'https://existing.example/mcp'}},original=structuredClone(configs);
 const deps={userData,auth:{status:async()=>({...snapshot})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'local-only-'+(++created),close:async()=>{closed++;}}),fetchImpl:async(url,opt)=>{
  assert.ok(url.startsWith('http://127.0.0.1:1234/workspace/ws/mcp'));assert.equal(opt.headers.Authorization,'Bearer client');
  if(opt.method==='POST'){if(deny)return Response.json({}, {status:403});const body=JSON.parse(opt.body);configs[body.name]=body.config;}
  if(opt.method==='DELETE')delete configs['get3w-account'];
  return Response.json({items:Object.entries(configs).map(([name,config])=>({name,config,source:'config.remote'}))});
 }};
 const input={userId:'u',workspaceId:'ws',action:'enable'};
 try {
  let m=createGet3wManagedMcp(deps);
  await m.run(input);assert.equal(configs['get3w-account'].oauth,false);
  assert.equal(configs['get3w-account'].timeout,600_000);
  await m.run({...input,sessionId:'chat-session-123456'});assert.equal(created,1);assert.equal(closed,0);
  await assert.rejects(m.run({...input,userId:'forged',action:'status',sessionId:'chat-session-654321'}),/account changed/);
  assert.equal(closed,0);assert.ok(configs['get3w-account']);
  assert.equal((await m.run({...input,action:'status',sessionId:'chat-session-654321'})).enabled,true);
  await m.run({...input,sessionId:'chat-session-123456'});assert.equal(created,1);
  await assert.rejects(m.run({...input,sessionId:'bad'}),/Invalid Get3W chat session/);
  assert.ok(!(await readFile(path.join(userData,'get3w-managed-mcp.json'),'utf8')).includes('local-only'));
  await m.close();m=createGet3wManagedMcp(deps);
  assert.equal((await m.run({...input,action:'status'})).enabled,false);assert.deepEqual(configs,original);
  deny=true;await assert.rejects(m.run(input),/Check workspace access/);assert.equal(closed,2);assert.deepEqual(configs,original);
  deny=false;await m.run(input);snapshot={...snapshot,user:{id:'other'}};await m.reconcile(snapshot);
  assert.equal(closed,3);assert.deepEqual(configs,original);
  snapshot={...snapshot,user:{id:'u'}};await m.run(input);
  configs['get3w-account'].url='https://user-edited.example/mcp';
  await assert.rejects(m.run({...input,action:'disable'}),/edited locally/);
  assert.equal(configs['get3w-account'].url,'https://user-edited.example/mcp');
  await m.close();
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('MCP proxy accepts only engine bearer and fixed route, forwards protocol and closes requests',async()=>{
 let calls=0,released=0;
 const proxy=await createGet3wMcpProxy({userId:'u',auth:{mcp:async input=>{
  calls++;assert.equal(input.method,'POST');
  assert.match(input.sessionId,/^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(input.headers['mcp-protocol-version'],'2025-03-26');
  assert.equal(input.headers['x-get3w-session-id'], undefined);
  return {response:Response.json({jsonrpc:'2.0',result:{ok:true},id:1}),release:()=>released++};
 }}});
 try {
  assert.equal((await fetch(proxy.url,{method:'POST'})).status,401);
  const headers={Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json','Mcp-Protocol-Version':'2025-03-26'};
  assert.equal((await fetch(proxy.url,{method:'POST',headers:{...headers,Origin:'https://evil.example'}})).status,401);
  assert.equal((await fetch(proxy.url+'/other',{method:'POST',headers})).status,404);
  const response=await fetch(proxy.url,{method:'POST',headers,body:'{}'});
  assert.equal(response.status,200);assert.equal((await response.json()).result.ok,true);
  assert.equal(calls,1);assert.equal(released,1);
 }finally{await proxy.close();}
});

test('idle MCP event streams flush headers before the first event',async()=>{
 const controller=new AbortController();
 const proxy=await createGet3wMcpProxy({userId:'u',auth:{mcp:async()=>({response:new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'text/event-stream'}}),release:()=>{}})}});
 try {
  const response=await fetch(proxy.url,{headers:{Authorization:`Bearer ${proxy.token}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1000)])});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/event-stream');
  controller.abort();
 }finally{await proxy.close();}
});

test('host submit approval runs before forwarding and denial never reaches cloud',async()=>{
 let forwarded=0,approved=0;
 const proxy=await createGet3wMcpProxy({userId:'u',sessionId:'chat-session-123456',approveSubmit:async input=>{approved++;assert.equal(input.sessionId,'chat-session-123456');assert.equal(input.arguments.quote_id,'q');return {allowed:false,reason:'denied'};},auth:{mcp:async()=>{forwarded++;return {response:Response.json({ok:true})};}}});
 try {
  const response=await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'execute_capability',arguments:{name:'get3w.submit',arguments:{quote_id:'q'}}}})});
  assert.equal(response.status,200);assert.equal((await response.json()).error.code,-32003);assert.equal(approved,1);assert.equal(forwarded,0);
 }finally{await proxy.close();}
});

test('offline disconnect closes the proxy without cloud checks, retains edited config and retries local cleanup',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-mcp-offline-'));
 let offline=false,localDown=false,closed=0,config;
 const input={action:'enable',workspaceId:'ws',userId:'u'};
 const auth={status:async()=>{if(offline)throw Error('offline identity');return {status:'signed_in',user:{id:'u'}};}};
 const manager=createGet3wManagedMcp({auth,userData,getServerInfo:async()=>{if(localDown)throw Error('engine unavailable');return {running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1};},createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'local-only',close:async()=>{closed++;}}),fetchImpl:async(url,options)=>{
  if(options.method==='POST')config=JSON.parse(options.body).config;
  if(options.method==='DELETE')config=undefined;
  return Response.json({items:config?[{name:'get3w-account',source:'config.remote',config}]:[]});
 }});
 try {
  await manager.run(input);offline=true;
  assert.deepEqual(await manager.run({...input,action:'status'}),{enabled:true,state:'configured'});
  localDown=true;
  await assert.rejects(manager.run({...input,action:'disable'}),/engine unavailable/);
  assert.equal(closed,1);assert.ok(config);
  localDown=false;
  assert.deepEqual(await manager.run({...input,action:'disable'}),{enabled:false,state:'disconnected'});
  assert.equal(config,undefined);assert.equal(closed,1);
  offline=false;await manager.run(input);config.url='https://user-edited.example/mcp';offline=true;
  await assert.rejects(manager.run({...input,action:'disable'}),/edited locally/);
  assert.equal(closed,2);assert.equal(config.url,'https://user-edited.example/mcp');
  await assert.rejects(manager.run(input),/offline identity/);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test('output download failures retry without submission and local reads stay offline and identity scoped',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-outputs-'));
 const scope={userId:'u',workspaceId:'ws',sessionId:'chat-session-123456'};
 const {createModelTaskJournal}=await import('./get3w-model-task-journal.mjs');
 const journal=createModelTaskJournal({userData});
 const context={type:'get3w.submit',messageId:'original-message',hash:'h',quote:{amountUsd:'0.02'},call:{arguments:{slug:'image',idempotency_key:'one'}}};
 const key=await journal.beforeSubmit(scope,context);
 await journal.observe(scope,context,{result:{structuredContent:{status:'succeeded',result:{request_id:'r',status:'completed',outputs:['https://xianchou.com/image.png']}}}});
 let identity={userId:'u'},fail=true,saves=0,cloud=0;
 const manager=createGet3wManagedMcp({userData,auth:{outputIdentity:()=>identity,status:async()=>{cloud++;return {status:'signed_in',user:{id:'u'}};}},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client'}),fetchImpl:async(url,options)=>{
  assert.ok(url.endsWith('/model-outputs'));
  const body=JSON.parse(options.body);
  if(body.action==='save'){saves++;assert.equal(body.sessionId,scope.sessionId);return Response.json({path:'image.png',mimeType:'image/png',sizeBytes:3},{status:fail?503:200});}
  return Response.json(body.action==='read'?{dataBase64:'YWJj',mimeType:'image/png',sizeBytes:3}:{items:[],truncated:false});
 }});
 try{
  const failed=await manager.tasks({...scope,action:'retryDownload',key});
  assert.match(failed.items[0].outputEntry.downloadError,/Download failed/);
  fail=false;const saved=await manager.tasks({...scope,action:'retryDownload',key});
  assert.equal(saved.items[0].outputEntry.files.length,1);assert.equal(saves,2);
  assert.equal(saved.items[0].messageId,'original-message');
  assert.equal(saved.items[0].createdAt,saved.items[0].outputEntry.createdAt);
  const before=cloud;
  assert.equal((await manager.outputs({...scope,action:'read',path:'image.png'})).dataBase64,'YWJj');
  assert.equal(cloud,before,'local read must not call cloud identity');
  const indexes=await Promise.all(Array.from({length:20},()=>manager.outputs({...scope,action:'index'})));
  assert.ok(indexes.every(result=>Array.isArray(result.items)));
  assert.equal(cloud,before,'overlapping local indexes must work without cloud identity');

  identity={userId:'other'};
  await assert.rejects(manager.outputs({...scope,action:'read',path:'image.png'}),/account changed/);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test('native artifact endpoint remains scoped and never exposes the general gateway without host context',async()=>{
 const calls=[];const aid='cob_0'+'1'.repeat(25);
 const proxy=await createGet3wMcpProxy({userId:'u',hostToken:'host-only',enforceModelGuard:true,
  auth:{artifacts:async input=>{calls.push(input);return {status:200,json:{apps:[]}};},mcp:async input=>{calls.push(input);return {response:Response.json({jsonrpc:'2.0',id:1,result:{content:[]}})};}}});
 try{
  const headers={Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'};
  const call=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'refresh',arguments:{}}});
  assert.equal((await fetch(proxy.url,{method:'POST',headers,body:call})).status,403);
  assert.equal((await fetch(proxy.url+'/apps/'+aid,{method:'POST',headers,body:call})).status,200);
  assert.equal(calls.at(-1).appId,aid);
  assert.equal(calls.at(-1).userId,'u');
  assert.equal((await fetch(proxy.url+'/apps/../../gateway',{method:'POST',headers,body:call})).status,404);
  assert.equal((await fetch(new URL('/app-index',proxy.url),{headers})).status,200);
  assert.equal(calls.at(-1).path,'/v1/mcp-apps');
  assert.equal((await fetch(proxy.url+'/apps/'+aid,{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:call})).status,401);
 }finally{await proxy.close();}
});

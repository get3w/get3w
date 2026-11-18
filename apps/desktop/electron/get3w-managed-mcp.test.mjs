import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGet3wManagedMcp,mediaOutputNaming} from './get3w-managed-mcp.mjs';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';

test('attachment edits save in visible task folders, including restored output metadata',()=>{
 for (const source of ['.get3w/inbox/chat-attachments/ses_test']) {
 assert.deepEqual(mediaOutputNaming({nativeMedia:{output:{task_name:'修复杯子',filename:'杯子.png',directory:source+'/fixed',source_path:source+'/original.png'}}}),{taskName:'修复杯子',filename:'杯子.png',directory:undefined,sourcePath:undefined});
 }
 assert.deepEqual(mediaOutputNaming({nativeMedia:{output:{task_name:'修复杯子',filename:'杯子.png',directory:'产品图',source_path:'产品图/原图.png'}}}),{taskName:'修复杯子',filename:'杯子.png',directory:'产品图',sourcePath:'产品图/原图.png'});
 // Other invalid destinations still reach the workspace validator unchanged.
 assert.equal(mediaOutputNaming({nativeMedia:{output:{directory:'../outside'}}}).directory,'../outside');
});

test('workspace ownership, explicit reconnect, account changes and policy failures',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-mcp-'));
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
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-mcp-offline-'));
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
 const context={type:'get3w.submit',messageId:'original-message',hash:'h',nativeMedia:{output:{task_name:'修复杯子',filename:'杯子.png',directory:'.get3w/inbox/chat-attachments/ses_test/fixed'}},quote:{amountUsd:'0.02'},call:{arguments:{slug:'image',idempotency_key:'one'}}};
 const key=await journal.beforeSubmit(scope,context);
 await journal.observe(scope,context,{result:{structuredContent:{status:'succeeded',result:{request_id:'r',status:'completed',outputs:['https://xianchou.com/image.png']}}}});
 let identity={userId:'u'},fail=true,saves=0,cloud=0;
 const manager=createGet3wManagedMcp({userData,auth:{outputIdentity:()=>identity,status:async()=>{cloud++;return {status:'signed_in',user:{id:'u'}};}},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client'}),fetchImpl:async(url,options)=>{
  assert.ok(url.endsWith('/model-outputs'));
  const body=JSON.parse(options.body);
  if(['plan','save'].includes(body.action)){assert.equal(body.directory,undefined);assert.equal(body.taskName,'修复杯子');assert.equal(body.filename,'杯子.png');}
  if(body.action==='plan')return Response.json({plans:[{fileId:'stable',path:'任务成果/生成图片.png',rootPath:'/fixture'}]});
  if(body.action==='save'){saves++;assert.equal(body.sessionId,scope.sessionId);return Response.json({path:'image.png',mimeType:'image/png',sizeBytes:3},{status:fail?503:200});}
  return Response.json(body.action==='read'?{dataBase64:'YWJj',mimeType:'image/png',sizeBytes:3}:{items:[],truncated:false});
 }});
 try{
  const failed=await manager.tasks({...scope,action:'retryDownload',key});
  assert.match(failed.items[0].outputEntry.downloadError,/Download failed/);
  assert.equal(failed.items[0].outputEntry.plannedFiles[0].path,'任务成果/生成图片.png');
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

test('missing ownership recovers only an exact dead legacy proxy and preserves its config backup', async () => {
 const {createServer}=await import('node:net');
 const {readdir}=await import('node:fs/promises');
 const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-orphan-'));
 const original={type:'remote',url:`http://127.0.0.1:${port}/mcp`,headers:{Authorization:`Bearer ${'a'.repeat(43)}`},oauth:false,enabled:true,timeout:600000};
 let config=structuredClone(original),writes=0;
 const deps={userData,auth:{status:async()=>({status:'signed_in',user:{id:'u'}})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'new-local',close:async()=>{}}),fetchImpl:async(_url,opt)=>{
  if(opt.method==='POST'){writes++;config=JSON.parse(opt.body).config;}
  if(opt.method==='DELETE')config=undefined;
  return Response.json({items:config?[{name:'get3w-account',source:'config.remote',config}]:[]});
 }};
 const manager=createGet3wManagedMcp(deps);
 try {
  assert.equal((await manager.run({userId:'u',workspaceId:'ws',action:'enable'})).state,'configured');
  assert.equal(writes,1);assert.equal(config.headers.Authorization,'Bearer new-local');
  const files=await readdir(path.join(userData,'get3w-mcp-recovery'));
  assert.deepEqual(JSON.parse(await readFile(path.join(userData,'get3w-mcp-recovery',files[0]),'utf8')).config,original);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test('missing ownership never adopts active or custom connections', async () => {
 const {createServer}=await import('node:net');
 const listener=createServer(socket=>socket.destroy());await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 const port=listener.address().port;
 for(const override of [{},{url:'https://custom.example/mcp'},{headers:{Authorization:'Bearer custom'}},{timeout:42},{extra:true}]) {
  const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-unowned-'));let writes=0;
  const config={type:'remote',url:`http://127.0.0.1:${port}/mcp`,headers:{Authorization:`Bearer ${'a'.repeat(43)}`},oauth:false,enabled:true,timeout:600000,...override};
  const manager=createGet3wManagedMcp({userData,auth:{status:async()=>({status:'signed_in',user:{id:'u'}})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),fetchImpl:async(_url,opt)=>{if(opt.method!=='GET')writes++;return Response.json({items:[{name:'get3w-account',source:'config.remote',config}]});}});
  try{await assert.rejects(manager.run({userId:'u',workspaceId:'ws',action:'enable'}),/edited locally/);assert.equal(writes,0);}
  finally{await manager.close();await rm(userData,{recursive:true,force:true});}
 }
 await new Promise(resolve=>listener.close(resolve));
});

test('a timed out registration retains ownership when the write commits after the empty read', async () => {
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-late-write-'));let config,pending,fail=true;
 const manager=createGet3wManagedMcp({userData,auth:{status:async()=>({status:'signed_in',user:{id:'u'}})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'fixture',close:async()=>{}}),fetchImpl:async(_url,opt)=>{
  if(opt.method==='POST'){pending=JSON.parse(opt.body).config;if(fail)throw Error('timeout');config=pending;}
  if(opt.method==='DELETE')config=undefined;
  return Response.json({items:config?[{name:'get3w-account',source:'config.remote',config}]:[]});
 }});
 try{
  await assert.rejects(manager.run({userId:'u',workspaceId:'ws',action:'enable'}),/timeout/);
  assert.ok(JSON.parse(await readFile(path.join(userData,'get3w-managed-mcp.json'),'utf8')).ws);
  config=pending;fail=false;
  assert.equal((await manager.run({userId:'u',workspaceId:'ws',action:'enable'})).state,'configured');
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test('a recorded mismatch cannot use legacy recovery even with an exact dead proxy shape', async () => {
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-edited-owned-'));
 await writeFile(path.join(userData,'get3w-managed-mcp.json'),JSON.stringify({ws:'different-fingerprint'}));
 const config={type:'remote',url:'http://127.0.0.1:1/mcp',headers:{Authorization:`Bearer ${'a'.repeat(43)}`},oauth:false,enabled:true,timeout:600000};
 let writes=0;
 const manager=createGet3wManagedMcp({userData,auth:{status:async()=>({status:'signed_in',user:{id:'u'}})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),fetchImpl:async(_url,opt)=>{if(opt.method!=='GET')writes++;return Response.json({items:[{name:'get3w-account',source:'config.remote',config}]});}});
 try{await assert.rejects(manager.run({userId:'u',workspaceId:'ws',action:'enable'}),/edited locally/);assert.equal(writes,0);}
 finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

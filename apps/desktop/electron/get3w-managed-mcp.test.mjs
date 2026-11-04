import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGet3wManagedMcp} from './get3w-managed-mcp.mjs';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';

test('workspace ownership, explicit reconnect, account changes and policy failures',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-mcp-'));
 let snapshot={status:'signed_in',user:{id:'u'},organization:{organization_id:'a',role:'member'}},closed=0,created=0,deny=false;
 const configs={existing:{type:'remote',url:'https://existing.example/mcp'}},original=structuredClone(configs);
 const deps={userData,auth:{status:async()=>({...snapshot}),organizations:async()=>({selectedOrganization:snapshot.organization})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1}),createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'local-only-'+(++created),close:async()=>{closed++;}}),fetchImpl:async(url,opt)=>{
  assert.ok(url.startsWith('http://127.0.0.1:1234/workspace/ws/mcp'));assert.equal(opt.headers.Authorization,'Bearer client');
  if(opt.method==='POST'){if(deny)return Response.json({}, {status:403});const body=JSON.parse(opt.body);configs[body.name]=body.config;}
  if(opt.method==='DELETE')delete configs['openwork-account'];
  return Response.json({items:Object.entries(configs).map(([name,config])=>({name,config,source:'config.remote'}))});
 }};
 const input={userId:'u',organizationId:'a',workspaceId:'ws',action:'enable'};
 try {
  let m=createGet3wManagedMcp(deps);
  await m.run(input);assert.equal(configs['openwork-account'].oauth,false);
  assert.ok(!(await readFile(path.join(userData,'openwork-managed-mcp.json'),'utf8')).includes('local-only'));
  await m.close();m=createGet3wManagedMcp(deps);
  assert.equal((await m.run({...input,action:'status'})).enabled,false);assert.deepEqual(configs,original);
  deny=true;await assert.rejects(m.run(input),/policy/);assert.equal(closed,2);assert.deepEqual(configs,original);
  deny=false;await m.run(input);snapshot={...snapshot,user:{id:'other'}};await m.reconcile(snapshot);
  assert.equal(closed,3);assert.deepEqual(configs,original);
  snapshot={...snapshot,user:{id:'u'}};await m.run(input);
  configs['openwork-account'].url='https://user-edited.example/mcp';
  await assert.rejects(m.run({...input,action:'disable'}),/edited locally/);
  assert.equal(configs['openwork-account'].url,'https://user-edited.example/mcp');
  await m.close();
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('MCP proxy accepts only engine bearer and fixed route, forwards protocol and closes requests',async()=>{
 let calls=0,released=0;
 const proxy=await createGet3wMcpProxy({userId:'u',organizationId:'a',auth:{mcp:async input=>{
  calls++;assert.equal(input.organizationId,'a');assert.equal(input.method,'POST');
  assert.equal(input.headers['mcp-protocol-version'],'2025-03-26');
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
 const proxy=await createGet3wMcpProxy({userId:'u',organizationId:'a',auth:{mcp:async()=>({response:new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'text/event-stream'}}),release:()=>{}})}});
 try {
  const response=await fetch(proxy.url,{headers:{Authorization:`Bearer ${proxy.token}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1000)])});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/event-stream');
  controller.abort();
 }finally{await proxy.close();}
});

test('offline disconnect closes the proxy without cloud checks, retains edited config and retries local cleanup',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-mcp-offline-'));
 let offline=false,localDown=false,closed=0,config;
 const input={action:'enable',workspaceId:'ws',userId:'u',organizationId:'a'};
 const auth={status:async()=>{if(offline)throw Error('offline identity');return {status:'signed_in',user:{id:'u'}};},organizations:async()=>{if(offline)throw Error('offline organizations');return {selectedOrganization:{organization_id:'a',role:'member'}};}};
 const manager=createGet3wManagedMcp({auth,userData,getServerInfo:async()=>{if(localDown)throw Error('engine unavailable');return {running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',clientToken:'client',pid:1};},createProxy:async()=>({url:'http://127.0.0.1:2345/mcp',token:'local-only',close:async()=>{closed++;}}),fetchImpl:async(url,options)=>{
  if(options.method==='POST')config=JSON.parse(options.body).config;
  if(options.method==='DELETE')config=undefined;
  return Response.json({items:config?[{name:'openwork-account',source:'config.remote',config}]:[]});
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

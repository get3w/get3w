import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGet3wManagedProvider } from "./get3w-managed-provider.mjs";

test("sign-in automatically enables models, survives restart, isolates accounts and cleans up on logout",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));
 let snapshot={status:'signed_in',user:{id:'a'}},provider={openwork:{name:'User key'}},closed=0,created=0;
 const deps={userData,auth:{status:async()=>snapshot,models:async()=>({models:[{id:'test',protocols:['openai'],input_modalities:['text','image']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',pid:1}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local-'+(++created),close:async()=>{closed++;}}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/health'))return new Response(null,{status:200});
  assert.equal(url,'http://127.0.0.1:1234/runtime-config/providers');
  if(options.method==='PATCH')for(const [id,value] of Object.entries(JSON.parse(options.body).provider)){if(value===null)delete provider[id];else provider[id]=value;}
  return Response.json({provider,reload:'reloaded'});
 }};
 try {
  let manager=createGet3wManagedProvider(deps);
  await writeFile(path.join(userData,'get3w-managed-provider.json'),JSON.stringify({enabled:false}));
  assert.equal((await manager.reconcile(snapshot)).state,'connected');
  assert.equal(provider['get3w-account'].name,'Get3W Models');
  assert.equal(created,1);assert.equal(provider.openwork.name,'User key');
  assert.equal(provider['get3w-account'].models.test.attachment,true);
  assert.deepEqual(provider['get3w-account'].models.test.modalities,{input:['text','image'],output:['text']});
  await manager.reconcile(snapshot);assert.equal(created,1);
  await manager.close();manager=createGet3wManagedProvider(deps);
  await manager.reconcile(snapshot);assert.equal(created,2);
  snapshot={status:'signed_in',user:{id:'b'}};
  assert.equal((await manager.reconcile(snapshot)).enabled,true);
  assert.equal(created,3);assert.equal(closed,2);
  await assert.rejects(manager.run({action:'status',userId:'a'}),/Account changed/);
  await assert.rejects(manager.run({action:'disable',userId:'b'}),/automatically/);
  snapshot={status:'unavailable'};
  assert.equal((await manager.reconcile(snapshot)).state,'unavailable');
  assert.equal(closed,3);assert.equal(created,3);
  snapshot={status:'signed_in',user:{id:'b'}};
  assert.equal((await manager.reconcile(snapshot)).state,'connected');
  assert.equal(created,4);
  snapshot={status:'signed_out'};
  assert.equal((await manager.reconcile(snapshot)).enabled,false);
  assert.equal(provider['get3w-account'],undefined);assert.equal(provider.openwork.name,'User key');
  assert.equal(closed,4);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test("remote server and edited provider fail closed",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));let remote=true,calls=0;
 const snapshot={status:'signed_in',user:{id:'a'}};
 const manager=createGet3wManagedProvider({userData,auth:{status:async()=>snapshot},getServerInfo:async()=>({running:true,baseUrl:remote?'https://example.com':'http://127.0.0.1:1234',hostToken:'host'}),fetchImpl:async()=>{calls++;return Response.json({provider:{'get3w-account':{name:'User custom'}}});}});
 try {
  await assert.rejects(manager.run({action:'enable',userId:'a'}),/local Get3W/);assert.equal(calls,0);
  remote=false;await assert.rejects(manager.run({action:'enable',userId:'a'}),/edited locally/);assert.equal(calls,1);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test("deferred reload stays pending",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));let patches=0,provider={};
 const snapshot={status:'signed_in',user:{id:'a'}};
 const manager=createGet3wManagedProvider({userData,auth:{status:async()=>snapshot,models:async()=>({models:[{id:'test',protocols:['openai']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host'}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local',close:async()=>{}}),fetchImpl:async(url,options)=>{
  if(options.method==='PATCH'){patches++;provider={...provider,...JSON.parse(options.body).provider};}
  return Response.json({provider,reload:'deferred'});
 }});
 try {
  assert.equal((await manager.run({action:'enable',userId:'a'})).state,'pending');
  assert.equal((await manager.reconcile(snapshot)).state,'pending');assert.equal(patches,1);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test('owned legacy provider migrates atomically and unowned legacy provider is preserved',async()=>{
 const {createHash}=await import('node:crypto');
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-provider-migration-'));
 const legacy={name:'Get3W Models',npm:'@ai-sdk/openai-compatible',models:{'get3w-auto':{name:'Auto'}}};
 let provider={'openwork-account':legacy},patches=[];
 const snapshot={status:'signed_in',user:{id:'u'}};
 const deps={userData,auth:{models:async()=>({models:[{id:'get3w-auto',protocols:['openai']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host'}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local',close:async()=>{}}),fetchImpl:async(url,opt)=>{
  if(opt.method==='PATCH'){const patch=JSON.parse(opt.body).provider;patches.push(patch);for(const [id,v] of Object.entries(patch)){if(v===null)delete provider[id];else provider[id]=v;}}
  return Response.json({provider,reload:'reloaded'});
 }};
 let m=createGet3wManagedProvider(deps);
 try {
  await writeFile(path.join(userData,'openwork-managed-provider.json'),JSON.stringify({fingerprint:createHash('sha256').update(JSON.stringify(canonical(legacy))).digest('hex')}));
  await m.reconcile(snapshot);
  assert.equal(provider['openwork-account'],undefined);
  assert.equal(provider['get3w-account'].name,'Get3W Models');
  assert.equal(patches.length,1);assert.equal(patches[0]['openwork-account'],null);
  await m.close();provider['openwork-account']={name:'User edited'};m=createGet3wManagedProvider(deps);
  await assert.rejects(m.reconcile(snapshot),/edited locally/);
  assert.equal(provider['openwork-account'].name,'User edited');
 }finally{await m.close();await rm(userData,{recursive:true,force:true});}
});

test('switching to an account without models removes the closed proxy and can recover',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-provider-scope-'));
 let provider={},available=true,closed=0;
 const manager=createGet3wManagedProvider({userData,auth:{models:async()=>({models:available?[{id:'get3w-auto',protocols:['openai']}]:[]})},
 getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host'}),
 createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local',close:async()=>{closed++;}}),
 fetchImpl:async(url,opt)=>{
  if(opt.method==='PATCH')for(const [key,value] of Object.entries(JSON.parse(opt.body).provider)){if(value===null)delete provider[key];else provider[key]=value;}
  return Response.json({provider,reload:'reloaded'});
 }});
 try {
  await manager.reconcile({status:'signed_in',user:{id:'a'}});
  available=false;
  const organization={status:'signed_in',user:{id:'b'}};
  await assert.rejects(manager.reconcile(organization),/No Get3W models/);
  assert.equal(closed,1);assert.equal(provider['get3w-account'],undefined);
  available=true;
  assert.equal((await manager.reconcile(organization)).state,'connected');
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

// Use real loopback HTTP and the real inference proxy: mocked configuration
// writes alone cannot prove a persisted provider can connect after an upgrade.
test('legacy upgrade, process restart and dead proxy recover through a real loopback request',async()=>{
 const {createServer}=await import('node:http');
 const {once}=await import('node:events');
 const {createHash}=await import('node:crypto');
 const {createGet3wInferenceProxy}=await import('./get3w-inference-proxy.mjs');
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-provider-upgrade-'));
 const snapshot={status:'signed_in',user:{id:'upgrade-user'}};
 const old={name:'Get3W Models',npm:'@ai-sdk/openai-compatible',options:{baseURL:'http://127.0.0.1:1/v1',apiKey:'x'.repeat(43)},models:{test:{name:'Test',tool_call:true}}};
 let provider={'get3w-account':old},activeProxy,patches=0,inferences=0;
 const server=createServer(async(req,res)=>{
  if(req.method==='PATCH'){
   let body='';for await(const chunk of req)body+=chunk;
   for(const [key,value] of Object.entries(JSON.parse(body).provider)){if(value===null)delete provider[key];else provider[key]=value;}
   patches++;
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({provider,reload:'reloaded'}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const auth={models:async()=>({models:[{id:'test',protocols:['openai']}]}),inference:async()=>{inferences++;return {response:Response.json({choices:[]}),release:()=>{}};}};
 const deps={userData,auth,getServerInfo:async()=>({running:true,baseUrl:`http://127.0.0.1:${server.address().port}`,hostToken:'host',pid:1}),
 createProxy:async input=>{activeProxy=await createGet3wInferenceProxy(input);return activeProxy;}};
 const ask=async()=>{
  const p=provider['get3w-account'];
  const response=await fetch(`${p.options.baseURL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${p.options.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'test',messages:[]})});
  assert.equal(response.status,200);await response.json();
 };
 let manager=createGet3wManagedProvider(deps);
 try{
  await writeFile(path.join(userData,'get3w-managed-provider.json'),JSON.stringify({enabled:true,account:createHash('sha256').update(JSON.stringify('upgrade-user')).digest('hex')}));
  assert.equal((await manager.reconcile(snapshot)).state,'connected');
  assert.notEqual(provider['get3w-account'].options.baseURL,old.options.baseURL);
  assert.ok(JSON.parse(await readFile(path.join(userData,'get3w-managed-provider.json'),'utf8')).fingerprint);
  await ask();await manager.reconcile(snapshot);assert.equal(patches,1);
  await manager.close();manager=createGet3wManagedProvider(deps);
  await manager.reconcile(snapshot);await ask();assert.equal(patches,2);
  await activeProxy.close();
  await manager.reconcile(snapshot);await ask();assert.equal(patches,3);assert.equal(inferences,3);
  await manager.reconcile({status:'signed_out'});assert.equal(provider['get3w-account'],undefined);
 }finally{await manager.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(userData,{recursive:true,force:true});}
});

test('missing fingerprints never authorize adopting other accounts or custom provider definitions',async()=>{
 const {createHash}=await import('node:crypto');
 const account=id=>createHash('sha256').update(JSON.stringify(id)).digest('hex');
 const original={name:'Get3W Models',npm:'@ai-sdk/openai-compatible',options:{baseURL:'http://127.0.0.1:53216/v1',apiKey:'x'.repeat(43)},models:{test:{name:'Test',tool_call:true}}};
 const cases=[
  {record:{enabled:true,account:account('other')},provider:original},
  {record:{},provider:original},
  {record:{enabled:true,account:account('u')},provider:{...original,options:{...original.options,baseURL:'https://example.com/v1'}}},
  {record:{enabled:true,account:account('u')},provider:{...original,headers:{custom:'user'}}},
  {record:{enabled:true,account:account('u')},provider:{...original,models:{test:{name:'Test',tool_call:true,options:{temperature:1}}}}},
  {record:{enabled:true,account:account('u'),fingerprint:'mismatch'},provider:original},
 ];
 for(const fixture of cases){
  const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-provider-ownership-'));let created=0,patched=0;
  const manager=createGet3wManagedProvider({userData,auth:{},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host'}),
   createProxy:async()=>{created++;throw Error('must not create');},fetchImpl:async(url,options)=>{if(options.method==='PATCH')patched++;return Response.json({provider:{'get3w-account':fixture.provider}});}});
  try{
   await writeFile(path.join(userData,'get3w-managed-provider.json'),JSON.stringify(fixture.record));
   await assert.rejects(manager.reconcile({status:'signed_in',user:{id:'u'}}),/edited locally/);
   await assert.rejects(manager.reconcile({status:'signed_in',user:{id:'u'}}),/edited locally/);
   assert.equal(created,0);assert.equal(patched,0);
  }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
 }
});

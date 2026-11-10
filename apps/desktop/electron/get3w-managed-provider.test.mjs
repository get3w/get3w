import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGet3wManagedProvider } from "./get3w-managed-provider.mjs";

test("sign-in automatically enables models, survives restart, isolates accounts and cleans up on logout",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));
 let snapshot={status:'signed_in',user:{id:'a'}},provider={openwork:{name:'User key'}},closed=0,created=0;
 const deps={userData,auth:{status:async()=>snapshot,models:async()=>({models:[{id:'test',protocols:['openai'],input_modalities:['text','image']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',pid:1}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local-'+(++created),close:async()=>{closed++;}}),fetchImpl:async(url,options)=>{
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

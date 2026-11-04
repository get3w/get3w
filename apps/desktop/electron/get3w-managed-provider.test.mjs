import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGet3wManagedProvider } from "./get3w-managed-provider.mjs";

test("owned provider enables, survives restart, isolates accounts and leaves user providers untouched",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));
 let snapshot={status:'signed_in',user:{id:'a'}},provider={openwork:{name:'User key'}},closed=0,created=0;
 const deps={userData,auth:{status:async()=>snapshot,models:async()=>({models:[{id:'test',protocols:['openai']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host',pid:1}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local-'+(++created),close:async()=>{closed++;}}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/managed-policy/evaluate'))return Response.json({allowed:true});
  assert.equal(url,'http://127.0.0.1:1234/runtime-config/providers');
  if(options.method==='PATCH')for(const [id,value] of Object.entries(JSON.parse(options.body).provider)){if(value===null)delete provider[id];else provider[id]=value;}
  return Response.json({provider,reload:'reloaded'});
 }};
 try {
  let manager=createGet3wManagedProvider(deps);
  assert.equal((await manager.run({action:'enable',userId:'a'})).state,'connected');
  assert.equal(created,1);assert.equal(provider.openwork.name,'User key');
  await manager.reconcile(snapshot);assert.equal(created,1);
  await manager.close();manager=createGet3wManagedProvider(deps);
  await manager.reconcile(snapshot);assert.equal(created,2);
  snapshot={status:'signed_in',user:{id:'b'}};
  assert.equal((await manager.reconcile(snapshot)).enabled,false);
  assert.equal(provider['openwork-account'],undefined);assert.equal(provider.openwork.name,'User key');
  assert.equal(closed,2);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test("remote server and edited provider fail closed",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));let remote=true,calls=0;
 const snapshot={status:'signed_in',user:{id:'a'}};
 const manager=createGet3wManagedProvider({userData,auth:{status:async()=>snapshot},getServerInfo:async()=>({running:true,baseUrl:remote?'https://example.com':'http://127.0.0.1:1234',hostToken:'host'}),fetchImpl:async()=>{calls++;return Response.json({provider:{'openwork-account':{name:'User custom'}}});}});
 try {
  await assert.rejects(manager.run({action:'enable',userId:'a'}),/local Get3W/);assert.equal(calls,0);
  remote=false;await assert.rejects(manager.run({action:'enable',userId:'a'}),/edited locally/);assert.equal(calls,1);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

test("denied policy never writes a provider and deferred reload stays pending",async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'openwork-provider-'));let allowed=false,patches=0,provider={};
 const snapshot={status:'signed_in',user:{id:'a'}};
 const manager=createGet3wManagedProvider({userData,auth:{status:async()=>snapshot,models:async()=>({models:[{id:'test',protocols:['openai']}]})},getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'host'}),createProxy:async()=>({baseURL:'http://127.0.0.1:2345/v1',apiKey:'local',close:async()=>{}}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/managed-policy/evaluate'))return Response.json({}, {status:allowed?200:403});
  if(options.method==='PATCH'){patches++;provider={...provider,...JSON.parse(options.body).provider};}
  return Response.json({provider,reload:'deferred'});
 }});
 try {
  await assert.rejects(manager.run({action:'enable',userId:'a'}),/policy/);assert.equal(patches,0);
  allowed=true;assert.equal((await manager.run({action:'enable',userId:'a'})).state,'pending');
  assert.equal((await manager.reconcile(snapshot)).state,'pending');assert.equal(patches,1);
 }finally{await manager.close();await rm(userData,{recursive:true,force:true});}
});

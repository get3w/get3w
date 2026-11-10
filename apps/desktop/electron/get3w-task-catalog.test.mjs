import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskCatalogCache} from './get3w-task-catalog.mjs';
const value = {catalog_version:'v1',models:[{model_id:'p/m/new-run-type',type:'new-run-type',category:'other',run_type_title:'New',catalog_version:'v1',api_schema:{}}]};
const response = () => new Response(JSON.stringify(value),{headers:{etag:'"v1"'}});
test('revalidates cached version and isolates accounts',async()=>{
 let time=100; const cache=createTaskCatalogCache({now:()=>time});
 const first=await cache.read({userId:'a',load:async etag=>{assert.equal(etag,undefined);return response();}});
 first.models[0].type='changed';
 time+=60001;
 const second=await cache.read({userId:'a',load:async etag=>{assert.equal(etag,'"v1"');return new Response(null,{status:304});}});
 assert.equal(second.models[0].type,'new-run-type');assert.equal(second.expiresAt,120101);
 await cache.read({userId:'b',load:async etag=>{assert.equal(etag,undefined);return response();}});
});
test('denial clears cache and identity change rejects in-flight data',async()=>{
 const cache=createTaskCatalogCache();const args={userId:'a'};
 await cache.read({...args,load:async()=>response()});
 await assert.rejects(cache.read({...args,forceRefresh:true,load:async()=>{throw Object.assign(new Error('denied'),{status:403});}}));
 await assert.rejects(cache.read({...args,load:async etag=>{assert.equal(etag,undefined);return new Response(null,{status:304});}}));
 await assert.rejects(cache.read({...args,load:async()=>{cache.clear();return response();}}),/Account changed/);
});

import {mkdtemp, rm, readdir, readFile, writeFile, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('disk restart, scope isolation, offline expiry and denial deletion', async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'task-catalog-'));
 let time=100;
 const options={directory,now:()=>time,namespace:'service-a'};
 const args={userId:'a'};
 const offline=async()=>{throw new TypeError('fetch failed');};
 try {
  await createTaskCatalogCache(options).read({...args,load:async()=>response()});
  const [name]=await readdir(directory);
  assert.equal((await stat(path.join(directory,name))).mode & 0o777,0o600);
  const saved=await readFile(path.join(directory,name),'utf8');
  assert.ok(!saved.includes('Bearer'));
  const restarted=createTaskCatalogCache(options);
  const result=await restarted.read({...args,allowOffline:true,load:offline});
  assert.equal(result.offline,true);assert.equal(result.executionAllowed,false);
  await assert.rejects(restarted.read({...args,userId:'b',allowOffline:true,load:offline}));
  await assert.rejects(createTaskCatalogCache({...options,namespace:'service-b'}).read({...args,allowOffline:true,load:offline}));
  time+=86_400_001;
  await assert.rejects(createTaskCatalogCache(options).read({...args,allowOffline:true,load:offline}));
  time=100;
  await assert.rejects(restarted.read({...args,forceRefresh:true,load:async()=>{throw Object.assign(new Error('forbidden'),{status:403});}}));
  assert.deepEqual(await readdir(directory),[]);
  await assert.rejects(createTaskCatalogCache(options).read({...args,allowOffline:true,load:offline}));
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('corrupt disk and HTTP failures never become offline success', async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'task-catalog-'));
 const args={userId:'a'};
 try {
  await createTaskCatalogCache({directory}).read({...args,load:async()=>response()});
  const [name]=await readdir(directory);
  await writeFile(path.join(directory,name),'invalid json');
  await assert.rejects(createTaskCatalogCache({directory}).read({...args,load:async()=>new Response(null,{status:304})}));
  const cache=createTaskCatalogCache({directory});
  await cache.read({...args,load:async()=>response()});
  await assert.rejects(cache.read({...args,allowOffline:true,load:async()=>new Response(null,{status:403})}));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('fresh memory catalog avoids repeated network requests',async()=>{
 let calls=0;const cache=createTaskCatalogCache({now:()=>100});
 const args={userId:'a',load:async()=>{calls++;return response();}};
 await cache.read(args);await cache.read(args);assert.equal(calls,1);
 await cache.read({...args,forceRefresh:true});assert.equal(calls,2);
});

import { beforeAll, afterAll, expect, test } from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {cachedTaskCatalog,loadTaskCatalog,resetTaskCatalog} from '../src/react-app/domains/cloud/task-catalog-store';
import type {TaskCatalogSnapshot} from '../src/react-app/domains/cloud/get3w-account';
beforeAll(()=>GlobalRegistrator.register({url:'http://localhost'}));
afterAll(()=>GlobalRegistrator.unregister());
const value=():TaskCatalogSnapshot=>({catalog_version:'v1',models:[],offline:false,expiresAt:Date.now()+60000});
test('preload is shared and synchronous snapshot survives background refresh',async()=>{
 resetTaskCatalog();let calls=0;let finish:(value:TaskCatalogSnapshot)=>void=()=>{};
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:()=>{calls++;return new Promise<TaskCatalogSnapshot>(resolve=>{finish=resolve;});}});
 const first=loadTaskCatalog('a');expect(loadTaskCatalog('a')).toBe(first);finish(value());await first;
 expect(calls).toBe(1);expect(cachedTaskCatalog('a')?.catalog_version).toBe('v1');
 await loadTaskCatalog('a');expect(calls).toBe(1);
 const refresh=loadTaskCatalog('a',true);expect(cachedTaskCatalog('a')).not.toBeNull();finish({...value(),catalog_version:'v2'});await refresh;
 expect(cachedTaskCatalog('a')?.catalog_version).toBe('v2');
});
test('account change discards pending replies and clears account snapshot',async()=>{
 resetTaskCatalog();let finish:(value:TaskCatalogSnapshot)=>void=()=>{};
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:()=>new Promise<TaskCatalogSnapshot>(resolve=>{finish=resolve;})});
 const pending=loadTaskCatalog('alice');resetTaskCatalog('bob');finish(value());
 await expect(pending).rejects.toThrow('Account changed');expect(cachedTaskCatalog('alice')).toBeNull();expect(cachedTaskCatalog('bob')).toBeNull();
 resetTaskCatalog();
});

test('expired catalog refresh keeps visible data and falls back to offline cache',async()=>{
 resetTaskCatalog();let calls=0;let fail=false;
 const requests:unknown[]=[];
 Reflect.set(window,'__GET3W_ACCOUNT__',{taskCatalog:async(input:unknown)=>{
  calls++;requests.push(input);
  if(fail&&!(typeof input==='object'&&input!==null&&Reflect.get(input,'offline')))throw Error('network unavailable');
  return {...value(),catalog_version:fail?'cached':'expired',expiresAt:Date.now()-1,offline:fail};
 }});
 await loadTaskCatalog('offline-account');expect(calls).toBe(1);
 fail=true;const refresh=loadTaskCatalog('offline-account');
 expect(cachedTaskCatalog('offline-account')?.catalog_version).toBe('expired');
 const offline=await refresh;expect(offline.offline).toBe(true);expect(calls).toBe(3);
 expect(requests[2]).toEqual({userId:'offline-account',offline:true});
 expect(cachedTaskCatalog('offline-account')?.catalog_version).toBe('cached');
 resetTaskCatalog();
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {eventSourceRoute,createEventSourceSync} from './get3w-event-sources.mjs';
test('source route is bounded, rejects secrets, URLs and callbacks',()=>{
 assert.equal(eventSourceRoute({userId:'u',path:'/github',method:'GET'}),'event-sources/github');
 for(const path of ['https://evil.test','/github/webhook','/github/callback','/subscriptions?user=b'])assert.throws(()=>eventSourceRoute({userId:'u',path,method:'POST'}));
});
test('sync persists before ack, duplicates replay safely and local workspaces never ingest',async()=>{
 const calls=[];let saved=false;let fail=true;const sid='00000000-0000-0000-0000-000000000001';
 const auth={status:async()=>({status:'signed_in',user:{id:'u'}}),eventSources:async({path,body})=>{
  calls.push(path);if(path==='/subscriptions')return {ok:true,json:{items:[{id:sid,workspace_id:'ws',source_id:'s',enabled:true,state:'receiving'}]}};
  if(path.endsWith('/poll'))return {ok:true,json:{items:[{id:'delivery',key:'key',event:{repository:'a/b',title:'Title',body:'text',url:'https://github.com/a/b/issues/1'}}]}};
  assert(saved);return {ok:true,json:{}};
 }};
 let ordinary=false;
 const fetchImpl=async(url,options)=>{
  calls.push(url);let value;
  if(url.endsWith('/workspaces'))value={items:[{id:'ws',workspaceType:ordinary?'local':'always-on'}]};
  else if(url.endsWith('/inbox'))value={sources:[{id:'s',kind:'github',subscriptionId:sid,ownerUserId:'u',enabled:true}]};
  else if(url.endsWith('/sync'))value={ok:true};
  else {if(fail)return {ok:false};saved=true;value={duplicate:false};}
  return {ok:true,json:async()=>value};
 };
 const runner=createEventSourceSync({auth,getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',clientToken:'test',hostToken:'host'}),fetchImpl,intervalMs:100000});
 runner.start();await new Promise(r=>setTimeout(r,30));runner.stop();assert(!calls.some(x=>x.endsWith('/ack')));
 fail=false;runner.start();await new Promise(r=>setTimeout(r,30));runner.stop();assert(calls.some(x=>x.endsWith('/ack')));
 calls.length=0;ordinary=true;runner.start();await new Promise(r=>setTimeout(r,30));runner.stop();assert.equal(calls.length,1);
});
test('broken subscription does not starve later sources; changed account never receives',async()=>{
 let switched=false,saves=0;const sid='00000000-0000-0000-0000-000000000001';
 const auth={status:async()=>({status:'signed_in',user:{id:switched?'other':'u'}}),eventSources:async({path})=>{
  if(path==='/subscriptions')return {ok:true,json:{items:[{id:'broken',workspace_id:'ws',source_id:'bad',enabled:true,state:'receiving'},{id:sid,workspace_id:'ws',source_id:'good',enabled:true,state:'receiving'}]}};
  if(path.includes('broken'))return {ok:false};
  if(path.endsWith('/poll')){if(switchOnPoll)switched=true;return {ok:true,json:{items:[{id:'d',key:'k',event:{title:'Title'}}]}};}
  return {ok:true,json:{}};
 }};
 let switchOnPoll=false;
 const fetchImpl=async url=>({ok:true,json:async()=>url.endsWith('/workspaces')?{items:[{id:'ws',workspaceType:'always-on'}]}:url.endsWith('/inbox')?{sources:[{id:'bad',kind:'github',subscriptionId:'broken',ownerUserId:'u',enabled:true},{id:'good',kind:'github',subscriptionId:sid,ownerUserId:'u',enabled:true}]}:url.endsWith('/sync')?{}:(saves++,{})});
 const runner=createEventSourceSync({auth,getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',clientToken:'test',hostToken:'host'}),fetchImpl});
 runner.start();await new Promise(r=>setTimeout(r,25));runner.stop();assert.equal(saves,1);
 saves=0;switchOnPoll=true;runner.start();await new Promise(r=>setTimeout(r,25));runner.stop();assert.equal(saves,0);
});
test('channel operations are native only and callback cannot be proxied',()=>{
 const sid='00000000-0000-0000-0000-000000000001';
 for(const [method,path] of [['GET','/catalog'],['GET','/channels'],['POST','/channels'],['POST',`/channels/${sid}/authorize`],['PATCH',`/channels/${sid}`]])assert.equal(eventSourceRoute({userId:'u',path,method}),'event-sources'+path);
 for(const path of [`/channels/${sid}/webhook`,'/oauth/callback'])assert.throws(()=>eventSourceRoute({userId:'u',path,method:'POST'}));
});
test('connector queue is ingested with exact local owner binding before acknowledgement',async()=>{
 let saved=false,acked=false;const sid='00000000-0000-0000-0000-000000000002';
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),eventSources:async({path})=>{
  if(path==='/subscriptions')return {ok:false};
  if(path==='/channels')return {ok:true,json:{items:[{id:sid,workspace_id:'ws',source_id:'s',enabled:true,state:'ready'}]}};
  if(path.endsWith('/poll'))return {ok:true,json:{items:[{id:'d',key:'k',event:{repository:'gmail',type:'gmail',title:'Mail'}}]}};
  if(path.endsWith('/ack')){assert(saved);acked=true;}return {ok:true,json:{}};
 }};
 const runner=createEventSourceSync({auth,getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',clientToken:'t',hostToken:'h'}),fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('/workspaces')?{items:[{id:'ws',workspaceType:'always-on'}]}:url.endsWith('/inbox')?{sources:[{id:'s',kind:'connector',subscriptionId:sid,ownerUserId:'alice',enabled:true}]}:url.endsWith('/events')?(saved=true,{}):{}})});
 runner.start();await new Promise(r=>setTimeout(r,30));runner.stop();assert(acked);
});

test('task keys group GitHub issue comments by parent resource without guessing from titles',async()=>{
 const {eventSourceTaskKey}=await import('./get3w-event-sources.mjs');
 assert.equal(eventSourceTaskKey({url:'https://github.com/a/b/issues/42#issuecomment-123'}),'https://github.com/a/b/issues/42');
 assert.equal(eventSourceTaskKey({url:'https://github.com/a/b/pull/12/files'}),'https://github.com/a/b/pull/12');
 assert.notEqual(eventSourceTaskKey({url:'https://github.com/a/b/issues/42'}),eventSourceTaskKey({url:'https://github.com/a/b/issues/43'}));
 assert.equal(eventSourceTaskKey({title:'same title'}),undefined);
 assert.equal(eventSourceTaskKey({url:'javascript:alert(1)'}),undefined);
 assert.equal(eventSourceTaskKey({url:'https://user:secret@domain.test/path'}),undefined);
 assert.equal(eventSourceTaskKey({url:'https://other.test/message?id=12'}),'https://other.test/message?id=12');
});

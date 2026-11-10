import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelTaskPoller} from './get3w-model-task-poller.mjs';
test('polling honors retry_after, backoff, detach and concurrency',async()=>{
 let now=0,calls=[],saved=[],fail=false;
 const rows=[{key:'a',requestId:'r1',status:'processing'},{key:'b',requestId:'r2',status:'detached'},{key:'c',requestId:null,status:'quoted'}];
 const poller=createModelTaskPoller({list:async()=>rows,read:async row=>{calls.push(row.key);if(fail)throw Error('offline');return {status:'processing',retry_after:7};},save:async(row,result)=>saved.push(result),concurrency:1,now:()=>now});
 await poller.tick();await poller.tick();assert.deepEqual(calls,['a']);assert.equal(saved.length,1);
 now=7000;fail=true;await poller.tick();assert.equal(calls.length,2);
 now=10000;await poller.tick();assert.equal(calls.length,2);
 now=13000;fail=false;await poller.tick();assert.equal(calls.length,3);
 poller.stop();now=100000;await poller.tick();assert.equal(calls.length,3);
});

test('closing while discovery is pending never starts another provider request',async()=>{
 let release,calls=0;
 const pending=new Promise(resolve=>{release=resolve;});
 const poller=createModelTaskPoller({list:()=>pending,read:async()=>{calls++;return {};},save:async()=>{}});
 const tick=poller.tick();poller.stop();
 release([{key:'a',requestId:'r',status:'processing'}]);
 await tick;assert.equal(calls,0);
});

test('overlapping ticks respect the shared concurrency limit and close discards in-flight results',async()=>{
 const rows=Array.from({length:1000},(_,i)=>({key:String(i),requestId:`r${i}`,status:'processing'}));
 let reads=0,saves=0,errors=0;
 const releases=[];
 const poller=createModelTaskPoller({list:async()=>rows,concurrency:3,
  read:row=>{reads++;return new Promise(resolve=>releases.push(()=>resolve({status:'completed'})));},
  save:async()=>{saves++;},onError:()=>{errors++;}});
 const first=poller.tick();await new Promise(resolve=>setImmediate(resolve));
 await Promise.all(Array.from({length:20},()=>poller.tick()));
 assert.equal(reads,3);
 poller.stop();for(const release of releases)release();await first;
 assert.equal(saves,0);assert.equal(errors,0);
});

test('a terminal observation clears prior backoff before a manual result refresh',async()=>{
 let now=0,calls=0;
 const row={key:'a',requestId:'r',status:'processing'};
 const poller=createModelTaskPoller({list:async()=>[row],now:()=>now,
  read:async()=>{calls++;throw Error('offline');},save:async()=>{}});
 await poller.tick();assert.equal(calls,1);
 row.status='completed';await poller.tick();
 row.status='processing';await poller.tick();assert.equal(calls,2);
 poller.stop();
});

test('slow tasks do not starve later eligible records',async()=>{
 let now=0;
 const calls=[];
 const rows=['a','b','c','d'].map(key=>({key,requestId:key,status:'processing'}));
 const poller=createModelTaskPoller({list:async()=>rows,concurrency:1,now:()=>now,
  read:async row=>{calls.push(row.key);return {status:'processing',retry_after:1};},save:async()=>{}});
 try{
  for(let i=0;i<12;i++){await poller.tick();now+=10000;}
  assert.deepEqual(calls,['a','b','c','d','a','b','c','d','a','b','c','d']);
 }finally{poller.stop();}
});

test('slow history scans are coalesced and a rejected scan can recover',async()=>{
 let release,scans=0;
 const pending=new Promise(resolve=>{release=resolve;});
 const poller=createModelTaskPoller({list:async()=>{scans++;if(scans===1)await pending;if(scans===2)throw Error('disk unavailable');return [];},read:async()=>{},save:async()=>{}});
 try{
  const first=poller.tick();
  await Promise.all(Array.from({length:100},()=>poller.tick()));
  assert.equal(scans,1);release();await first;
  await assert.rejects(poller.tick(),/disk unavailable/);
  await poller.tick();assert.equal(scans,3);
 }finally{release();poller.stop();}
});

test('extended outage backoff caps at five minutes and resets after recovery',async()=>{
 let now=0,calls=0,offline=true;
 const row={key:'a',requestId:'r',status:'processing'};
 const poller=createModelTaskPoller({list:async()=>[row],now:()=>now,
  read:async()=>{calls++;if(offline)throw Error('offline');return {status:'processing',retry_after:7};},save:async()=>{}});
 try{
  for(let i=0;i<100;i++){
   await poller.tick();assert.equal(calls,i+1);
   const delay=Math.min(300,3*2**Math.min(i+1,7))*1000;
   now+=delay-1;await poller.tick();assert.equal(calls,i+1);now++;
  }
  offline=false;await poller.tick();assert.equal(calls,101);
  now+=6999;await poller.tick();assert.equal(calls,101);
  now++;offline=true;await poller.tick();assert.equal(calls,102);
  now+=5999;await poller.tick();assert.equal(calls,102);
  now++;await poller.tick();assert.equal(calls,103);
 }finally{poller.stop();}
});

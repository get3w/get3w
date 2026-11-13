import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelTaskRecovery} from './get3w-model-task-recovery.mjs';
test('restart recovery preserves exact approved key and original arguments',async()=>{
 const rows=[{key:'k',requestId:null,status:'submitting',scope:{sessionId:'original-chat-session'},arguments:{idempotency_key:'original-key',slug:'p/m/run',quote_id:'original-quote',inputs:{prompt:'test'},session_id:'original-chat-session'}}];
 const calls=[],saved=[];
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},journal:{listConnection:async()=>rows,observe:async(...args)=>{saved.push(args);rows[0].status='completed';}},auth:{
  submitPersonal:async input=>{calls.push(input);return {request_id:'existing-task',status:'processing',retry_after:10};},
  mcp:async()=>{throw Error('submit recovery must not use the gateway MCP');},
 }});
 try {
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.equal(calls.length,1);
  assert.equal(calls[0].userId,'u');assert.deepEqual(calls[0].arguments,rows[0].arguments);
  assert.equal(saved[0][2].result.structuredContent.result.request_id,'existing-task');
 }finally{recovery.close();}
});
test('result recovery supplies the required stable outer execution key',async()=>{
 const row={key:'k',requestId:'request-1',status:'processing',scope:{sessionId:'original-chat-session'}};
 const calls=[];
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},journal:{listConnection:async()=>[row],observe:async()=>{row.status='completed';}},auth:{mcp:async input=>{
  const message=JSON.parse(input.body);calls.push(message);
  return {response:Response.json({result:{structuredContent:message.params.name==='search_capabilities'?{data:[{name:'result-alias',handler:'get3w.result',enabled:true}]}:{status:'succeeded',result:{id:'request-1',status:'completed',outputs:[]}}}})};
 }}});
 try{await new Promise(resolve=>setTimeout(resolve,1200));assert.deepEqual(calls[1].params.arguments,{name:'result-alias',arguments:{request_id:'request-1'},idempotency_key:'result-request-1'});}finally{recovery.close();}
});

test('closing during submission recovery aborts it without persisting a late result',async()=>{
 let releaseSubmit,started;
 const submitStarted=new Promise(resolve=>{started=resolve;});
 const submit=new Promise(resolve=>{releaseSubmit=resolve;});
 let signal,calls=0,saved=0;
 const row={key:'k',status:'submitting',scope:{sessionId:'original-session'},arguments:{idempotency_key:'approved-key'}};
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},
  journal:{listConnection:async()=>[row],observe:async()=>{saved++;}},
  auth:{submitPersonal:async input=>{calls++;signal=input.signal;started();await submit;input.signal.throwIfAborted();return {request_id:'r',status:'completed'};}}});
 try{
  await Promise.race([submitStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('submission did not start')),3000))]);
  recovery.close();assert.equal(signal.aborted,true);
  releaseSubmit();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(saved,0);
 }finally{recovery.close();releaseSubmit();}
});
test('closing during result decoding releases transport without persisting a late result',async()=>{
 let finish,started;
 const decoding=new Promise(resolve=>{started=resolve;});
 const body=new Promise(resolve=>{finish=resolve;});
 let saved=0,released=0,resultSignal;
 const row={key:'k',status:'processing',requestId:'request',scope:{sessionId:'session'}};
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},
  journal:{listConnection:async()=>[row],observe:async()=>{saved++;}},auth:{mcp:async input=>{
   const request=JSON.parse(input.body);
   if(request.params.name==='search_capabilities')return {response:Response.json({result:{structuredContent:{data:[{name:'result-alias',handler:'get3w.result'}]}}})};
   resultSignal=input.signal;
   return {response:{ok:true,json:async()=>{started();return body;}},release:()=>{released++;}};
  }}});
 try{
  await Promise.race([decoding,new Promise((_,reject)=>setTimeout(()=>reject(Error('decode did not start')),3000))]);
  recovery.close();assert.equal(resultSignal.aborted,true);
  finish({result:{structuredContent:{status:'succeeded',result:{status:'completed'}}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved,0);assert.equal(released,1);
 }finally{recovery.close();finish({});}
});

test('stopping one task cancels its discovery without cancelling another task recovery',async()=>{
 let started,release;
 const bothStarted=new Promise(resolve=>{started=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 const signals=new Map(),executed=[],saved=[];
 const rows=['stopped','continuing'].map(key=>({key,status:'processing',requestId:`request-${key}`,scope:{sessionId:key}}));
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},
  journal:{listConnection:async()=>rows,observe:async(scope)=>{saved.push(scope.sessionId);rows.find(row=>row.key===scope.sessionId).status='completed';}},
  auth:{mcp:async input=>{
   const message=JSON.parse(input.body);
   if(message.params.name==='search_capabilities'){
    signals.set(input.sessionId,input.signal);if(signals.size===2)started();await gate;
    return {response:Response.json({result:{structuredContent:{data:[{name:'result-alias',handler:'get3w.result'}]}}})};
   }
   executed.push(input.sessionId);
   return {response:Response.json({result:{structuredContent:{status:'succeeded',result:{id:'r',status:'completed',outputs:[]}}}})};
  }}});
 let timeout;
 try{
  await Promise.race([bothStarted,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('discovery did not start')),3000);})]);
  rows[0].status='detached';recovery.cancel('stopped');
  assert.equal(signals.get('stopped').aborted,true);
  assert.equal(signals.get('continuing').aborted,false);
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(executed,['continuing']);assert.deepEqual(saved,['continuing']);
  assert.equal(rows[0].status,'detached');
 }finally{clearTimeout(timeout);recovery.close();release();}
});

test('definitively rejected submission becomes terminal rather than retrying forever',async()=>{
 const row={key:'rejected',status:'submitting',scope:{sessionId:'session'},arguments:{idempotency_key:'collision'}};
 let calls=0,saved;
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},journal:{listConnection:async()=>[row],observe:async(_scope,_context,payload)=>{saved=payload.result.structuredContent.result;row.status=saved.status;}},auth:{submitPersonal:async()=>{calls++;throw Object.assign(Error('Use a new key'),{definitive:true,code:'idempotency_conflict'});}}});
 try {await new Promise(resolve=>setTimeout(resolve,2200));assert.equal(calls,1);assert.equal(saved.status,'failed');assert.equal(saved.error.code,'idempotency_conflict');}finally{recovery.close();}
});

test('recovery leaves a live first submission with its current owner',async()=>{
 let owned=true,calls=0;
 const row={key:'k',requestId:null,status:'submitting',scope:{sessionId:'original-session'},arguments:{idempotency_key:'original-key'}};
 const recovery=createModelTaskRecovery({scope:{userId:'u',workspaceId:'w'},journal:{listConnection:async()=>[row],isSubmitting:()=>owned,observe:async()=>{row.status='completed';}},auth:{submitPersonal:async()=>{calls++;return {request_id:'r',status:'completed'};}}});
 try{await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(calls,0);owned=false;await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(calls,1);}finally{recovery.close();}
});

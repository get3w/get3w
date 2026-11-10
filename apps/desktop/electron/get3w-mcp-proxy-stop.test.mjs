import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';
for(const late of [false,true])test(`detached Agent result is blocked ${late?'after in-flight completion':'before provider read'}`,async()=>{
 let detached=!late,reads=0,started,finish;
 const entered=new Promise(resolve=>{started=resolve;});
 const pending=new Promise(resolve=>{finish=resolve;});
 const proxy=await createGet3wMcpProxy({userId:'u',sessionId:'session',enforceModelGuard:true,
  journal:{isStopped:async context=>context.type==='get3w.result'&&detached,observe:async()=>{}},
  auth:{mcp:async({body})=>{
   const msg=JSON.parse(body);
   if(msg.params.name==='search_capabilities')return {response:Response.json({result:{structuredContent:{data:[{name:'read',handler:'get3w.result'}]}}})};
   reads++;started();if(late)await pending;
   return {response:Response.json({result:{structuredContent:{status:'succeeded',result:{status:'completed',outputs:[{text:'must not reach Agent'}]}}}})};
  }}});
 const call=async(name,args)=>(await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:args}})})).json();
 try{
  await call('search_capabilities',{query:'result'});
  const result=call('execute_capability',{name:'read',arguments:{request_id:'r'},idempotency_key:'read-r'});
  if(late){await entered;detached=true;finish();}
  const response=await result;assert.equal(response.result.isError,true);assert.equal(response.result.structuredContent.status,'detached');assert.match(response.result.content[0].text,/stopped waiting/);assert.equal(response.error,undefined);assert.equal(reads,late?1:0);
 }finally{finish();await proxy.close();}
});

test('detaching while a dependent submit awaits approval prevents dispatch',async()=>{
 let detached=false,requested,decide,submits=0;
 const waiting=new Promise(resolve=>{requested=resolve;});
 const decision=new Promise(resolve=>{decide=resolve;});
 const proxy=await createGet3wMcpProxy({userId:'u',sessionId:'session',enforceModelGuard:true,
  approveSubmit:()=>{requested();return decision;},journal:{isStopped:async context=>context.type==='get3w.submit'&&detached,observe:async()=>{}},
  auth:{mcp:async({body})=>{
   const msg=JSON.parse(body);
   let structuredContent;
   if(msg.params.name==='search_capabilities')structuredContent={data:[{name:'quote',handler:'get3w.quote'},{name:'submit',handler:'get3w.submit'}]};
   else if(msg.params.arguments.name==='quote')structuredContent={status:'succeeded',result:{quote_id:'q',slug:'model',currency:'USD',discounted_price:'0',expires_at:Math.floor(Date.now()/1000)+60}};
   else{submits++;structuredContent={status:'succeeded'};}
   return {response:Response.json({result:{structuredContent}})};
  }}});
 const call=async(name,args)=>(await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json();
 try{
  await call('search_capabilities',{query:'model'});
  await call('execute_capability',{name:'quote',arguments:{slug:'model',inputs:{text:'dependency'}}});
  const pending=call('execute_capability',{name:'submit',idempotency_key:'d',arguments:{slug:'model',inputs:{text:'dependency'},quote_id:'q',session_id:'session',idempotency_key:'d'}});
  await waiting;detached=true;decide(true);
  assert.equal((await pending).result.structuredContent.status,'detached');assert.equal(submits,0);
 }finally{decide(false);await proxy.close();}
});

test('invalid submission keys reach the Agent as corrective tool errors without dispatch',async()=>{
 let submits=0;
 const proxy=await createGet3wMcpProxy({userId:'u',sessionId:'session',enforceModelGuard:true,
  auth:{mcp:async({body})=>{
   const msg=JSON.parse(body);let structuredContent;
   if(msg.params.name==='search_capabilities')structuredContent={data:[{name:'quote',handler:'get3w.quote'},{name:'submit',handler:'get3w.submit'}]};
   else if(msg.params.arguments.name==='quote')structuredContent={status:'succeeded',result:{quote_id:'q',slug:'model',currency:'USD',discounted_price:'0.02',expires_at:Math.floor(Date.now()/1000)+60}};
   else{submits++;structuredContent={status:'succeeded'};}
   return {response:Response.json({result:{structuredContent}})};
  }}});
 const call=async(name,args)=>{
  const response=await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  assert.equal(response.status,200);return response.json();
 };
 try{
  await call('search_capabilities',{query:'model'});
  await call('execute_capability',{name:'quote',arguments:{slug:'model',inputs:{text:'cat'}}});
  const response=await call('execute_capability',{name:'submit',idempotency_key:'outer',arguments:{slug:'model',inputs:{text:'cat'},quote_id:'q',session_id:'session',idempotency_key:'inner'}});
  assert.equal(response.result.isError,true);assert.equal(response.result.structuredContent.status,'rejected');
  assert.match(response.result.content[0].text,/same inner and outer submission key/);assert.equal(submits,0);
 }finally{await proxy.close();}
});

test('definitive personal refusal retains RPC identity and records terminal failure',async()=>{
 const observations=[];
 const proxy=await createGet3wMcpProxy({userId:'u',sessionId:'session',enforceModelGuard:true,
  approveSubmit:async()=>true,journal:{beforeSubmit:async()=>{},observe:async(...args)=>observations.push(args)},
  auth:{submitPersonal:async()=>{throw Object.assign(Error('Use a unique submission key'),{definitive:true,code:'idempotency_conflict'});},mcp:async({body})=>{
   const msg=JSON.parse(body);
   const structuredContent=msg.params.name==='search_capabilities'
    ? {data:[{name:'quote',handler:'get3w.quote'},{name:'submit',handler:'get3w.submit'}]}
    : {status:'succeeded',result:{quote_id:'q',slug:'model',currency:'USD',discounted_price:'0.02',expires_at:Math.floor(Date.now()/1000)+60}};
   return {response:Response.json({result:{structuredContent}})};
  }}});
 const call=async(name,args)=>{
  const response=await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'original-call',method:'tools/call',params:{name,arguments:args}})});
  assert.equal(response.status,200);return response.json();
 };
 try{
  await call('search_capabilities',{query:'models'});
  await call('execute_capability',{name:'quote',arguments:{slug:'model',inputs:{text:'cat'}}});
  const result=await call('execute_capability',{name:'submit',idempotency_key:'same',arguments:{slug:'model',inputs:{text:'cat'},quote_id:'q',session_id:'session',idempotency_key:'same'}});
  assert.equal(result.id,'original-call');assert.match(result.error.message,/unique submission key/);
  assert.equal(observations.at(-1)[1].result.structuredContent.result.status,'failed');
 }finally{await proxy.close();}
});

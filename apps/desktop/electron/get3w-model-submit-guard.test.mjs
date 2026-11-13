import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelSubmitGuard} from './get3w-model-submit-guard.mjs';
test('trusted quote binds alias, inputs, expiry and retry key',()=>{
 let now=1000;
 const guard=createModelSubmitGuard({sessionId:'chat',now:()=>now});
 const message=(name,args)=>({method:'tools/call',params:{name:'execute_capability',arguments:{name,arguments:args,idempotency_key:'k'}}});
 assert.throws(()=>guard.prepare(message('paid',{})),/Discover/);
 guard.observe({type:'search'},{result:{structuredContent:{data:[{name:'paid',handler:'get3w.submit'},{name:'quote',handler:'get3w.quote'}]}}});
 const inputs={prompt:'x'};
 guard.observe(guard.prepare(message('quote',{slug:'p/m/run',inputs})),{result:{structuredContent:{status:'succeeded',result:{quote_id:'q',slug:'p/m/run',currency:'USD',discounted_price:'0.2',expires_at:2}}}});
 const args={slug:'p/m/run',inputs,quote_id:'q',session_id:'chat',idempotency_key:'k',amount:'0'};
 const call=guard.prepare(message('paid',args));assert.equal(call.quote.amountUsd,'0.2');guard.approve(call);
 now=3000; // An identical retry remains safe after the quote expires.
 assert.equal(guard.prepare(message('paid',args)).alreadyApproved,true);
 assert.throws(()=>guard.prepare(message('paid',{...args,inputs:{prompt:'changed'}})),/idempotency_conflict/);
 assert.throws(()=>guard.prepare(message('paid',{...args,session_id:'other'})),/session_mismatch/);
 assert.throws(()=>guard.prepare([message('paid',args)]),/Batched/);
});

test('artifact authoring is allowed while unknown tools and undiscovered paid aliases remain denied',()=>{
 const guard=createModelSubmitGuard({sessionId:'chat'});
 for(const name of ['prepare_app','create_app','update_app','read_app','save_artifact_view','save_react_artifact_view','read_artifact_view'])
  assert.equal(guard.prepare({method:'tools/call',params:{name,arguments:{}}}),null);
 assert.throws(()=>guard.prepare({method:'tools/call',params:{name:'submit',arguments:{}}}),/Unsupported/);
 assert.throws(()=>guard.prepare({method:'tools/call',params:{name:'execute_capability',arguments:{name:'paid'}}}),/tool-name\/discovery error, not an account permission/);
});

test('only trusted host submissions can omit session identity and quote/key checks remain enforced',()=>{
 const guard=createModelSubmitGuard({sessionId:'trusted-chat',now:()=>1000});
 guard.observe({type:'search'},{result:{structuredContent:{data:[{name:'paid',handler:'get3w.submit'},{name:'quote',handler:'get3w.quote'}]}}});
 const message=(name,args,key='stable')=>({method:'tools/call',params:{name:'execute_capability',arguments:{name,arguments:args,idempotency_key:key}}});
 const inputs={prompt:'cup'};
 guard.observe(guard.prepare(message('quote',{slug:'model',inputs})),{result:{structuredContent:{status:'succeeded',result:{quote_id:'q',slug:'model',currency:'USD',discounted_price:'0.1',expires_at:2}}}});
 const args={slug:'model',inputs,quote_id:'q',idempotency_key:'stable'};
 assert.throws(()=>guard.prepare(message('paid',{...args})),/session_mismatch/);
 const context=guard.prepare(message('paid',{...args}),{trustedSession:true});
 assert.equal(context.call.arguments.session_id,'trusted-chat');
 guard.approve(context);
 assert.equal(guard.prepare(message('paid',{...args}),{trustedSession:true}).alreadyApproved,true);
 assert.throws(()=>guard.prepare(message('paid',{...args},'different'),{trustedSession:true}),/session_mismatch/);
 assert.throws(()=>guard.prepare(message('paid',{...args,inputs:{prompt:'different'}}),{trustedSession:true}),/idempotency_conflict/);
 assert.throws(()=>guard.prepare(message('paid',{...args,quote_id:'missing',idempotency_key:'new'},'new'),{trustedSession:true}),/quote_required/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createModelTaskJournal} from './get3w-model-task-journal.mjs';
test('uncertain submissions survive restart with the same payload and remain account scoped',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-journal-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 const context={type:'get3w.submit',hash:'exact-input',quote:{amountUsd:'0.1'},call:{arguments:{idempotency_key:'same',inputs:{prompt:'test'}}}};
 try {
  let journal=createModelTaskJournal({userData});const key=await journal.beforeSubmit(scope,context);
  assert.equal(journal.isSubmitting(key),true);
  journal.releaseSubmit(scope,context);assert.equal(journal.isSubmitting(key),false);
  journal=createModelTaskJournal({userData});
  assert.equal(journal.isSubmitting(key),false,'process restart releases local ownership for recovery');
  assert.equal((await journal.list(scope))[0].status,'submitting');
  assert.equal(await journal.beforeSubmit(scope,context),key);assert.equal((await journal.list(scope)).length,1);
  await assert.rejects(journal.beforeSubmit(scope,{...context,hash:'different'}),/conflict/);
  assert.deepEqual(await journal.list({...scope,userId:'other'}),[]);
  await journal.observe(scope,context,{result:{structuredContent:{status:'succeeded',result:{request_id:'r',status:'processing',retry_after:7}}}});
  assert.equal((await journal.list(scope))[0].requestId,'r');
  await journal.detach(scope,key);assert.equal((await journal.list(scope))[0].status,'detached');
  await journal.observe(scope,{type:'get3w.result',call:{arguments:{request_id:'r'}}},{result:{structuredContent:{status:'succeeded',result:{id:'r',status:'completed',outputs:[{text:'hello'}]}}}});
  assert.equal((await journal.list(scope))[0].result.outputs[0].text,'hello');
  const restored=createModelTaskJournal({userData});
  const entry=(await restored.listConnection(scope))[0].outputEntry;
  assert.equal(entry.status,'completed');
  assert.equal(entry.sessionId,'s');
  assert.equal(entry.requestId,'r');
  assert.equal(entry.charged,null,'a quoted price is not an actual charge');
  assert.deepEqual(entry.outputs,[{text:'hello'}]);
  assert.equal(entry.structured.status,'completed');
  assert.deepEqual(await restored.listConnection({...scope,userId:'other'}),[]);
  assert.deepEqual(await restored.listConnection({...scope,workspaceId:'other'}),[]);
 }finally{await rm(userData,{recursive:true,force:true});}
});
test('version one completed results migrate without inventing charges',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-journal-migrate-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 try {
  await writeFile(path.join(userData,'get3w-model-tasks.json'),JSON.stringify({version:1,records:[{
   key:'legacy',scope,messageId:'m',arguments:{slug:'image-model'},quote:{amountUsd:'0.1'},status:'completed',requestId:'r',createdAt:1,updatedAt:2,
   result:{status:'completed',outputs:['https://xianchou.com/result.png']},
  }]}));
  const [row]=await createModelTaskJournal({userData}).listConnection(scope);
  assert.equal(row.outputEntry.id,'legacy');
  assert.equal(row.outputEntry.messageId,'m');
  assert.equal(row.outputEntry.charged,null);
  assert.deepEqual(row.outputEntry.outputs,['https://xianchou.com/result.png']);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('refresh preserves local files and requests the same result without a new submission',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-refresh-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 const context={type:'get3w.submit',hash:'input',quote:{amountUsd:'0.02'},call:{arguments:{idempotency_key:'original'}}};
 try{
  let journal=createModelTaskJournal({userData});const key=await journal.beforeSubmit(scope,context);
  await journal.observe(scope,context,{result:{structuredContent:{result:{request_id:'r',status:'completed',outputs:['https://xianchou.com/old.png']}}}});
  await journal.updateOutput(scope,key,{files:[{path:'local.png',sizeBytes:3}],downloadError:'expired'});
  await journal.refresh(scope,key);journal=createModelTaskJournal({userData});
  let [row]=await journal.list(scope);assert.equal(row.status,'processing');assert.equal(row.requestId,'r');assert.equal(row.arguments.idempotency_key,'original');assert.equal(row.outputEntry.files[0].path,'local.png');
  await journal.observe(scope,{type:'get3w.result',call:{arguments:{request_id:'r'}}},{result:{structuredContent:{result:{request_id:'r',status:'completed',outputs:['https://xianchou.com/new.png']}}}});
  [row]=await journal.list(scope);assert.equal(row.status,'completed');assert.deepEqual(row.outputEntry.outputs,['https://xianchou.com/new.png']);assert.equal((await journal.list(scope)).length,1);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('multi-step recovery preserves completed output and retries only the interrupted step',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-multi-step-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'chain'};
 const step=(key,inputs)=>({type:'get3w.submit',hash:JSON.stringify(inputs),quote:{amountUsd:'0.02'},call:{arguments:{idempotency_key:key,inputs}}});
 const image=step('image-step',{prompt:'fixture'});
 const video=step('video-step',{image:'https://xianchou.com/completed.png'});
 try{
  let journal=createModelTaskJournal({userData});
  const imageKey=await journal.beforeSubmit(scope,image);
  await journal.observe(scope,image,{result:{structuredContent:{result:{request_id:'image-request',status:'completed',outputs:['https://xianchou.com/completed.png'],charged:{amount:'0.02',currency:'USD'}}}}});
  const videoKey=await journal.beforeSubmit(scope,video);
  journal=createModelTaskJournal({userData});
  const {createModelTaskPoller}=await import('./get3w-model-task-poller.mjs');
  const readKeys=[];
  const poller=createModelTaskPoller({list:()=>journal.listConnection(scope),
   read:async row=>{readKeys.push(row.arguments.idempotency_key);assert.deepEqual(row.arguments,video.call.arguments);return {request_id:'video-request',status:'completed',outputs:['https://xianchou.com/video.mp4']};},
   save:(row,result)=>journal.observe(row.scope,video,{result:{structuredContent:{result}}})});
  await poller.tick();await poller.tick();poller.stop();
  assert.deepEqual(readKeys,['video-step']);
  const rows=await journal.list(scope);assert.equal(rows.length,2);
  assert.deepEqual(rows.find(row=>row.key===imageKey).outputEntry.outputs,['https://xianchou.com/completed.png']);
  assert.equal(rows.find(row=>row.key===videoKey).status,'completed');
  assert.deepEqual(await journal.list({...scope,sessionId:'another-chain'}),[]);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('detached chain blocks session submits and survives restart until explicit retrieval',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-chain-stop-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 const step={type:'get3w.submit',messageId:'turn',hash:'input',quote:{amountUsd:'0'},call:{arguments:{idempotency_key:'c'}}};
 try{
  let journal=createModelTaskJournal({userData});const key=await journal.beforeSubmit(scope,step);
  await journal.observe(scope,step,{result:{structuredContent:{result:{request_id:'r',status:'processing'}}}});
  await journal.detach(scope,key);journal=createModelTaskJournal({userData});
  const next={...step,hash:'next',call:{arguments:{idempotency_key:'d'}}};
  assert.equal(await journal.isStopped(scope,next),true);
  await assert.rejects(journal.beforeSubmit(scope,next),/stopped waiting/);
  assert.equal(await journal.isStopped(scope,{type:'get3w.result',call:{arguments:{request_id:'r'}}}),true);
  assert.equal(await journal.isStopped({...scope,sessionId:'other'},next),false);
  assert.equal(await journal.isStopped(scope,{...next,messageId:'new-turn'}),true);
  await journal.resume(scope,key);assert.equal(await journal.isStopped(scope,next),false);
  assert.equal((await journal.list(scope)).length,1);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('definitively stale quotes can be replaced only for the same frozen inputs and key',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-requote-'));
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 const first={type:'get3w.submit',hash:'old',quote:{amountUsd:'0.02'},call:{arguments:{idempotency_key:'original',slug:'demo',quote_id:'old',inputs:{prompt:'cup'}}}};
 try{
  const journal=createModelTaskJournal({userData});const key=await journal.beforeSubmit(scope,first);
  await journal.observe(scope,first,{result:{structuredContent:{result:{status:'failed',error:{code:'quote_stale'}}}}});journal.releaseSubmit(scope,first);
  const replacement={...first,hash:'new',call:{arguments:{...first.call.arguments,quote_id:'new'}}};
  await assert.rejects(journal.beforeSubmit(scope,{...replacement,call:{arguments:{...replacement.call.arguments,inputs:{prompt:'changed'}}}}),/conflict/);
  assert.equal(await journal.beforeSubmit(scope,replacement),key);
  const rows=await journal.list(scope);assert.equal(rows.length,1);assert.equal(rows[0].status,'submitting');assert.equal(rows[0].arguments.quote_id,'new');
 }finally{await rm(userData,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createResourceUploader,resolveResourceReferences} from './get3w-resource-upload.mjs';
import {createNativeMedia} from './get3w-native-media.mjs';

async function fixture(run) {
 const directory=await mkdtemp(path.join(tmpdir(),'get3w-resource-'));
 try {
  const filename=path.join(directory,'原图.png');await writeFile(filename,'original bytes');
  await run({directory,filename,host:{workspaceDirectory:directory,workspaceId:'ws',sessionId:'ses',userMessageId:'user'},signal:new AbortController().signal});
 }finally{await rm(directory,{recursive:true,force:true});}
}
const ticket={type:'image',download_url:'https://files.example.test/original.png',upload:{method:'PUT',url:'https://upload.example.test/ticket',headers:{'Content-Type':'image/png'}}};

test('Get3W ticket precedes byte upload, only a completed upload returns a URL; same bytes deduplicate within a chat',()=>fixture(async({filename,host,signal})=>{
 const steps=[];
 const upload=createResourceUploader({verify:async()=>{},ticket:async args=>{steps.push(['ticket',args]);return ticket;},fetchImpl:async(url,options)=>{steps.push(['put',url.href,options]);return {ok:true};}});
 const [a,b]=await Promise.all([upload(filename,host,signal),upload(pathToFileURL(filename).href,host,signal)]);
 assert.deepEqual(a,b);assert.equal(a.url,ticket.download_url);assert.equal(steps.length,2);
 assert.equal(steps[0][1].size_bytes,14);assert.equal(steps[1][2].body.toString(),'original bytes');assert.equal(steps[1][2].redirect,'error');
 await upload(filename,{...host,sessionId:'another'},signal);assert.equal(steps.length,4);
 await writeFile(filename,'changed');await upload(filename,host,signal);assert.equal(steps.length,6);
}));

test('nested resource inputs resolve arrays and objects without changing remote URLs',()=>fixture(async({filename,host,signal})=>{
 const result=await resolveResourceReferences({images:[filename,'https://example.test/ref'],mask:{url:pathToFileURL(filename).href}},async()=>({url:'https://uploaded.test/file'}),host,signal);
 assert.deepEqual(result,{images:['https://uploaded.test/file','https://example.test/ref'],mask:{url:'https://uploaded.test/file'}});
}));

test('rejects external symlinks, invalid tickets, upload failure, revoked account and cancellation',()=>fixture(async({directory,filename,host,signal})=>{
 const outside=await mkdtemp(path.join(tmpdir(),'get3w-external-'));
 try {
  await writeFile(path.join(outside,'private.png'),'private');await symlink(path.join(outside,'private.png'),path.join(directory,'escape.png'));
  let puts=0,tickets=0,fail=true;
  const upload=createResourceUploader({verify:async()=>{},ticket:async()=>{tickets++;return ticket;},fetchImpl:async()=>{puts++;return {ok:!fail};}});
  await assert.rejects(upload(path.join(directory,'escape.png'),host,signal),/current workspace/);assert.equal(tickets,0);
  await assert.rejects(upload(filename,host,signal),/upload failed/);fail=false;
  assert.equal((await upload(filename,host,signal)).url,ticket.download_url);assert.equal(puts,2);
  const invalid=createResourceUploader({verify:async()=>{},ticket:async()=>({...ticket,download_url:'file:///tmp/private'}),fetchImpl:async()=>{throw Error('must not send');}});
  await assert.rejects(invalid(filename,host,signal),/destination/);
  const revoked=createResourceUploader({verify:async()=>{throw Error('account revoked');},ticket:async()=>{throw Error('must not request');}});
  await assert.rejects(revoked(filename,host,signal),/account revoked/);
  const aborted=new AbortController();aborted.abort(Error('canceled'));
  await assert.rejects(upload(filename,host,aborted.signal),/canceled/);
 } finally{await rm(outside,{recursive:true,force:true});}
}));

test('native upload and generation share the pipeline; quote uses uploaded URLs and retries survive restart',()=>fixture(async({directory,filename,host,signal})=>{
 const calls=[];let puts=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{puts++;assert.equal(options.method,'PUT');assert.equal(options.body.toString(),'original bytes');return {ok:true};};
 const auth={status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'v1',models:[{model_id:'test/image-to-image',type:'image-to-image',name:'Edit'}]})};
 const dispatch=async(name,args)=>{
  if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.models.schema','get3w.media.upload','get3w.quote','get3w.submit'].map(handler=>({handler,name:handler}))}}};
  calls.push(args);
  let result;
  if(args.name==='get3w.models.schema')result={input_schema:{type:'object',required:['prompt','image_urls'],properties:{prompt:{type:'string'},image_urls:{type:'array',items:{type:'string',format:'uri'}}}}};
  if(args.name==='get3w.media.upload')result=ticket;
  if(args.name==='get3w.quote')result={quote_id:'quote'};
  if(args.name==='get3w.submit')result={request_id:'request',status:'submitted'};
  return {result:{structuredContent:{status:'succeeded',result}}};
 };
 let submitted;
 const create=()=>createNativeMedia({auth,userId:'owner',directory,dispatch:async(...args)=>{const result=await dispatch(...args);if(args[1]?.name==='get3w.submit')submitted={key:args[1].idempotency_key,status:'submitted',requestId:'request'};return result;},findTask:async()=>submitted});
 try {
  const media=create();
  assert.equal((await media.call('resource_upload',{path:filename},host,signal)).resource.url,ticket.download_url);
  const prep=await media.call('media_prepare',{task_type:'image-to-image'},host,signal);
  const input={preparation_id:prep.preparation_id,inputs:{prompt:'repair',image_urls:[pathToFileURL(filename).href]}};
  assert.equal((await media.call('media_generate',{...input,inputs:{image_urls:input.inputs.image_urls}},host,signal)).status,'error');
  assert.equal((await create().call('media_generate',input,host,signal)).request_id,'request');
  assert.equal(puts,1);
  assert.deepEqual(calls.find(c=>c.name==='get3w.quote').arguments.inputs.image_urls,[ticket.download_url]);
  assert.deepEqual(calls.find(c=>c.name==='get3w.quote').arguments.inputs,calls.find(c=>c.name==='get3w.submit').arguments.inputs);
  assert.equal((await create().call('media_generate',input,host,signal)).request_id,'request');assert.equal(puts,1);
  assert.equal(calls.filter(c=>c.name==='get3w.submit').length,1);
 }finally{globalThis.fetch=originalFetch;}
}));

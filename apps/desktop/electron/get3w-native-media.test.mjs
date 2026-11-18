import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNativeMedia} from './get3w-native-media.mjs';
const types=['text-to-image','image-to-image','text-to-video','reference-to-video','video-edit','text-to-speech','text-to-music'];
const host={workspaceId:'workspace',sessionId:'ses_native_media_123',userMessageId:'user',messageId:'assistant',generationPolicy:{models:{},outputs:{'text-to-image':{channel:'official'}}}};
const schema={type:'object',required:['prompt','channel'],properties:{prompt:{type:'string'},channel:{type:'string',enum:['economy','official'],default:'economy'},quality:{type:'string',enum:['low','medium'],default:'low'},images:{type:'array',items:{type:'string'}}}};
function fixture(directory,definition=schema){
 let calls=[],tasks=[],identity='owner',denied=false,version='v1';
 const auth={status:async()=>({status:'signed_in',user:{id:identity}}),taskCatalog:async()=>({catalog_version:version,models:types.map(type=>({model_id:`demo/model/${type}`,type,name:'Native Media',base_price:1}))})};
 const dispatch=async(name,args)=>{
  calls.push({name,args});
  if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.models.schema','get3w.quote','get3w.submit'].map(name=>({handler:name,name}))}}};
  const {name:cap,arguments:input}=args;
  if(cap==='get3w.submit'&&denied)return {error:{message:'Approval denied'}};
  let result;
  if(cap==='get3w.models.schema')result={input_schema:definition};
  if(cap==='get3w.quote')result={quote_id:'quote'};
  if(cap==='get3w.submit'){tasks.push({key:'task',status:'submitted',requestId:'request',arguments:input});result={request_id:'request',status:'submitted'};}
  return {result:{structuredContent:{status:'succeeded',result}}};
 };
 const create=()=>createNativeMedia({auth,userId:'owner',directory,dispatch,readImageDimensions:async()=>({width:2048,height:2560}),findTask:async(_,key)=>tasks.find(row=>row.arguments.idempotency_key===key)});
 return {create,calls,tasks,setIdentity:value=>identity=value,setDenied:value=>denied=value,setVersion:value=>version=value};
}
test('all native media types merge defaults and references, submit exact quoted inputs once, and restore after restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-media-'));const f=fixture(dir);const signal=new AbortController().signal;
 try{
  for(const type of types){
   const media=f.create();const ready=await media.call('media_prepare',{task_type:type,references:{images:['https://example.test/a','https://example.test/b']}},host,signal);
   assert.equal(ready.status,'needs_input');assert.match(ready.preparation_id,/^media_[1-9][0-9]*$/);assert.deepEqual(ready.missing_inputs,['prompt']);
   assert.equal(ready.parameters.properties.channel.default,type==='text-to-image'?'official':'economy');
   const input={preparation_id:ready.preparation_id,inputs:{prompt:'cup'}};
   const [a,b]=await Promise.all([media.call('media_generate',input,host,signal),media.call('media_generate',input,host,signal)]);
   assert.equal(a.request_id,'request');assert.deepEqual(a,b);
   const submit=f.calls.filter(call=>call.args.name==='get3w.submit').at(-1).args;
   const quote=f.calls.filter(call=>call.args.name==='get3w.quote').at(-1).args;
   assert.deepEqual(quote.arguments.inputs,submit.arguments.inputs);
   assert.equal(submit.arguments.channel,undefined);
   assert.equal(submit.arguments.inputs.channel,type==='text-to-image'?'official':'economy');
   assert.equal(submit.idempotency_key,submit.arguments.idempotency_key);
   assert.equal(submit.arguments.session_id,host.sessionId);
   assert.equal((await f.create().call('media_generate',input,host,signal)).request_id,'request');
   assert.equal((await media.call('media_generate',{...input,inputs:{prompt:'changed'}},host,signal)).error.code,'input_conflict');
  }
  assert.equal(f.tasks.length,types.length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unknown fields, missing parameters, explicit unavailable models, identity and message changes cannot submit',async()=>{
 const f=fixture();const media=f.create(),signal=new AbortController().signal;
 assert.equal((await media.call('media_prepare',{task_type:'text-to-image',model:'missing'},host,signal)).error.code,'model_unavailable');
 const invalid=await media.call('media_prepare',{task_type:'image_generation'},host,signal);assert.equal(invalid.error.code,'invalid_task_type');assert.ok(invalid.error.supported_task_types.includes('text-to-image')); 
 const ready=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 for(const inputs of [{n:1,prompt:'cup'},{quality:'invalid',prompt:'cup'},{}])assert.equal((await media.call('media_generate',{preparation_id:ready.preparation_id,inputs},host,signal)).error.code,'invalid_inputs');
 assert.equal(f.tasks.length,0);
 assert.equal((await media.call('media_generate',{preparation_id:ready.preparation_id,inputs:{prompt:'cup'}},{...host,userMessageId:'other'},signal)).error.code,'preparation_unavailable');
 f.setIdentity('other');assert.equal((await media.call('media_generate',{preparation_id:ready.preparation_id,inputs:{prompt:'cup'}},host,signal)).status,'error');
 assert.equal(f.tasks.length,0);
});
test('unsupported references return the selected model schema without uploading or submitting',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;
 const result=await media.call('media_prepare',{task_type:'image-to-image',references:{image_urls:['https://example.test/source.png']}},host,signal);
 assert.equal(result.error.code,'invalid_references');
 assert.deepEqual(result.error.unsupported_fields,['image_urls']);
 assert.deepEqual(result.error.parameters.properties.images,schema.properties.images);
 assert.equal(f.tasks.length,0);
 assert.ok(!f.calls.some(call=>call.args.name==='get3w.media.upload'||call.args.name==='get3w.quote'));
 const retry=await media.call('media_prepare',{task_type:'image-to-image',references:{images:['https://example.test/source.png']}},host,signal);
 assert.equal(retry.status,'needs_input');
});
test('personal capability discovery is reused across chats and invalidated by catalog changes',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;
 for(let index=0;index<3;index++){
  if(index===2)f.setVersion('v2');
  const scope={...host,sessionId:`ses_native_media_${index}`,userMessageId:`user-${index}`};
  const prep=await media.call('media_prepare',{task_type:'text-to-image'},scope,signal);
  const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},scope,signal);
  assert.equal(result.status,'submitted');
  assert.equal(f.tasks.at(-1).arguments.session_id,scope.sessionId);
 }
 assert.equal(f.calls.filter(call=>call.name==='search_capabilities').length,2);
});
test('denial is terminal and catalog changes revalidate without duplicate submissions',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;
 const ready=await media.call('media_prepare',{task_type:'text-to-video'},host,signal);
 f.setVersion('v2');f.setDenied(true);
 const input={preparation_id:ready.preparation_id,inputs:{prompt:'cup'}};
 assert.equal((await media.call('media_generate',input,host,signal)).status,'error');
 f.setDenied(false);
 assert.equal((await media.call('media_generate',input,host,signal)).error.code,'approval_denied');assert.equal(f.tasks.length,0);
});


test('30 controlled preparations across image, video and audio need no agent discovery or polling',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;const timings=[];
 for(let index=0;index<30;index++){
  const start=performance.now();const scope={...host,userMessageId:`sample-${index}`};
  const prep=await media.call('media_prepare',{task_type:['text-to-image','text-to-video','text-to-speech'][index%3]},scope,signal);
  const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},scope,signal);
  assert.equal(result.status,'submitted');timings.push(performance.now()-start);
 }
 assert.equal(f.tasks.length,30);
 assert.equal(f.calls.filter(call=>call.name==='search_capabilities').length,1);
 assert.equal(f.calls.filter(call=>call.args.name==='get3w.models.schema').length,3);
 assert.equal(f.calls.filter(call=>call.args.name==='get3w.result').length,0);
 timings.sort((a,b)=>a-b);assert.ok(timings[28]<30000);
 console.info('Controlled host p95 ms:',timings[28].toFixed(2),'(not a real model/network benchmark)');
});

test('native loopback tools preserve the real quote guard, approval, journal and trusted session',async()=>{
 const {createGet3wMcpProxy}=await import('./get3w-mcp-proxy.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'native-loopback-'));const tasks=[];let approved=0,submitted=0,searches=0;let currentHost=host;
 const proxy=await createGet3wMcpProxy({userId:'owner',workspaceId:host.workspaceId,hostToken:'secret',enforceModelGuard:true,nativeMediaDirectory:dir,
  approveSubmit:async()=>{approved++;return true;},journal:{findTask:async(_,key)=>tasks.find(task=>task.arguments.idempotency_key===key),beforeSubmit:async context=>tasks.push({key:'durable',status:'submitting',arguments:context.call.arguments}),observe:async(context,payload)=>{if(context.type==='get3w.submit'){tasks.at(-1).requestId=payload.result.structuredContent.result.request_id;tasks.at(-1).status='submitted';}}},
  auth:{status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'v1',models:[{model_id:'demo/image',type:'text-to-image',name:'Image',api_schema:{api_schemas:[{request_schema:schema}]}}]}),
   submitPersonal:async({arguments:args})=>{assert.equal(tasks.length,submitted+1);assert.equal(args.session_id,currentHost.sessionId);submitted++;return {request_id:'native-request',status:'submitted'};},
   mcp:async({body,headers})=>{const msg=JSON.parse(body),call=msg.params?.arguments;let value;
    if(msg.method==='tools/call'){assert.ok(headers.accept.includes('application/json'));assert.ok(headers.accept.includes('text/event-stream'));}
    if(msg.method==='tools/list')return {response:Response.json({result:{tools:[{name:'execute_capability',inputSchema:{type:'object',properties:{}}}]}})};
    if(msg.params.name==='search_capabilities'){searches++;value={data:['get3w.models.schema','get3w.quote','get3w.submit'].map(name=>({name,handler:name,enabled:true}))};}
    else if(call.name==='get3w.models.schema')value={status:'succeeded',result:{input_schema:schema}};
    else if(call.name==='get3w.quote')value={status:'succeeded',result:{quote_id:'q',slug:'demo/image',currency:'USD',discounted_price:'0.01',expires_at:Math.floor(Date.now()/1000)+300}};
    else throw Error('Paid call escaped the host');
    return {response:Response.json({result:{structuredContent:value}})};
   }}});
 const call=async(name,args,trusted=true)=>{const result=await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json',...(trusted?{'X-Get3W-Host-Token':'secret'}:{})},body:JSON.stringify({id:1,method:'tools/call',params:{name,arguments:args},hostContext:currentHost})});return {status:result.status,payload:await result.json()};};
 try{
  const listing=await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json'},body:JSON.stringify({id:1,method:'tools/list'})});
  assert.equal((await listing.json()).result.tools.some(tool=>tool.name==='native_media_ready'),true);
  assert.equal((await call('media_prepare',{task_type:'text-to-image'},false)).status,403);
  assert.equal((await call('resource_upload',{path:'/tmp/private.png'},false)).status,403);
  assert.equal((await call('resource_upload',{})).payload.result.structuredContent.error.code,'invalid_input');
  const prep=(await call('media_prepare',{task_type:'text-to-image'})).payload.result.structuredContent;
  const input={preparation_id:prep.preparation_id,inputs:{prompt:'cup'}};
  assert.equal((await call('media_generate',input)).payload.result.structuredContent.request_id,'native-request');
  assert.equal((await call('media_generate',input)).payload.result.structuredContent.request_id,'native-request');
  assert.equal(submitted,1);assert.equal(approved,1);
  currentHost={...host,sessionId:'ses_native_second_chat',userMessageId:'second-user'};
  const second=(await call('media_prepare',{task_type:'text-to-image'})).payload.result.structuredContent;
  assert.equal((await call('media_generate',{preparation_id:second.preparation_id,inputs:{prompt:'second cup'}})).payload.result.structuredContent.request_id,'native-request');
  assert.equal(submitted,2);assert.equal(approved,2);assert.equal(searches,1);
  const generic=await call('execute_capability',{name:'undiscovered',arguments:{}});
  assert.equal(generic.payload.result.isError,true);
 }finally{await proxy.close();await rm(dir,{recursive:true,force:true});}
});


test('changed concurrent inputs conflict and repeated preparation retains the original task',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;
 const prep=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 const first=media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'first'}},host,signal);
 const second=media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'second'}},host,signal);
 const results=await Promise.all([first,second]);
 assert.equal(results[0].status,'submitted');assert.equal(results[1].error.code,'input_conflict');
 const retry=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 assert.equal(retry.preparation_id,prep.preparation_id);
 assert.equal((await media.call('media_generate',{preparation_id:retry.preparation_id,inputs:{prompt:'first'}},host,signal)).request_id,'request');
 assert.equal(f.tasks.length,1);
});


test('the Electron conditional resolver is generated from the shared settings engine',async()=>{
 const {readFile}=await import('node:fs/promises');const {createRequire}=await import('node:module');const ts=createRequire(new URL('../../../package.json',import.meta.url))('typescript');
 const source=await readFile(new URL('../../app/src/lib/model-settings.ts',import.meta.url),'utf8');
 const expected=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const generated=await readFile(new URL('./model-settings.mjs',import.meta.url),'utf8');
 assert.equal(generated.replace(/^\/\/ Generated[^\n]*\n/,'').replace('/** @param {object[]} schemas @param {Record<string, unknown>} selection */\n',''),expected);
});

test('expired quotes retry once before submission; uncertain submissions never dispatch twice',async()=>{
 for(const uncertain of [false,true]){
  const f=fixture();let attempts=0,quotes=0;
  const media=createNativeMedia({auth:{status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'1',models:[{model_id:'demo/image',type:'text-to-image',name:'Image'}]})},userId:'owner',dispatch:async(name,args)=>{
   if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.models.schema','get3w.quote','get3w.submit'].map(name=>({handler:name,name}))}}};
   if(args.name==='get3w.models.schema')return {result:{structuredContent:{status:'succeeded',result:{input_schema:schema}}}};
   if(args.name==='get3w.quote'){quotes++;return {result:{structuredContent:{status:'succeeded',result:{quote_id:`q-${quotes}`}}}};}
   attempts++;
   if(uncertain)throw Error('Timed out');
   if(attempts===1)return {result:{isError:true,structuredContent:{code:'invalid_model_call',not_submitted:true},content:[{type:'text',text:'quote_expired: Request a fresh quote.'}]}};
   return {result:{structuredContent:{status:'succeeded',result:{request_id:'task',status:'submitted'}}}};
  }});
  const signal=new AbortController().signal,prep=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
  const args={preparation_id:prep.preparation_id,inputs:{prompt:'cup'}};
  const result=await media.call('media_generate',args,host,signal);
  if(uncertain){assert.equal(result.status,'error');assert.equal((await media.call('media_generate',args,host,signal)).error.code,'submission_unconfirmed');assert.equal(attempts,1);}
  else{assert.equal(result.request_id,'task');assert.equal(attempts,2);assert.equal(quotes,2);}
 }
});

test('local reference paths outside the trusted workspace are refused before upload',async()=>{
 const {writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(tmpdir(),'native-ref-'));
 try{
  const file=path.join(dir,'reference.png');await writeFile(file,'sample');
  const f=fixture(),media=f.create(),signal=new AbortController().signal;
  const result=await media.call('media_prepare',{task_type:'image-to-image',references:{images:[file]}},{...host,workspaceDirectory:path.join(dir,'missing')},signal);
  assert.equal(result.status,'error');assert.equal(f.calls.some(call=>call.args.name==='get3w.media.upload'),false);assert.equal(f.tasks.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('preparation intent without a durable submit journal can resume after a crash',async()=>{
 const {writeFile,readFile}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(tmpdir(),'native-crash-gap-'));
 try{
  const f=fixture(dir),signal=new AbortController().signal;
  const prep=await f.create().call('media_prepare',{task_type:'text-to-image'},host,signal);
  const file=path.join(dir,'native-media-preparations.json'),saved=JSON.parse(await readFile(file,'utf8'));
  saved.records[0].submissionAttempted=true;await writeFile(file,JSON.stringify(saved));
  const result=await f.create().call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},host,signal);
  assert.equal(result.status,'submitted');assert.equal(f.tasks.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('published catalog schemas avoid discovery and retain conditional defaults in concise definitions',async()=>{
 const conditional={type:'object',required:['prompt'],properties:{prompt:{type:'string'},channel:{type:'string',enum:['economy','official'],default:'economy'},quality:{type:'string',enum:['low','high'],default:'low','x-channel-options':{official:[{value:'high',label:'High'}]}},label:{type:'string',description:'Keep this real input field'},examples:{type:'string'}}};
 const calls=[],media=createNativeMedia({userId:'owner',auth:{status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'v',models:[{model_id:'demo/image',name:'Image',type:'text-to-image',api_schema:{api_schemas:[{request_schema:conditional}]}}]})},dispatch:async(name,args)=>{
  calls.push({name,args});
  if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.quote','get3w.submit'].map(name=>({name,handler:name}))}}};
  return {result:{structuredContent:{status:'succeeded',result:args.name==='get3w.quote'?{quote_id:'q'}:{status:'submitted',request_id:'r'}}}};
 }});
 const signal=new AbortController().signal,prep=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 assert.equal(calls.length,0);assert.ok(prep.parameters.properties.label);assert.ok(prep.parameters.properties.examples);
 const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},host,signal);
 assert.equal(result.status,'submitted');assert.equal(calls.find(row=>row.args.name==='get3w.quote').args.arguments.inputs.quality,'high');
});

test('unreadable local files supplied during generation fail before any quote',async()=>{
 const f=fixture(),media=f.create(),signal=new AbortController().signal;
 const prep=await media.call('media_prepare',{task_type:'image-to-image'},host,signal);
 const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'edit',images:['/tmp/reference.png']}},host,signal);
 assert.equal(result.status,'error');assert.match(result.error.message,/workspace/i);
 assert.equal(f.calls.some(call=>call.args.name==='get3w.quote'),false);assert.equal(f.tasks.length,0);
});

test('a stale catalog refreshes once, revalidates frozen inputs and requotes without changing the key',async()=>{
 let version='v1',refreshes=0,submits=0;const quoted=[],keys=[];
 const catalog=()=>({catalog_version:version,models:[{model_id:'demo/image',name:'Image',type:'text-to-image',api_schema:{api_schemas:[{request_schema:schema}]}}]});
 const media=createNativeMedia({userId:'owner',auth:{status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async input=>{if(input.refresh){version='v2';refreshes++;}return catalog();}},dispatch:async(name,args)=>{
  if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.quote','get3w.submit'].map(name=>({handler:name,name}))}}};
  if(args.name==='get3w.quote'){quoted.push(args.arguments.inputs);return {result:{structuredContent:{status:'succeeded',result:{quote_id:`q${quoted.length}`}}}};}
  submits++;keys.push(args.idempotency_key);
  if(submits===1)return {error:{reason:'quote_stale',not_submitted:true,message:'Catalog changed'}};
  return {result:{structuredContent:{status:'succeeded',result:{request_id:'original',status:'submitted'}}}};
 }});
 const signal=new AbortController().signal,prep=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},host,signal);
 assert.equal(result.request_id,'original');assert.equal(refreshes,1);assert.equal(submits,2);
 assert.deepEqual(quoted[0],quoted[1]);assert.equal(keys[0],keys[1]);
});

test('type-specific music, speech, image edit and multi-reference video schemas reject incomplete inputs before quoting',async()=>{
 const definitions={
  'text-to-music':{required:['prompt','instrumental'],properties:{prompt:{type:'string'},instrumental:{type:'boolean',default:true},duration:{type:'integer',default:10,minimum:5,maximum:30}}},
  'text-to-speech':{required:['text','voice'],properties:{text:{type:'string',minLength:1},voice:{type:'string',enum:['speaker'],default:'speaker'},format:{type:'string',enum:['mp3'],default:'mp3'}}},
  'image-to-image':{required:['prompt','images'],properties:{prompt:{type:'string'},images:{type:'array',minItems:1,items:{type:'string',format:'uri'}},num_images:{type:'integer',minimum:1,maximum:4,default:1}}},
  'video-edit':{required:['prompt','video_url'],properties:{prompt:{type:'string'},video_url:{type:'string',format:'uri'}}},
  'reference-to-video':{required:['prompt','images'],properties:{prompt:{type:'string'},images:{type:'array',minItems:2,maxItems:4,items:{type:'string',format:'uri'}}}},
 };
 const quoted=[];
 const media=createNativeMedia({userId:'owner',auth:{status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'typed',models:Object.entries(definitions).map(([type,definition])=>({model_id:`demo/${type}`,name:type,type,api_schema:{api_schemas:[{request_schema:{type:'object',...definition}}]}}))})},dispatch:async(name,args)=>{
  if(name==='search_capabilities')return {result:{structuredContent:{data:['get3w.quote','get3w.submit'].map(name=>({handler:name,name}))}}};
  if(args.name==='get3w.quote')quoted.push(args.arguments);
  return {result:{structuredContent:{status:'succeeded',result:args.name==='get3w.quote'?{quote_id:'q'}:{status:'submitted',request_id:`r${quoted.length}`}}}};
 }});
 const signal=new AbortController().signal;
 for(const type of Object.keys(definitions)){
  const references=type==='video-edit'?{video_url:'https://example.test/input.mp4'}:type.includes('image')||type==='reference-to-video'?{images:['https://example.test/a.png','https://example.test/b.png']}:{};
  const prep=await media.call('media_prepare',{task_type:type,references},host,signal);
  const before=quoted.length;
  const incomplete=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{}},host,signal);
  assert.equal(incomplete.error.code,'invalid_inputs');assert.equal(quoted.length,before);
  const inputs=type==='text-to-speech'?{text:'今天愉快'}:{prompt:'Simple acceptance media',...(type==='image-to-image'?{num_images:2}:{})};
  const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs},host,signal);
  assert.equal(result.status,'submitted');assert.equal(quoted.length,before+1);
  assert.deepEqual({...quoted.at(-1).inputs,...references},quoted.at(-1).inputs);
  if(type==='image-to-image')assert.equal(quoted.at(-1).inputs.num_images,2);
  if(type==='text-to-music')assert.equal(quoted.at(-1).inputs.instrumental,true);
 }
});

test('reference video requires at least one nonempty reference even when the published schema omits it',async()=>{
 const f=fixture(),signal=new AbortController().signal,media=f.create();
 const prep=await media.call('media_prepare',{task_type:'reference-to-video'},host,signal);
 assert.deepEqual(prep.missing_inputs,['prompt',{one_of:['images']}]);
 for(const inputs of [{prompt:'cup'},{prompt:'cup',images:[]}]){
  const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs},host,signal);
  assert.equal(result.error.code,'invalid_inputs');
 }
 assert.equal(f.tasks.length,0);assert.equal(f.calls.some(call=>call.args.name==='get3w.quote'),false);
 assert.equal((await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup',images:['https://example.test/a']}},host,signal)).status,'submitted');
});


test('legacy UUID preparations remain usable and short handles cannot cross conversations',async()=>{
 const {readFile,writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(tmpdir(),'native-legacy-handle-'));
 try{
  const f=fixture(dir),signal=new AbortController().signal;
  await f.create().call('media_prepare',{task_type:'text-to-image'},host,signal);
  const file=path.join(dir,'native-media-preparations.json'),data=JSON.parse(await readFile(file,'utf8'));
  const legacy='8992fa34-257c-4f7f-867c-aab4cfa069f7';data.records[0].id=legacy;
  await writeFile(file,JSON.stringify(data));
  const media=f.create();
  assert.equal((await media.call('media_generate',{preparation_id:legacy,inputs:{prompt:'legacy'}},host,signal)).request_id,'request');
  const other={...host,sessionId:'ses_native_other_chat',userMessageId:'other'};
  const ready=await media.call('media_prepare',{task_type:'text-to-image'},other,signal);
  assert.match(ready.preparation_id,/^media_[1-9][0-9]*$/);
  assert.equal((await media.call('media_generate',{preparation_id:ready.preparation_id,inputs:{prompt:'other'}},host,signal)).error.code,'preparation_unavailable');
  assert.equal((await media.call('media_generate',{preparation_id:ready.preparation_id,inputs:{prompt:'other'}},other,signal)).request_id,'request');
  assert.equal(f.tasks.length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('saved 16:9 rejects invented 4:3 before quote; retry after restart preserves preferences',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-ratio-'));
 try{
  const definition={...schema,properties:{...schema.properties,aspect_ratio:{type:'string',enum:['4:3','16:9'],default:'4:3'},resolution:{type:'string',enum:['1k','2k'],default:'1k'}}};
  const f=fixture(dir,definition),signal=new AbortController().signal;
  const scope={...host,generationPolicy:{models:{},outputs:{'text-to-image':{aspect_ratio:'16:9',resolution:'2k'}}}};
  const media=f.create(),prep=await media.call('media_prepare',{task_type:'text-to-image'},scope,signal);
  assert.equal(prep.parameters.properties.aspect_ratio.default,'16:9');
  const bad=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup',aspect_ratio:'4:3'}},scope,signal);
  assert.equal(bad.error.code,'output_preference_conflict');
  assert.deepEqual(bad.error.expected,{aspect_ratio:'16:9'});
  assert.equal(f.calls.some(call=>call.args.name==='get3w.quote'),false);
  assert.equal((await f.create().call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'}},scope,signal)).status,'submitted');
  assert.equal(f.tasks[0].arguments.inputs.aspect_ratio,'16:9');
  assert.equal(f.tasks[0].arguments.inputs.resolution,'2k');
  assert.deepEqual(f.calls.find(call=>call.args.name==='get3w.quote').args.arguments.inputs,f.tasks[0].arguments.inputs);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('declared user overrides are validated and submitted with the exact quoted inputs',async()=>{
 const definition={...schema,properties:{...schema.properties,aspect_ratio:{type:'string',enum:['4:3','16:9'],default:'4:3'}}};
 const f=fixture(undefined,definition),media=f.create(),signal=new AbortController().signal;
 const scope={...host,generationPolicy:{models:{},outputs:{'text-to-image':{aspect_ratio:'16:9'}}}};
 const prep=await media.call('media_prepare',{task_type:'text-to-image'},scope,signal);
 const args={preparation_id:prep.preparation_id,inputs:{prompt:'cup'},output_overrides:{aspect_ratio:'4:3'}};
 assert.equal((await media.call('media_generate',{...args,output_overrides:{prompt:'other'}},scope,signal)).error.code,'invalid_input');
 assert.equal((await media.call('media_generate',{...args,output_overrides:{aspect_ratio:'bad'}},scope,signal)).error.code,'invalid_inputs');
 assert.equal(f.tasks.length,0);
 assert.equal((await media.call('media_generate',args,scope,signal)).status,'submitted');
 assert.equal(f.tasks[0].arguments.inputs.aspect_ratio,'4:3');
 assert.deepEqual(f.calls.find(call=>call.args.name==='get3w.quote').args.arguments.inputs,f.tasks[0].arguments.inputs);
});

test('same-reference candidates have distinct durable tasks and idempotent retries',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-candidates-')),f=fixture(dir),signal=new AbortController().signal;
 try{
  const media=f.create(),args={task_type:'text-to-video',references:{images:['https://example.test/product']}};
  const preps=await Promise.all(['a','b','c'].map(task_key=>media.call('media_prepare',{...args,task_key},host,signal)));
  assert.equal(new Set(preps.map(prep=>prep.preparation_id)).size,3);
  const results=await Promise.all(preps.map((prep,index)=>media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:`complete story ${index}`}},host,signal)));
  assert.ok(results.every(result=>result.status==='submitted'));assert.equal(f.tasks.length,3);
  const reopened=f.create(),retry=await reopened.call('media_prepare',{...args,task_key:'b'},host,signal);
  assert.equal(retry.preparation_id,preps[1].preparation_id);
  assert.equal((await reopened.call('media_generate',{preparation_id:retry.preparation_id,inputs:{prompt:'complete story 1'}},host,signal)).request_id,'request');
  assert.equal(f.tasks.length,3);
  assert.equal((await reopened.call('media_generate',{preparation_id:retry.preparation_id,inputs:{prompt:'changed story'}},host,signal)).error.code,'input_conflict');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('numeric conditional duration options retain integer schema type',async()=>{
 const definition={...schema,properties:{...schema.properties,duration:{type:'integer',enum:[5,10,15],default:5,'x-channel-options':{official:[{value:'5'},{value:'15'}]}}}};
 const f=fixture(undefined,definition),media=f.create(),signal=new AbortController().signal;
 const scope={...host,generationPolicy:{outputs:{'text-to-video':{channel:'official'}}}};
 const prep=await media.call('media_prepare',{task_type:'text-to-video'},scope,signal);
 assert.deepEqual(prep.parameters.properties.duration.enum,[5,15]);
 assert.equal((await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'story',duration:15}},scope,signal)).status,'submitted');
 assert.equal(f.tasks[0].arguments.inputs.duration,15);
});

test('workspace destination metadata remains local and does not alter quoted generation inputs',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-media-output-'));const f=fixture(dir),signal=new AbortController().signal;
 try{
  const media=f.create();const prep=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
  const output={task_name:'品牌宣传片',filename:'产品主视觉',directory:'品牌宣传片'};
  const result=await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'},output},host,signal);
  assert.equal(result.request_id,'request');
  const submit=f.calls.filter(call=>call.args.name==='get3w.submit').at(-1).args;
  assert.equal(submit.arguments.inputs.prompt,'cup');assert.equal(submit.arguments.inputs.output,undefined);
  assert.equal(submit.arguments.output,undefined);
  assert.equal((await media.call('media_generate',{preparation_id:prep.preparation_id,inputs:{prompt:'cup'},output:{filename:42}},host,signal)).error.code,'invalid_output');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('image edits preserve source pixels by default across refresh and restart; only explicit size overrides disable it',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'native-edit-size-'));
 const definition=structuredClone(schema);
 definition.properties.aspect_ratio={type:'string',enum:['auto','16:9','9:16','4:5'],default:'16:9'};
 definition.properties.resolution={type:'string',enum:['2K','4K'],default:'4K'};
 definition.properties.preserve_source_dimensions={type:'boolean',default:false};
 const scope={...host,generationPolicy:{outputs:{'image-to-image':{aspect_ratio:'16:9',resolution:'4K'}}}};
 const f=fixture(dir,definition),signal=new AbortController().signal;
 try{
  for(const explicit of [false,true]){
   const media=f.create();
   const prep=await media.call('media_prepare',{task_type:'image-to-image',task_key:String(explicit),references:{images:['https://example.test/source.png']}},scope,signal);
   assert.equal(prep.defaults.preserve_source_dimensions,true);
   assert.equal(prep.defaults.aspect_ratio,undefined);
   if(!explicit)f.setVersion('v2');
   const input={preparation_id:prep.preparation_id,inputs:{prompt:'repair cup'},...(explicit?{output_overrides:{aspect_ratio:'9:16',resolution:'2K'}}:{})};
   assert.equal((await f.create().call('media_generate',input,scope,signal)).status,'submitted');
   const submitted=f.tasks.at(-1).arguments.inputs;
   assert.equal(submitted.preserve_source_dimensions,!explicit);
   if(explicit){assert.equal(submitted.aspect_ratio,'9:16');assert.equal(submitted.resolution,'2K');}
   else {assert.equal(submitted.aspect_ratio,'4:5');assert.equal(submitted.resolution,'2K');}
   const quote=f.calls.filter(call=>call.args.name==='get3w.quote').at(-1).args.arguments.inputs;
   assert.deepEqual(quote,submitted);
   assert.equal((await f.create().call('media_generate',input,scope,signal)).request_id,'request');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('unknown style-derived model returns current task models and native automatic retry honors saved selection',async()=>{
 const signal=new AbortController().signal;
 const models=[
  {model_id:'provider/preferred/text-to-image',type:'text-to-image',name:'Preferred',base_price:2},
  {model_id:'provider/cheap/text-to-image',type:'text-to-image',name:'Cheap',base_price:1},
  {model_id:'provider/video/text-to-video',type:'text-to-video',name:'Video',base_price:1},
 ];
 const auth={status:async()=>({status:'signed_in',user:{id:'owner'}}),taskCatalog:async()=>({catalog_version:'v1',models:models.map(model=>({...model,api_schema:{api_schemas:[{request_schema:schema}]}})),desktop_defaults:{tasks:{image:{slug:'provider/preferred'}}}})};
 const media=createNativeMedia({auth,userId:'owner',dispatch:async()=>{throw Error('No gateway discovery expected');}});
 const failed=await media.call('media_prepare',{task_type:'text-to-image',model:'flair-art-3.0'},host,signal);
 assert.equal(failed.error.code,'model_unavailable');
 assert.equal(failed.error.requested_model,'flair-art-3.0');
 assert.deepEqual(failed.error.available_models,models.slice(0,2).map(({model_id,name})=>({model_id,name})));
 assert.match(failed.error.message,/retry media_prepare without model/);
 const retry=await media.call('media_prepare',{task_type:'text-to-image'},host,signal);
 assert.equal(retry.model.id,'provider/preferred/text-to-image');
 const selected={...host,generationPolicy:{selectedModels:[{slug:'provider/cheap'}]}};
 assert.equal((await media.call('media_prepare',{task_type:'text-to-image'},selected,signal)).model.id,'provider/cheap/text-to-image');
 const unavailable={...host,generationPolicy:{models:{'text-to-image':{slug:'removed/model',source:'explicit'}}}};
 assert.equal((await media.call('media_prepare',{task_type:'text-to-image'},unavailable,signal)).error.code,'model_unavailable');
 const unsupported={...host,generationPolicy:{selectedModels:[{slug:'provider/video'}]}};
 assert.equal((await media.call('media_prepare',{task_type:'text-to-image'},unsupported,signal)).error.code,'model_unavailable');
});

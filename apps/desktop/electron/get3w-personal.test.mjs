import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGet3wAuth} from './get3w-auth.mjs';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';
import {createModelTaskJournal} from './get3w-model-task-journal.mjs';
import {createModelTaskRecovery} from './get3w-model-task-recovery.mjs';

test('personal auth negotiates without organizations, binds Unicode consent, filters headers and aborts streams on logout',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-personal-'));
 const calls=[];let supported=true;
 const auth=createGet3wAuth({userData,safeStorage:{isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'keychain',encryptStringAsync:async s=>Buffer.from(s),decryptStringAsync:async b=>({result:b.toString()})},openExternal:async()=>{},fetchImpl:async(url,options)=>{
  calls.push({url,options});
  const route=url.split('/').at(-1);
  if(route==='requests')return Response.json({request_id:'handle',expires_in:300});
  if(route==='exchange')return Response.json({access_token:'secret',refresh_token:'refresh',expires_in:600});
  if(route==='me')return Response.json({user:{id:'alice',name:'Alice'}});
  if(route==='capabilities')return Response.json(supported?{contract_version:'personal-account-v1'}:{},{status:supported?200:404});
  if(route==='tasks')return Response.json({request_id:'r',status:'processing'});
  if(route==='models')return Response.json({catalog_version:'v',models:[]},{headers:{etag:'"entitlement-version"'}});
  return Response.json({ok:true});
 }});
 try {
  await auth.begin();const state=await auth.poll();assert.equal(state.accountMode,"personal");
  for(const name of ["organizations","createOrganization","members","updateMember","membership","toolAccess"])assert.equal(auth[name],undefined);
  assert.equal((await auth.taskCatalog({userId:'alice'})).catalog_version,'v');
  const args={slug:'demo/image',inputs:{prompt:'你好 🌏',size:1.5},quote_id:'q',idempotency_key:'stable',session_id:'chat-session-123456'};
  await auth.submitPersonal({userId:'alice',arguments:args});
  const task=JSON.parse(calls.find(c=>c.url.endsWith('/tasks')).options.body);
  assert.deepEqual(JSON.parse(task.approval.payload_json),args);
  assert.equal(task.approval.payload_hash,createHash('sha256').update(task.approval.payload_json).digest('hex'));
  assert.equal(task.conversation_id,args.session_id);assert.equal(task.userId,undefined);
  const stream=await auth.mcp({userId:'alice',sessionId:args.session_id,method:'POST',body:Buffer.from('{}'),headers:{authorization:'evil','x-get3w-organization':'evil'}});
  const upstream=calls.find(c=>c.url.endsWith('/v1/gateway/mcp'));
  assert.equal(upstream.options.headers['X-Get3W-Organization'],undefined);
  assert.equal(upstream.options.headers['X-Get3W-Session-Id'],args.session_id);
  assert.ok(!calls.some(c=>c.url.includes('/organizations')));
  supported=false;await assert.rejects(auth.taskCatalog({userId:'alice'}),/Update the Get3W server/);
  await auth.logout();assert.equal(upstream.options.signal.aborted,true);stream.release();
  await assert.rejects(auth.submitPersonal({userId:'alice',arguments:args}),/changed/);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('personal paid calls use REST only after trusted host approval and durable journal, denied calls never dispatch',async()=>{
 let allowed=false,submitted=0,persisted=0,approvals=0;
 const sessionId='chat-session-123456';
 const proxy=await createGet3wMcpProxy({userId:'alice',sessionId,hostToken:'host-secret',enforceModelGuard:true,
 approveSubmit:async()=>{approvals++;return allowed;},journal:{beforeSubmit:async()=>{persisted++;},observe:async()=>{}},
 auth:{taskCatalog:async()=>({models:[{model_id:"demo/image",type:"text-to-image",api_schema:{api_schemas:[{request_schema:{properties:{}}}]}}]}),submitPersonal:async input=>{assert.equal(persisted,1);submitted++;assert.equal(input.arguments.session_id,sessionId);return {request_id:'r',status:'processing'};},mcp:async input=>{
  const request=JSON.parse(input.body);const args=request.params.arguments;
  if(request.params.name==='search_capabilities')return {response:Response.json({result:{structuredContent:{data:[{name:'quote-alias',handler:'get3w.quote',enabled:true},{name:'submit-alias',handler:'get3w.submit',enabled:false}]}}})};
  assert.equal(args.name,'quote-alias','submit must never reach MCP');
  return {response:Response.json({result:{structuredContent:{status:'succeeded',result:{quote_id:'q',slug:'demo/image',currency:'USD',discounted_price:'0.1',expires_at:Math.floor(Date.now()/1000)+300}}}})};
 }}});
 const send=async(params,host=true)=>fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json',...(host?{'X-Get3W-Host-Token':'host-secret'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params,hostContext:{sessionId,messageId:'message'}})});
 try{
  const discovery=await (await send({name:'search_capabilities',arguments:{query:''}})).json();
  assert.equal(discovery.result.structuredContent.data[1].enabled,true);
  await send({name:'execute_capability',arguments:{name:'quote-alias',arguments:{slug:'demo/image',inputs:{prompt:'你好'}}}});
  const params={name:'execute_capability',arguments:{name:'submit-alias',idempotency_key:'key',arguments:{slug:'demo/image',inputs:{prompt:'你好'},quote_id:'q',idempotency_key:'key',session_id:sessionId}}};
  assert.equal((await send(params,false)).status,403);assert.equal(approvals,0);
  assert.ok((await (await send(params)).json()).error);assert.equal(submitted,0);assert.equal(persisted,0);
  allowed=true;assert.equal((await (await send(params)).json()).result.structuredContent.result.request_id,'r');
  assert.equal(submitted,1);assert.equal(persisted,1);
 }finally{await proxy.close();}
});

test('v3 recovery keeps legacy organization rows on disk, never serves or recovers them, and keeps a conservative budget',async()=>{
 const userData=await mkdtemp(path.join(os.tmpdir(),'get3w-journal-v3-'));
 let recovery;
 try{
  const journal=createModelTaskJournal({userData,limitUsd:'0.2'});
  const personal={userId:'alice',workspaceId:'ws',sessionId:'chat-session-123456'};
  const legacy={...personal,organizationId:'old-org'};
  const context=key=>({type:'get3w.submit',hash:key,quote:{amountUsd:'0.1'},call:{arguments:{idempotency_key:key,session_id:personal.sessionId,inputs:{prompt:'你好'}}}});
  await journal.beforeSubmit(legacy,context('old-key'));await journal.beforeSubmit(personal,context('personal-key'));
  await assert.rejects(journal.beforeSubmit(personal,context('third-key')),/budget exceeded/);
  assert.equal(JSON.parse(await readFile(path.join(userData,'get3w-model-tasks.json'))).version,3);
  assert.equal((await journal.listConnection({...personal,userId:'bob'})).length,0);
  const stored=JSON.parse(await readFile(path.join(userData,'get3w-model-tasks.json'))).records;
  assert.equal(stored.filter(row=>row.scope.organizationId==='old-org').length,1);
  let personalCalls=0,legacyCalls=0;
  recovery=createModelTaskRecovery({journal,scope:personal,auth:{submitPersonal:async input=>{personalCalls++;assert.equal(input.arguments.idempotency_key,'personal-key');return {request_id:'personal',status:'completed'};},mcp:async()=>{legacyCalls++;throw Error('legacy rows must not reach the gateway');}}});
  await new Promise(resolve=>setTimeout(resolve,1250));assert.equal(personalCalls,1);assert.equal(legacyCalls,0);
  const rows=await journal.listConnection(personal);
  assert.deepEqual(rows.map(row=>row.arguments.idempotency_key),['personal-key']);assert.equal(rows[0].status,'completed');
 }finally{recovery?.close();await rm(userData,{recursive:true,force:true});}
});

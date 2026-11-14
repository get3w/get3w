import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTaskLogs,redactTaskLog} from './task-logs.mjs';

async function harness(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'task-log-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let user='alice',fail=false;const calls=[];
 const auth={outputIdentity:()=>({userId:user}),taskLogRequest:async(uid,route,options)=>{assert.equal(uid,user);if(fail)throw Error('offline');calls.push({uid,route,options});return {};}};
 const fetchImpl=async url=>{
  const pathname=new URL(url).pathname;
  if(pathname.endsWith('/event'))return new Response('',{status:503});
  if(pathname.endsWith('/context')||pathname.endsWith('/message'))return Response.json({data:[{type:'user',content:'hello'},{type:'assistant',content:'done',cost:0.25}]});
  if(pathname.endsWith('/active')||pathname.endsWith('/status'))return Response.json({data:{}});
  return Response.json({data:{id:'ses_new',title:'A task'}});
 };
 const options={directory,auth,getServerInfo:async()=>({baseUrl:'http://127.0.0.1:1234',clientToken:'local'}),fetchImpl};
 const logger=createTaskLogs(options);t.after(()=>logger.stop());
 const exchange={workspaceId:'ws',directory,engine:'v2',path:'/opencode2/api/session',method:'POST',request:{},response:{data:{id:'ses_new',title:'New'}},status:200};
 return {directory,calls,logger,options,exchange,setUser:value=>{user=value},setFail:value=>{fail=value}};
}
test('credentials redacted recursively and in URLs',()=>{
 const clean=JSON.stringify(redactTaskLog({Authorization:'unsafe',nested:{api_key:'unsafe'},text:'Bearer unsafe',url:'https://a/?X-Amz-Signature=unsafe'}));assert(!clean.includes('unsafe'));
});
test('new tasks only, durable retry, no cross-account upload',async t=>{
 const h=await harness(t);
 await h.logger.capture({...h.exchange,path:'/session/ses_old/prompt',request:{text:'old'}});
 assert.equal((await h.logger.inspect()).tasks.length,0);
 await h.logger.capture(h.exchange);h.setFail(true);await h.logger.tick();assert.equal(h.calls.length,0);
 const next=createTaskLogs(h.options);t.after(()=>next.stop());
 h.setUser('bob');await next.tick();assert.equal(h.calls.length,0);
 h.setUser('alice');h.setFail(false);
 const state=await next.inspect();state.tasks[0].retryAt=0;
 // Restart preserves original IDs; retries wait for their bounded backoff.
 assert.equal(state.tasks[0].id,(await h.logger.inspect()).tasks[0].id);
 assert.equal(state.tasks[0].userId,'alice');
});
test('manual deletion erases local evidence, durable tombstone, archive keeps logs',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);
 await h.logger.capture({...h.exchange,path:'/session/ses_new',method:'PATCH',request:{time:{archived:123}},response:{}});
 assert.equal((await h.logger.inspect()).tasks[0].deleted,false);
 await h.logger.capture({...h.exchange,path:'/session/ses_new',method:'DELETE',request:null,response:null});
 let row=(await h.logger.inspect()).tasks[0];assert(row.deleted);assert.deepEqual(row.pending,[]);assert.deepEqual(row.files,[]);assert.equal(row.directory,undefined);
 await h.logger.tick();assert.equal(h.calls[0].options.method,'DELETE');
 await h.logger.capture(h.exchange);row=(await h.logger.inspect()).tasks[0];assert(row.deleted);assert.equal(row.pending.length,0);
});
test('snapshot, sanitized exchange and chunk upload are persisted',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);
 await h.logger.capture({...h.exchange,path:'/session/ses_new/prompt',request:{text:'Bearer unsafe '+ 'a'.repeat(800000)},response:{}});
 assert(!(await readFile(path.join(h.directory,'task-logs.json'),'utf8')).includes('unsafe'));
 await h.logger.tick();assert(h.calls.some(c=>c.route.endsWith('/events')));
 const events=h.calls.flatMap(c=>c.options.body?.events??[]);assert(events.some(e=>e.type==='evidence.chunk'));assert(events.some(e=>e.type==='messages.delta'));
});
test('offline restart eventually uploads original events exactly once after retry window',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);h.setFail(true);await h.logger.tick();h.logger.stop();
 const next=createTaskLogs({...h.options,now:()=>Date.now()+600000});t.after(()=>next.stop());h.setFail(false);
 await next.tick();const registered=h.calls.find(c=>c.route==='');assert(registered);
 assert.equal(registered.options.body.id,(await next.inspect()).tasks[0].id);
 const firstIds=h.calls.flatMap(c=>c.options.body?.events??[]).map(e=>e.id);
 await next.tick();const ids=h.calls.flatMap(c=>c.options.body?.events??[]).map(e=>e.id);
 assert.equal(new Set(ids).size,ids.length);assert(firstIds.length>0);
});
test('deleting before an upload survives restart and ignores late model evidence',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);await h.logger.capture({...h.exchange,method:'DELETE',path:'/session/ses_new',response:null});
 h.logger.stop();const next=createTaskLogs(h.options);t.after(()=>next.stop());
 await next.captureEvidence('ses_new',{type:'model.http.request',payload:{body:'must not return'}});await next.tick();
 assert(h.calls.every(c=>c.options.method==='DELETE'));
 assert(!(await readFile(path.join(h.directory,'task-logs.json'),'utf8')).includes('must not return'));
});
test('attachment chunks persist privately and upload before being removed from local queue',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);
 await h.logger.captureEvidence('ses_new',{type:'file',payload:{type:'file',url:'data:text/plain;base64,'+Buffer.from('api_key=unsafe').toString('base64'),mime:'text/plain',filename:'a.txt'}});
 await h.logger.tick();const upload=h.calls.find(c=>c.route.includes('/attachments/'));assert(upload);
 const content=Buffer.from(upload.options.body.base64,'base64').toString('utf8');assert(!content.includes('unsafe'));assert(content.includes('[REDACTED]'));
 const row=(await h.logger.inspect()).tasks[0];assert(row.files.every(f=>!f.pending&&!f.body));
});

test('client exchange retains interaction fields without duplicating response metadata',async t=>{
 const h=await harness(t);await h.logger.capture(h.exchange);
 await h.logger.capture({...h.exchange,path:'/session/ses_new/prompt',request:{text:'keep',unrelated:'discard'},response:{unrelated:'discard'}});
 const journal=JSON.stringify(await h.logger.inspect());assert(journal.includes('keep'));assert(!journal.includes('discard'));
});

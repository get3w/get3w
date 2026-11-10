import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGet3wMcpProxy} from './get3w-mcp-proxy.mjs';
for(const source of ['explicit','user','system'])test(`actual quote and submit respect ${source} selection`,async()=>{
 const calls=[];const sessionId='session_isolated_123456';
 const models=['explicit','user','system'].map(model_id=>({model_id,type:'text-to-image',api_schema:{api_schemas:[{request_schema:{properties:{num_images:{enum:[1,2]}}}}]}}));
 const policy={models:{'text-to-image':{slug:source,source}},outputs:{'text-to-image':{num_images:'2'}}};
 const proxy=await createGet3wMcpProxy({userId:'test',sessionId,hostToken:'isolated-host',enforceModelGuard:true,approveSubmit:async()=>true,journal:{isStopped:async()=>false,beforeSubmit:async()=>{},observe:async()=>{}},
 auth:{taskCatalog:async()=>({models}),submitPersonal:async({arguments:args})=>{calls.push({type:'submit',...args});return {status:'submitted'};},mcp:async({body})=>{
  const message=JSON.parse(body);const call=message.params.arguments;let structuredContent;
  if(message.params.name==='search_capabilities')structuredContent={data:[{name:'quote',handler:'get3w.quote'},{name:'submit',handler:'get3w.submit'}]};
  else{calls.push({type:'quote',...call.arguments});structuredContent={status:'succeeded',result:{quote_id:'q',slug:call.arguments.slug,currency:'USD',discounted_price:'0.02',expires_at:Math.floor(Date.now()/1000)+60}};}
  return {response:Response.json({result:{structuredContent}})};
 }}});
 const call=async(name,args)=>(await fetch(proxy.url,{method:'POST',headers:{Authorization:`Bearer ${proxy.token}`,'Content-Type':'application/json','X-Get3W-Host-Token':'isolated-host'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',hostContext:{sessionId,messageId:'message',generationPolicy:policy},params:{name,arguments:args}})})).json();
 try{
  await call('search_capabilities',{query:'models'});
  const rejected=await call('execute_capability',{name:'quote',arguments:{slug:source==='system'?'user':'system',inputs:{prompt:'test',num_images:2}}});
  assert.equal(rejected.result.isError,true);assert.equal(calls.length,0);
  const missing=await call('execute_capability',{name:'quote',arguments:{slug:source,inputs:{prompt:'test'}}});assert.equal(missing.result.isError,true);assert.equal(calls.length,0);
  await call('execute_capability',{name:'quote',arguments:{slug:source,inputs:{prompt:'test',num_images:2}}});
  await call('execute_capability',{name:'submit',idempotency_key:'test-key',arguments:{slug:source,inputs:{prompt:'test',num_images:2},quote_id:'q',session_id:sessionId,idempotency_key:'test-key'}});
  assert.equal(calls.length,2);assert.equal(calls[1].type,'submit');assert.equal(calls[1].slug,source);assert.equal(calls[1].inputs.num_images,2);
 }finally{await proxy.close();}
});

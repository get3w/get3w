import { test } from "node:test";
import assert from "node:assert/strict";
import { createGet3wInferenceProxy } from "./get3w-inference-proxy.mjs";

test("loopback proxy rejects browser, wrong token, arbitrary routes; preserves stream and status", async()=>{
  const calls=[];let releases=0;
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async input=>{
    calls.push(input);
    return {response:new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','x-task-id':'test','set-cookie':'private','x-get3w-model':'gpt-6.1-sol','x-get3w-auto-reason':'jev','x-get3w-auto-thinking':'high'}}),release:()=>{releases++;}};
  }}});
  const headers={Authorization:`Bearer ${proxy.apiKey}`};
  try {
    assert.equal((await fetch(proxy.baseURL+'/models')).status,401);
    assert.equal((await fetch(proxy.baseURL+'/models',{headers:{...headers,Origin:'https://example.com'}})).status,401);
    assert.equal((await fetch(proxy.baseURL+'/settings',{headers})).status,404);
    assert.equal(calls.length,0);
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:'{"model":"test","stream":true}'});
    assert.equal(response.headers.get('x-task-id'),'test');assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(response.headers.get('x-get3w-model'),'gpt-6.1-sol');
    assert.equal(response.headers.get('x-get3w-auto-reason'),'jev');
    assert.equal(response.headers.get('x-get3w-auto-thinking'),'high');
    assert.match(await response.text(),/\[DONE\]/);
    assert.equal(calls.length,1);assert.equal(calls[0].userId,'test-user');assert.equal(calls[0].route,'chat/completions');
    assert.equal(releases,1);
  }finally{await proxy.close();}
});

test("client cancellation aborts the upstream and never resubmits",async()=>{
  let upstreamSignal,calls=0,release;
  const done=new Promise(resolve=>{release=resolve;});
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async input=>{
    calls++;upstreamSignal=input.signal;
    return {response:new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: first\n\n'));}})),release};
  }}});
  try {
    const controller=new AbortController();
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body:'{}',signal:controller.signal});
    await response.body.getReader().read();controller.abort();
    await done;assert.equal(upstreamSignal.aborted,true);assert.equal(calls,1);
  }finally{await proxy.close();}
});

test("upstream quota status is preserved and transport errors are sanitized",async()=>{
  let fail=false,calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async()=>{
    calls++;if(fail)throw Error('private token and internal address');
    return {response:Response.json({error:{type:'insufficient_quota'}},{status:402}),release:()=>{}};
  }}});
  try {
    const headers={Authorization:`Bearer ${proxy.apiKey}`};
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:'{}'});
    assert.equal(response.status,402);assert.equal((await response.json()).error.type,'insufficient_quota');
    fail=true;const error=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:'{"new":true}'});
    assert.equal(error.status,400);assert.ok(!(await error.text()).includes('private'));assert.equal(calls,2);
  }finally{await proxy.close();}
});


test("submitted timeout and rate limit are terminal to prevent engine replay",async()=>{
  let status=504,calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async()=>{
    calls++;return {response:Response.json({error:{message:'private'}},{status}),release:()=>{}};
  }}});
  try {
    for(status of [504,503,429]){
      const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body:JSON.stringify({status})});
      assert.equal(response.status,400);const message=await response.text();assert.match(message,/Check model usage/);assert.ok(message.includes(`HTTP ${status}`));
    }
    assert.equal(calls,3);
  }finally{await proxy.close();}
});


test("interrupted SSE ends with explicit error without a socket replay",async()=>{
  let calls=0,releases=0;
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async()=>{
    calls++;
    let sent=false;
    return {response:new Response(new ReadableStream({pull(c){if(!sent){sent=true;c.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));}else c.error(Error('private'));}}),{headers:{'content-type':'text/event-stream'}}),release:()=>{releases++;}};
  }}});
  try {
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body:'{}'});
    const body=await response.text();assert.match(body,/stream interrupted/);assert.match(body,/\[DONE\]/);assert.ok(!body.includes('private'));assert.equal(calls,1);assert.equal(releases,1);
  }finally{await proxy.close();}
});


test("SDK duplicate after failure is rejected locally, successful tool turns remain allowed",async()=>{
  let calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'test-user',auth:{inference:async()=>{calls++;return {response:Response.json({error:{message:'timeout'}},{status:504}),release:()=>{}};}}});
  try{
    const send=()=>fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`,'x-get3w-request-id':'stable-test-request'},body:'{"messages":[{"content":"same"}]}'});
    assert.equal((await send()).status,400);assert.equal((await send()).status,409);assert.equal(calls,1);
  }finally{await proxy.close();}
});

test("independent title and task requests run concurrently without rejection",async()=>{
  let active=0,max=0,calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'u',auth:{inference:async()=>{
    calls++;active++;max=Math.max(max,active);
    await new Promise(resolve=>setTimeout(resolve,10));
    return {response:Response.json({choices:[]}),release:()=>{active--;}};
  }}});
  try{
    const send=n=>fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body:JSON.stringify({n})}).then(async r=>{await r.text();return r.status;});
    assert.deepEqual(await Promise.all([send(1),send(2)]),[200,200]);assert.equal(calls,2);assert.equal(max,2);
  }finally{await proxy.close();}
});


test("consumer closing after a terminal SSE event does not block the next task", async()=>{
  let calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'u',auth:{inference:async()=>{
    calls++;
    return {response:new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n'));}}),{headers:{'content-type':'text/event-stream'}}),release:()=>{}};
  }}});
  try {
    const controller=new AbortController();
    const headers={Authorization:`Bearer ${proxy.apiKey}`};
    const first=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:'{"n":1}',signal:controller.signal});
    await first.body.getReader().read();controller.abort();
    const secondController=new AbortController();
    const second=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers,body:'{"n":2}',signal:secondController.signal});
    assert.equal(second.status,200);await second.body.getReader().read();secondController.abort();
    assert.equal(calls,2);
  } finally { await proxy.close(); }
});


test("parallel duplicate bodies are submitted once while new requests remain usable after failure",async()=>{
 let calls=0,finish;
 const gate=new Promise(resolve=>{finish=resolve;});
 const proxy=await createGet3wInferenceProxy({userId:'u',auth:{inference:async input=>{
  calls++;
  if(input.body.toString()==='{"slow":true}')await gate;
  return {response:Response.json({choices:[]},{status:input.body.toString()==='{"fail":true}'?504:200}),release:()=>{}};
 }}});
 const send=body=>fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`,'X-Get3W-Request-Id':'test-'+body},body});
 try{
  const slow=send('{"slow":true}');
  while(calls===0)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal((await send('{"slow":true}')).status,409);
  assert.equal((await send('{"fail":true}')).status,400);
  finish();await (await slow).text();
  assert.equal((await send('{"fail":true}')).status,409);
  assert.equal((await send('{"next":true}')).status,200);
  assert.equal(calls,3);
 }finally{finish();await proxy.close();}
});


test("multi-image conversation above 8 MiB reaches inference unchanged", async()=>{
  const body=JSON.stringify({messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+'A'.repeat(9*1024*1024)}}]}]});
  let received;
  const proxy=await createGet3wInferenceProxy({userId:'u',auth:{inference:async input=>{received=input.body;return {response:Response.json({choices:[]}),release:()=>{}};}}});
  try {
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body});
    assert.equal(response.status,200); await response.text();
    assert.equal(received.toString(),body);
  } finally {await proxy.close();}
});


test("oversized media conversation is rejected before cloud submission", async()=>{
  let calls=0;
  const proxy=await createGet3wInferenceProxy({userId:'u',auth:{inference:async()=>{calls++;return {response:Response.json({}),release:()=>{}};}}});
  try {
    const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${proxy.apiKey}`},body:'A'.repeat(32*1024*1024+1)});
    assert.equal(response.status,413);assert.equal(calls,0);
  } finally {await proxy.close();}
});

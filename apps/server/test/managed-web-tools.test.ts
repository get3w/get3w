import { z } from "zod";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { managedWebExecute } from "../src/opencode-plugins/managed-web-tools.js";

test("managed tools require permission before dispatch and preserve sources", async () => {
  let requests = 0;
  let allowed = false;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(allowed, true);
    assert.equal(req.headers.authorization, "Bearer local-only");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({request_id:"req_test",provider:"bocha",results:[{url:"https://example.com/",title:"Source",content:"Evidence"}]}));
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const context = {
    location: {directory:"/isolated/workspace"},
    options: {url:`http://127.0.0.1:${address.port}`,token:"local-only"},
    permission: {async assert() {if (!allowed) throw Error("Denied");}},
  };
  const call = {signal:new AbortController().signal,sessionID:"session",messageID:"message",id:"tool"};
  try {
    const execute = managedWebExecute(context,"search");
    await assert.rejects(execute({query:"test"},call),/Denied/);
    assert.equal(requests,0);
    allowed = true;
    const result = await execute({query:"test"},call);
    assert.match(result.content[0].text,/URL: https:\/\/example.com\//);
    assert.match(result.content[0].text,/Evidence/);
    assert.deepEqual(z.object({provider:z.string(),results:z.array(z.object({url:z.string(),time:z.object({published:z.number().optional()})}))}).parse(result.output).results[0].time,{});
    assert.equal(requests,1);
    await assert.rejects(execute({query:" "},call));
    assert.equal(requests,1);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});


test("managed tools preserve actionable bridge errors",async()=>{
 const server=createServer((_req,res)=>{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'no_available_provider'}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address==='object');
 try {
  const execute=managedWebExecute({location:{directory:'/isolated'},options:{url:`http://127.0.0.1:${address.port}`,token:'test'},permission:{async assert(){}}},'search');
  await assert.rejects(execute({query:'test'},{signal:new AbortController().signal,sessionID:'s',messageID:'m',id:'c'}),/no_available_provider/);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("managed fetch returns the engine output contract for every format",async()=>{
 const saved={id:'host-observation',sha256:'digest',started_at:10,observed_at:20};
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({request_id:'req_fetch',provider:'deepseek',url:'https://example.com/',content:'Example <script>alert(1)</script>',observation:saved}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address==='object');
 try {
  const execute=managedWebExecute({location:{directory:'/isolated'},options:{url:`http://127.0.0.1:${address.port}`,token:'test'},permission:{async assert(){}}},'fetch');
  for (const format of ['markdown','text','html']) {
   const before=Date.now();
   const result=await execute({url:'https://example.com/',format},{signal:new AbortController().signal,sessionID:'s',messageID:'m',id:'c'});
   const output=z.object({url:z.string(),contentType:z.string(),format:z.string(),output:z.string()}).parse(result.output);
   const observation=z.object({call_id:z.string(),started_at:z.number(),observed_at:z.number()}).parse(result.metadata);
   assert.equal(observation.call_id,'c');assert.ok(observation.started_at>=before);assert.ok(observation.observed_at>=observation.started_at);assert.ok(observation.observed_at<=Date.now());
   assert.equal(output.format,format);assert.equal(output.output,result.content[1].text);
   assert.equal(result.content[0]?.text,`Host observation: ${JSON.stringify(saved)}`);
   assert.deepEqual(result.metadata?.observation,saved);
   assert.equal(output.contentType,format==='html'?'text/html':format==='text'?'text/plain':'text/markdown');
   if(format==='html')assert.ok(!output.output.includes('<script>'));
  }
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

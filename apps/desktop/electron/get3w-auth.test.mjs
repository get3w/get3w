import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGet3wAuth } from "./get3w-auth.mjs";

async function fixture() {
  const userData = await mkdtemp(path.join(os.tmpdir(), "openwork-auth-"));
  let available = true, approved = false, revoked = false, offline = false, time = 0, refreshes = 0, origin;
  const calls = [], urls = [];
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async s => Buffer.from(s).map(b => b ^ 0x53),
    decryptStringAsync: async b => ({ result: Buffer.from(b).map(b => b ^ 0x53).toString() }),
    getSelectedStorageBackend: () => "keychain",
  };
  const deps = { userData, safeStorage, now: () => time, openExternal: async u => urls.push(u), fetchImpl: async (url, options) => {
    if (offline) throw new Error("network secret must not appear");
    const op = url.split("/").at(-1), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ op, body });
    if (op === "requests") { origin = body; return Response.json({request_id:"request-handle",expires_in:300}); }
    if (op === "exchange") {
      assert.equal(body.state, origin.state);
      return Response.json(approved ? {status:"authorized",access_token:"access-secret",refresh_token:"refresh-secret",expires_in:600} : {status:"pending"});
    }
    if (op === "refresh") { refreshes++; return revoked ? Response.json({}, {status:401}) : Response.json({access_token:"new-access",refresh_token:"new-refresh",expires_in:600}); }
    if (op === "capabilities") return Response.json({contract_version:"personal-account-v1"});
    if (op === "me") return revoked ? Response.json({}, {status:401}) : Response.json({user:{id:"u",name:"Test"}});
    return Response.json({ok:true});
  }};
  return { userData, deps, calls, urls, set: values => {
    if ("available" in values) available=values.available;
    if ("approved" in values) approved=values.approved;
    if ("revoked" in values) revoked=values.revoked;
    if ("offline" in values) offline=values.offline;
    if ("time" in values) time=values.time;
  }, refreshes:()=>refreshes, cleanup:()=>rm(userData,{recursive:true,force:true}) };
}

test("a server missing desktop auth reports HTTP 404 before opening a browser", async () => {
  const h = await fixture();
  try {
    const auth = createGet3wAuth({ ...h.deps, fetchImpl: async () => Response.json({ message: "private server details" }, { status: 404 }) });
    await assert.rejects(auth.begin(), /desktop account endpoint \(HTTP 404\)/);
    assert.equal(h.urls.length, 0);
    assert.equal((await readdir(h.userData)).length, 0);
  } finally { await h.cleanup(); }
});

test("PKCE stays in main, ciphertext persists, restart and concurrent refresh serialize, logout revokes", async()=>{
  const h=await fixture();
  try {
    const auth=createGet3wAuth(h.deps);
    assert.equal((await auth.status()).status,"signed_out");
    await auth.begin();
    assert.equal(new URL(h.urls[0]).origin,"https://get3w.com");
    assert.ok(!h.urls[0].includes("secret"));
    assert.equal((await auth.poll()).pending,true);
    h.set({approved:true});
    const result=await auth.poll();
    assert.equal(result.user.id,"u");
    assert.ok(!JSON.stringify(result).includes("secret"));
    const data=await readFile(path.join(h.userData,"get3w-session.enc"));
    assert.ok(!data.toString().includes("refresh-secret"));
    h.set({time:600_001});
    const restarted=createGet3wAuth(h.deps);
    await Promise.all([restarted.status(),restarted.status()]);
    assert.equal(h.refreshes(),1);
    await restarted.logout();
    assert.ok(h.calls.some(c=>c.op==="logout"));
    assert.equal((await readdir(h.userData)).length,0);
  } finally {await h.cleanup();}
});

test("offline retains session, revoked clears it, secure-storage failure never falls back to plaintext",async()=>{
  const h=await fixture();
  try {
    const auth=createGet3wAuth(h.deps);
    h.set({available:false}); await assert.rejects(auth.begin(),/Secure storage/);
    assert.equal(h.calls.length,0);
    h.set({available:true,approved:true});await auth.begin();await auth.poll();
    h.set({offline:true});
    assert.equal((await auth.status()).status,"unavailable");
    await assert.rejects(auth.logout(),/unavailable/);
    assert.equal((await readdir(h.userData)).length,1);
    h.set({offline:false,revoked:true});
    assert.equal((await auth.status()).status,"signed_out");
    assert.equal((await readdir(h.userData)).length,0);
  }finally {await h.cleanup();}
});

test("cancel and expiry cannot promote a late response; untrusted service origins rejected",async()=>{
  const h=await fixture();
  try {
    assert.throws(()=>createGet3wAuth({...h.deps,cloudBase:"http://evil.invalid"}),/origin/);
    const auth=createGet3wAuth(h.deps);await auth.begin();await auth.cancel();
    h.set({approved:true});assert.equal((await auth.poll()).status,"signed_out");
    await auth.begin();h.set({time:301_000});
    assert.match((await auth.poll()).error,/expired/);
    assert.equal(h.calls.filter(c=>c.op==="cancel").length,2);
  }finally {await h.cleanup();}
});


test("stale keychain sessions are cleared quietly and require a new sign-in", async()=>{
  const h=await fixture();
  try {
    const first=createGet3wAuth(h.deps);
    h.set({approved:true}); await first.begin(); await first.poll();
    h.set({available:false});
    const restarted=createGet3wAuth(h.deps);
    assert.equal((await restarted.status()).status,"signed_out");
    h.set({available:true});
    assert.equal((await restarted.status()).status,"signed_out");
    const second=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith("/me")) return Response.json({user:{id:"other",name:"Other test"}});
      return h.deps.fetchImpl(url,options);
    }});
    await second.begin();
    assert.equal((await second.poll()).user.id,"other");
    assert.equal((await second.logout()).user,null);
  }finally {await h.cleanup();}
});


test("encryption failure revokes the grant and leaves a durable actionable error",async()=>{
  const h=await fixture();
  try {
    h.set({approved:true});
    const auth=createGet3wAuth({...h.deps,safeStorage:{...h.deps.safeStorage,encryptStringAsync:async()=>{throw new Error("private keychain detail")}}});
    await auth.begin();
    const failed=await auth.poll();
    assert.equal(failed.pending,false);
    assert.match(failed.error,/Could not encrypt/);
    assert.ok(!JSON.stringify(failed).includes("private"));
    assert.equal((await auth.status()).error,failed.error);
    assert.ok(h.calls.some(c=>c.op==="logout"));
    assert.equal((await readdir(h.userData)).length,0);
  }finally {await h.cleanup();}
});


test("settings require current native identity, reject secrets, refresh and surface conflicts",async()=>{
  const h=await fixture();
  try {
    const sent=[];
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/settings')) {
        sent.push(options);
        return options.method==='PUT' ? Response.json({}, {status:409}) : Response.json({schema_version:1,revision:1,preferences:{showThinking:true}});
      }
      return h.deps.fetchImpl(url,options);
    }});
    await assert.rejects(auth.settings({userId:'u'}),/Sign in/);
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.settings({userId:'other'}),/Account changed/);
    await assert.rejects(auth.settings({userId:'u',value:{schema_version:1,revision:0,preferences:{apiKey:'private'}}}),/Invalid settings/);
    assert.equal((await auth.settings({userId:'u'})).revision,1);
    assert.equal(sent[0].headers.Authorization,'Bearer access-secret');
    await assert.rejects(auth.settings({userId:'u',value:{schema_version:1,revision:0,preferences:{showThinking:true}}}),/another device/);
    await auth.logout();await assert.rejects(auth.settings({userId:'u'}),/Sign in/);
    assert.equal(sent.length,2);
  }finally {await h.cleanup();}
});

test("balance checks account identity and preserves exact values without forwarding extra fields",async()=>{
  const h=await fixture();let amount='123.456789',calls=0;
  try {
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/balance')){calls++;return Response.json({balance:{amount,currency:'CNY',secret:'private'}});}
      return h.deps.fetchImpl(url,options);
    }});
    await assert.rejects(auth.balance({userId:'u'}),/Sign in/);
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.balance({userId:'other'}),/current/);assert.equal(calls,0);
    assert.deepEqual(await auth.balance({userId:'u'}),{balance:{amount:'123.456789',currency:'CNY'}});
    amount='NaN';await assert.rejects(auth.balance({userId:'u'}),/verified/);
    await auth.logout();await assert.rejects(auth.balance({userId:'u'}),/Sign in/);
  }finally{await h.cleanup();}
});

test("model discovery stays on native endpoint and exposes only catalog metadata",async()=>{
  const h=await fixture();let invalid=false,calls=0;
  try {
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/models')) {
        assert.equal(new URL(url).pathname,'/v1/inference/models');
        assert.equal(options.headers.Authorization,'Bearer access-secret');calls++;
        return Response.json({object:'list',data:[{id:'qwen3.6-flash',owned_by:'alibaba',protocols:[invalid?'unknown':'openai'],secret:'private'}]});
      }
      return h.deps.fetchImpl(url,options);
    }});
    await assert.rejects(auth.models({userId:'u'}),/Sign in/);
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.models({userId:'other'}),/current/);assert.equal(calls,0);
    assert.deepEqual(await auth.models({userId:'u'}),{models:[{id:'qwen3.6-flash',owned_by:'alibaba',protocols:['openai'],input_modalities:['text']}]});
    invalid=true;await assert.rejects(auth.models({userId:'u'}),/verified/);
    await auth.logout();await assert.rejects(auth.models({userId:'u'}),/Sign in/);
  }finally{await h.cleanup();}
});

test("main-only inference is scoped, never retries completions, and aborts on logout",async()=>{
  const h=await fixture();let signal,calls=0;
  try {
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/chat/completions')) {
        calls++;signal=options.signal;
        assert.equal(options.headers.Authorization,'Bearer access-secret');
        assert.equal(new URL(url).pathname,'/v1/inference/chat/completions');
        return new Response('quota',{status:402});
      }
      return h.deps.fetchImpl(url,options);
    }});
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.inference({userId:'u',route:'settings'}),/Unsupported/);
    await assert.rejects(auth.inference({userId:'other',route:'chat/completions',body:'{}'}),/current/);
    const result=await auth.inference({userId:'u',route:'chat/completions',body:'{}'});
    assert.equal(result.response.status,402);assert.equal(calls,1);
    assert.equal(signal.aborted,false);
    await auth.logout();assert.equal(signal.aborted,true);result.release();
    await assert.rejects(auth.inference({userId:'u',route:'chat/completions',body:'{}'}),/current/);
    assert.equal(calls,1);
  }finally{await h.cleanup();}
});

test("main-only MCP binds identity, filters headers and aborts on logout",async()=>{
 const h=await fixture();let options,calls=0;
 const original=h.deps.fetchImpl;
 h.deps.cloudBase='http://127.0.0.1:6605';
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/v1/gateway/mcp')){calls++;options=input;assert.equal(url,'http://127.0.0.1:6605/v1/gateway/mcp');return Response.json({ok:true});}
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();
  const response=await auth.mcp({userId:'u',sessionId:'host-session-123456',method:'POST',body:Buffer.from('{}'),headers:{authorization:'evil','x-openwork-organization':'evil','x-get3w-session-id':'agent-forged','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'}});
  assert.equal(options.headers.Authorization,'Bearer access-secret');
  assert.equal(options.headers['X-Get3W-Organization'],undefined);assert.equal(options.headers.authorization,undefined);
  assert.equal(options.headers['mcp-protocol-version'],'2025-03-26');assert.equal(options.redirect,'error');
  await auth.logout();assert.equal(options.signal.aborted,true);
  response.release();
  await assert.rejects(auth.mcp({userId:'wrong',method:'POST'}),/account changed/);
  assert.equal(calls,1);
  assert.equal(options.headers['X-Get3W-Session-Id'],'host-session-123456');
  assert.ok(!JSON.stringify(await auth.status()).includes('access-secret'));
 }finally{await h.cleanup();}
});

test('personal usage rejects limit actions and derives billing identity from bearer',async()=>{
 const h=await fixture();
 try{
  h.set({approved:true});
  const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>url.endsWith('/personal/usage')?Response.json({billing:'personal',items:[],next_cursor:null}):h.deps.fetchImpl(url,options)});
  await auth.begin();await auth.poll();
  assert.deepEqual(await auth.modelUsage({userId:'u',action:'read'}),{billing:'personal',items:[],next_cursor:null});
  await assert.rejects(auth.modelUsage({userId:'u',action:'limit'}),/Invalid personal/);
 }finally{await h.cleanup();}
});

test("inference reuses unexpired identity while server revocation remains authoritative",async()=>{
 const h=await fixture();let identityCalls=0,inferenceCalls=0;
 try {
  const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
   if(url.endsWith('/me'))identityCalls++;
   if(url.endsWith('/inference/chat/completions')){inferenceCalls++;return new Response('revoked',{status:401});}
   return h.deps.fetchImpl(url,options);
  }});
  h.set({approved:true});await auth.begin();await auth.poll();
  const before=identityCalls;
  const result=await auth.inference({userId:'u',route:'chat/completions',body:'{}'});
  assert.equal(identityCalls,before);assert.equal(inferenceCalls,1);
  assert.equal(result.response.status,401);result.release();
 }finally{await h.cleanup();}
});

test('offline task catalog requires verified personal identity and never makes requests', async()=>{
 const h=await fixture();
 let denied=false, calls=0;
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'a',name:'A',role:'owner'}]});
  if(url.endsWith('/personal/models')){
   calls++;
   if(denied)return new Response(null,{status:403});
   return Response.json({catalog_version:'v1',models:[{model_id:'p/m/new',type:'new',category:'other',run_type_title:'New',catalog_version:'v1',api_schema:{}}]}, {headers:{etag:'"v1"'}});
  }
  return h.deps.fetchImpl(url,options);
 };
 try{
  h.set({approved:true});const auth=createGet3wAuth({...h.deps,fetchImpl});
  await assert.rejects(auth.taskCatalog({userId:'u',offline:true}),/Verify/);
  await auth.begin();await auth.poll();

  await auth.taskCatalog({userId:'u'});
  h.set({offline:true});const before=h.calls.length;
  const result=await auth.taskCatalog({userId:'u',offline:true});
  assert.equal(result.offline,true);assert.equal(result.executionAllowed,false);
  assert.equal(h.calls.length,before);assert.equal(calls,1);
  await assert.rejects(auth.taskCatalog({userId:'other',offline:true}),/Verify/);
  await assert.rejects(auth.taskCatalog({userId:'u',organizationId:'other',offline:true}),/Invalid/);
  const restarted=createGet3wAuth({...h.deps,fetchImpl});
  await assert.rejects(restarted.taskCatalog({userId:'u',offline:true}),/Verify/);
  h.set({offline:false});denied=true;
  await assert.rejects(auth.taskCatalog({userId:'u',refresh:true}),/unavailable/);
  await assert.rejects(auth.taskCatalog({userId:'u',offline:true}));
 }finally{await h.cleanup();}
});

test('task catalog IPC rejects malformed input before network or cache access', async()=>{
 const h=await fixture();
 try{
  const auth=createGet3wAuth(h.deps);
  for(const input of [null,[],{}, {userId:'u',organizationId:'a',offline:'true'},
   {userId:'u',organizationId:'a',token:'injected'}, {userId:'u',organizationId:''}]){
   await assert.rejects(auth.taskCatalog(input),/Invalid personal model catalog request/);
  }
  assert.equal(h.calls.length,0);
 }finally{await h.cleanup();}
});

test('artifact bridge keeps native credentials in main and requires a personal identity',async()=>{
 const h=await fixture();let active=true;const forwarded=[];
 const fetchImpl=async(url,options)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:active?[{organization_id:'a',name:'A',role:'owner'}]:[]});
  if(url.endsWith('/personal/apps')){forwarded.push({url,options});return Response.json({enabled:true,items:[]});}
  return h.deps.fetchImpl(url,options);
 };
 try{
  h.set({approved:true});const auth=createGet3wAuth({...h.deps,fetchImpl});
  await auth.begin();await auth.poll();
  const input={userId:'u',method:'GET',path:'/v1/apps'};
  const identityReads = h.calls.filter(call => call.op === 'me').length;
  assert.deepEqual(await auth.artifacts(input),{ok:true,status:200,json:{enabled:true,items:[]}});
  assert.equal(h.calls.filter(call => call.op === 'me').length - identityReads, 1);
  assert.match(forwarded[0].url,/\/v1\/personal\/apps$/);
  assert.equal(forwarded[0].options.headers.Authorization,'Bearer access-secret');
  assert.equal(forwarded[0].options.redirect,'error');
  await assert.rejects(auth.artifacts({...input,userId:'other'}),/changed/);
  await assert.rejects(auth.artifacts({...input,path:'/v1/me'}),/Invalid/);
  await auth.logout();await assert.rejects(auth.artifacts(input),/changed/);
  assert.equal(forwarded.length,1);
 }finally{await h.cleanup();}
});


test('personal capability outages remain retryable and do not imply a server upgrade', async () => {
 const h = await fixture();
 let status = 503, version = 'personal-account-v1';
 try {
  h.set({approved:true});
  const auth = createGet3wAuth({...h.deps, fetchImpl:async (url, options) => {
   if (url.endsWith('/personal/capabilities')) return Response.json({contract_version:version}, {status});
   if (url.endsWith('/personal/usage')) return Response.json({billing:'personal',items:[],next_cursor:null});
   return h.deps.fetchImpl(url, options);
  }});
  await auth.begin(); await auth.poll();
  await assert.rejects(auth.modelUsage({userId:'u',action:'read'}), /service is unavailable. Try again/);
  status = 401;
  await assert.rejects(auth.modelUsage({userId:'u',action:'read'}), /Session expired/);
  status = 200; version = 'unsupported';
  await assert.rejects(auth.modelUsage({userId:'u',action:'read'}), /Update the Get3W server/);
  version = 'personal-account-v1';
  assert.equal((await auth.modelUsage({userId:'u',action:'read'})).billing, 'personal');
 } finally { await h.cleanup(); }
});

test("definitive submission conflicts preserve a correction instead of a connection error",async()=>{
 const h=await fixture();
 try {
  const auth=createGet3wAuth({...h.deps,fetchImpl:(url,options)=>url.endsWith('/tasks')
   ? Promise.resolve(Response.json({error:{code:'idempotency_conflict'}},{status:409})) : h.deps.fetchImpl(url,options)});
  await auth.begin();h.set({approved:true});await auth.poll();
  await assert.rejects(auth.submitPersonal({userId:'u',arguments:{slug:'p/m/run',inputs:{},quote_id:'q',idempotency_key:'k',session_id:'session'}}),error=>error.definitive===true && error.code==='idempotency_conflict' && /new key unique/.test(error.message));
 }finally{await h.cleanup();}
});

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
    const data=await readFile(path.join(h.userData,"openwork-session.enc"));
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
    assert.throws(()=>createGet3wAuth({...h.deps,apiBase:"http://evil.invalid"}),/origin/);
    const auth=createGet3wAuth(h.deps);await auth.begin();await auth.cancel();
    h.set({approved:true});assert.equal((await auth.poll()).status,"signed_out");
    await auth.begin();h.set({time:301_000});
    assert.match((await auth.poll()).error,/expired/);
    assert.equal(h.calls.filter(c=>c.op==="cancel").length,2);
  }finally {await h.cleanup();}
});


test("switching accounts clears identity; keychain restoration can retry", async()=>{
  const h=await fixture();
  try {
    const first=createGet3wAuth(h.deps);
    h.set({approved:true}); await first.begin(); await first.poll();
    h.set({available:false});
    const restarted=createGet3wAuth(h.deps);
    assert.equal((await restarted.status()).status,"unavailable");
    h.set({available:true});
    assert.equal((await restarted.status()).user.id,"u");
    assert.equal((await restarted.logout()).user,null);
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

test("organization selection checks live membership, role changes and logout",async()=>{
  const h=await fixture();let role='admin',exists=true;
  try {
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/organizations'))return Response.json({organizations:exists?[{organization_id:'org',name:'Test',role}]:[]});
      if(url.endsWith('/members'))return role==='admin'?Response.json({organization_id:"org",members:[]}):Response.json({}, {status:403});
      return h.deps.fetchImpl(url,options);
    }});
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.organizations({userId:'other'}),/Account changed/);
    assert.equal((await auth.organizations({userId:'u',organizationId:'org'})).selectedOrganization.role,'admin');
    assert.deepEqual((await auth.members({userId:'u'})).members,[]);
    role='viewer';assert.equal((await auth.organizations({userId:'u'})).selectedOrganization,null);
    exists=false;await assert.rejects(auth.organizations({userId:'u',organizationId:'org'}),/access changed/);
    await auth.logout();assert.equal((await auth.status()).organization,null);
  }finally{await h.cleanup();}
});

test("organization payloads are projected and member reads reject changed permissions",async()=>{
  const h=await fixture();let payload={organizations:[{organization_id:'org',name:'Test',role:'admin',secret:'private'}]};
  try {
    const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
      if(url.endsWith('/organizations'))return Response.json(payload);
      if(url.endsWith('/members'))throw Error('must not execute after downgrade');
      return h.deps.fetchImpl(url,options);
    }});
    h.set({approved:true});await auth.begin();await auth.poll();
    const value=await auth.organizations({userId:'u',organizationId:'org'});
    assert.ok(!JSON.stringify(value).includes('private'));
    payload.organizations[0].role='viewer';
    await assert.rejects(auth.members({userId:'u'}),/access changed/);
    payload={organizations:[{organization_id:'org',name:'Test',role:'invalid'}]};
    await assert.rejects(auth.organizations({userId:'u'}),/Invalid organization/);
    assert.equal((await auth.status()).organization,null);
  }finally{await h.cleanup();}
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
        assert.equal(new URL(url).pathname,'/desktop/v1/inference/models');
        assert.equal(options.headers.Authorization,'Bearer access-secret');calls++;
        return Response.json({object:'list',data:[{id:'qwen3.6-flash',owned_by:'alibaba',protocols:[invalid?'unknown':'openai'],secret:'private'}]});
      }
      return h.deps.fetchImpl(url,options);
    }});
    await assert.rejects(auth.models({userId:'u'}),/Sign in/);
    h.set({approved:true});await auth.begin();await auth.poll();
    await assert.rejects(auth.models({userId:'other'}),/current/);assert.equal(calls,0);
    assert.deepEqual(await auth.models({userId:'u'}),{models:[{id:'qwen3.6-flash',owned_by:'alibaba',protocols:['openai']}]});
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
        assert.equal(new URL(url).pathname,'/desktop/v1/inference/chat/completions');
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

test("member changes bind the visible organization and preserve server role denials",async()=>{
 const h=await fixture();let role='owner',status=200,writes=0;
 try {
  const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
   if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'org',name:'Test',role}]});
   if(options.method==='PATCH'){writes++;return Response.json({ok:status===200},{status});}
   return h.deps.fetchImpl(url,options);
  }});
  h.set({approved:true});await auth.begin();await auth.poll();
  await auth.organizations({userId:'u',organizationId:'org'});
  const input={userId:'u',organizationId:'org',memberId:'member',role:'viewer',active:true};
  await assert.rejects(auth.updateMember({...input,organizationId:'other'}),/Organization changed/);assert.equal(writes,0);
  status=409;await assert.rejects(auth.updateMember(input),/at least one/);
  status=403;await assert.rejects(auth.updateMember(input),/does not allow/);
  role='viewer';await assert.rejects(auth.updateMember(input),/access changed/);assert.equal(writes,2);
 }finally{await h.cleanup();}
});

test("main-only MCP binds identity and selected organization, filters headers and aborts on change",async()=>{
 const h=await fixture();let org='a',options,calls=0;
 const original=h.deps.fetchImpl;
 h.deps.gatewayBase='http://127.0.0.1:6605';
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:org,name:'Test',role:'member'}]});
  if(url.endsWith('/desktop-gateway/mcp')){calls++;options=input;assert.equal(url,'http://127.0.0.1:6605/desktop-gateway/mcp');return Response.json({ok:true});}
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();
  await assert.rejects(auth.mcp({userId:'u',organizationId:'a',method:'POST'}),/Select/);
  await auth.organizations({userId:'u',organizationId:'a'});
  const response=await auth.mcp({userId:'u',organizationId:'a',method:'POST',body:Buffer.from('{}'),headers:{authorization:'evil','x-openwork-organization':'evil',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'}});
  assert.equal(options.headers.Authorization,'Bearer access-secret');
  assert.equal(options.headers['X-Get3W-Organization'],'a');assert.equal(options.headers.authorization,undefined);
  assert.equal(options.headers['mcp-protocol-version'],'2025-03-26');assert.equal(options.redirect,'error');
  await auth.organizations({userId:'u',organizationId:null});assert.equal(options.signal.aborted,true);
  response.release();
  await assert.rejects(auth.mcp({userId:'wrong',organizationId:'a',method:'POST'}),/account changed/);
  assert.equal(calls,1);
  assert.ok(!JSON.stringify(await auth.status()).includes('access-secret'));
 }finally{await h.cleanup();}
});

test('organization creation derives identity in main and selects only a verified response',async()=>{
 const h=await fixture();const original=h.deps.fetchImpl;let created=false,body;
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/organizations')) {
   if(input.method==='POST'){body=JSON.parse(input.body);created=true;return Response.json({organization_id:'new',name:body.name,role:'owner',token:'must-not-expose'});}
   return Response.json({organizations:created?[{organization_id:'new',name:'Team',role:'owner'}]:[]});
  }
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();
  await assert.rejects(auth.createOrganization({userId:'other',name:'Team'}),/Account changed/);
  await assert.rejects(auth.createOrganization({userId:'u',name:'  '}),/organization name/);
  const result=await auth.createOrganization({userId:'u',name:' Team ',owner:'other'});
  assert.deepEqual(body,{name:'Team'});assert.equal(result.selectedOrganization.organization_id,'new');
  assert.ok(!JSON.stringify(result).includes('must-not-expose'));
 }finally{await h.cleanup();}
});

test('tool access uses selected admin identity, fixed publication and response allowlists',async()=>{
 const h=await fixture(),original=h.deps.fetchImpl;let role='owner',writes=[],malformed=false;
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'a',name:'Test',role}]});
  if(url.endsWith('/model-catalog')||input.method==='PUT'){writes.push({url,body:JSON.parse(input.body)});return Response.json({ok:true,token:'private'});}
  if(url.includes('/tool-access/'))return Response.json({organization_id:malformed?'b':'a',member_id:'u',capabilities:[{name:'models',description:'Models',granted:true,token:'private'}],next_cursor:null,token:'private'});
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();await auth.organizations({userId:'u',organizationId:'a'});
  const identity={userId:'u',organizationId:'a'};
  await assert.rejects(auth.toolAccess({...identity,organizationId:'b',action:'publish'}),/changed/);
  assert.deepEqual(await auth.toolAccess({...identity,action:'publish',handler:'evil'}),{ok:true});assert.deepEqual(writes[0].body,{});
  const result=await auth.toolAccess({...identity,action:'read',memberId:'u'});assert.ok(!JSON.stringify(result).includes('private'));
  await auth.toolAccess({...identity,action:'grant',memberId:'u',capability:'models',enabled:false,actor:'other'});assert.deepEqual(writes[1].body,{enabled:false});
  malformed=true;await assert.rejects(auth.toolAccess({...identity,action:'read',memberId:'u'}),/Invalid tool/);
  role='viewer';await assert.rejects(auth.toolAccess({...identity,action:'publish'}),/administrator/);assert.equal(writes.length,2);
 }finally{await h.cleanup();}
});

for (const provider of ['google','microsoft']) test(`connector ${provider} controls bind identity and reject unsafe authorization URLs`,async()=>{
 const h=await fixture(),original=h.deps.fetchImpl;let role='member',tamper='',calls=0;
 h.deps.gatewayBase='https://api.get3w.com';
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'a',name:'Test',role}]});
  if(url.includes('/connectors/v1/')){
   calls++;assert.equal(input.headers.Authorization,'Bearer access-secret');assert.equal(input.redirect,'error');
   if(input.method==='POST') {
    assert.equal(input.body,'{}');
    const target=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    target.search=new URLSearchParams({client_id:'test',redirect_uri:`https://api.get3w.com/connectors/oauth/${provider}/callback`,response_type:'code',scope:provider==='google'?'openid https://www.googleapis.com/auth/drive.metadata.readonly':'openid offline_access User.Read Files.Read',state:'s'.repeat(43),code_challenge:'c'.repeat(43),code_challenge_method:'S256',...(provider==='google'?{access_type:'offline',prompt:'consent'}:{})}).toString();
    if(tamper==='origin')target.hostname='evil.invalid';
    if(tamper==='callback')target.searchParams.set('redirect_uri','https://evil.invalid/callback');
    if(tamper==='duplicate')target.searchParams.append('client_id','evil');
    if(tamper==='scope')target.searchParams.set('scope','mail.read');
    if(tamper==='extra')target.searchParams.set('login_hint','private');
    return Response.json({authorization_url:target.href,token:'private'});
   }
   if(input.method==='DELETE')return Response.json({provider,connected:false,provider_consent_revoked:false,token:'private'});
   return Response.json({connectors:['google','microsoft'].map(provider=>({provider,configured:true,connected:false,token:'private'}))});
  }
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();await auth.organizations({userId:'u',organizationId:'a'});
  const identity={userId:'u',organizationId:'a'};
  await assert.rejects(auth.connectors({...identity,userId:'other',action:'status'}),/changed/);
  await assert.rejects(auth.connectors({...identity,action:'authorize',provider:'__proto__'}),/Invalid/);
  assert.equal(calls,0);
  assert.ok(!JSON.stringify(await auth.connectors({...identity,action:'status'})).includes('private'));
  assert.deepEqual(await auth.connectors({...identity,action:'authorize',provider}),{ok:true});
  const opened=h.urls.length;
  for(tamper of ['origin','callback','duplicate','scope','extra'])await assert.rejects(auth.connectors({...identity,action:'authorize',provider}),/verified connection/);
  assert.equal(h.urls.length,opened);
  assert.deepEqual(await auth.connectors({...identity,action:'disconnect',provider}),{ok:true});
  role='viewer';const before=calls;await assert.rejects(auth.connectors({...identity,action:'status'}),/membership/);assert.equal(calls,before);
 }finally{await h.cleanup();}
});

test('membership binds recipient/account/organization, projects rows and never forwards actor fields',async()=>{
 const h=await fixture(),original=h.deps.fetchImpl;let role='owner',malformed=false;const writes=[];
 const row={invitation_id:'inv_test',organization_id:'a',recipient_id:'recipient',role:'member',status:'pending',created_at:1000,expires_at:2000,token:'private'};
 h.deps.fetchImpl=async(url,input)=>{
  if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'a',name:'Test',role}]});
  if(url.includes('/invitations')||url.endsWith('/leave')||input.method==='DELETE') {
   if(input.method==='GET')return Response.json({organization_id:'a',invitations:[{...row,recipient_id:url.includes('/organizations/')?'recipient':malformed?'wrong':'u',organization_name:'Test'}],next_cursor:null});
   writes.push({url,body:input.body?JSON.parse(input.body):null});
   return Response.json(input.method==='POST'&&url.endsWith('/organizations/a/invitations')?row:{ok:true,token:'private'});
  }
  return original(url,input);
 };
 try {
  h.set({approved:true});const auth=createGet3wAuth(h.deps);await auth.begin();await auth.poll();
  assert.ok(!JSON.stringify(await auth.membership({userId:'u',action:'inbox'})).includes('private'));
  malformed=true;await assert.rejects(auth.membership({userId:'u',action:'inbox'}),/recipient/);malformed=false;
  await assert.rejects(auth.membership({userId:'other',action:'accept',invitationId:'inv_test'}),/Account changed/);
  await auth.organizations({userId:'u',organizationId:'a'});const identity={userId:'u',organizationId:'a'};
  await assert.rejects(auth.membership({...identity,organizationId:'b',action:'invite',recipientId:'recipient',role:'member'}),/Organization changed/);
  assert.deepEqual(await auth.membership({...identity,action:'invite',recipientId:'recipient',role:'member',actor:'evil'}),{ok:true});
  assert.deepEqual(writes[0].body,{recipient_id:'recipient',role:'member'});
  await auth.membership({...identity,action:'accept',invitationId:'inv_test',recipientId:'evil'});assert.deepEqual(writes[1].body,{action:'accept'});
  role='member';await assert.rejects(auth.membership({...identity,action:'remove',memberId:'someone'}),/administrator|access changed/);
  await auth.organizations({userId:'u',organizationId:'a'});
  await auth.membership({...identity,action:'leave'});assert.equal((await auth.status()).organization,null);
 }finally{await h.cleanup();}
});

test('model usage binds current organization and strips private billing fields',async()=>{
 const h=await fixture();let role='admin',malformed=false;const writes=[];
 try{
  const auth=createGet3wAuth({...h.deps,fetchImpl:async(url,options)=>{
   if(url.endsWith('/organizations'))return Response.json({organizations:[{organization_id:'a',name:'Quota test',role}]});
   if(url.includes('/model-limits/')){writes.push(JSON.parse(options.body));return Response.json({ok:true});}
   if(url.includes('/model-usage'))return Response.json({organization_id:malformed?'foreign':'a',billing:'personal',quota:{unit:'requests',period:'2026-11',organization:{limit:10,used:1,remaining:9},member:{limit:null,used:1,remaining:null}},entries:[{request_id:'r',requested_model:'openwork-auto',actual_model:'qwen3.6-flash',billing_model:null,task_id:'t',created_at:1,status:'completed',charge:null,balance_after:null,secret:'private'}],next_cursor:null,secret:'private'});
   return h.deps.fetchImpl(url,options);
  }});
  h.set({approved:true});await auth.begin();await auth.poll();await auth.organizations({userId:'u',organizationId:'a'});
  const input={userId:'u',organizationId:'a',action:'read'};
  await assert.rejects(auth.inference({userId:'u',route:'chat/completions',body:'{}'}),/Organization changed/);
  assert.ok(!JSON.stringify(await auth.modelUsage(input)).includes('private'));
  h.set({offline:true});await assert.rejects(auth.modelUsage(input),/unavailable/);h.set({offline:false});
  await assert.rejects(auth.modelUsage({...input,organizationId:'b'}),/changed/);
  await auth.modelUsage({...input,action:'limit',memberId:'*',limit:10,actor:'spoof'});assert.deepEqual(writes,[{monthly_requests:10}]);
  malformed=true;await assert.rejects(auth.modelUsage(input),/verified/);
  role='member';await assert.rejects(auth.modelUsage({...input,action:'limit',memberId:'*',limit:10}),/access changed|Administrator/);
 }finally{await h.cleanup();}
});

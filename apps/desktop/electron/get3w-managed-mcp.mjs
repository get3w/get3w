import { createModelTaskRecovery } from "./get3w-model-task-recovery.mjs";
import { createModelTaskJournal } from "./get3w-model-task-journal.mjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { connect } from "node:net";
import { createGet3wMcpProxy } from "./get3w-mcp-proxy.mjs";

export const GET3W_MCP_NAME = "get3w-account";
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,100}$/;
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k,canonical(v[k])])) : v;
const fingerprint = v => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

// Attachments are inputs, not a destination for generated deliverables. Apply
// this to restored tasks too, so retryDownload can recover older failed saves.
export function mediaOutputNaming(row) {
  const output=row.nativeMedia?.output??{};
  const attachmentPath=value=>typeof value==='string'&&['.get3w/inbox/chat-attachments/'].some(prefix=>value.replaceAll('\\','/').startsWith(prefix));
  return {taskName:output.task_name??String(row.arguments?.inputs?.prompt??"任务成果").slice(0,48),filename:output.filename??"生成结果",directory:attachmentPath(output.directory)?undefined:output.directory,sourcePath:attachmentPath(output.source_path)?undefined:output.source_path};
}

// Recovery applies only to our exact historical loopback definition. A known
// fingerprint mismatch is always a user edit, even if it has this shape.
function legacyProxyPort(value) {
  if (!value || Object.keys(value).sort().join() !== "enabled,headers,oauth,timeout,type,url"
    || value.type !== "remote" || value.enabled !== true || value.oauth !== false || value.timeout !== 600_000
    || !value.headers || Object.keys(value.headers).join() !== "Authorization"
    || !/^Bearer [A-Za-z0-9_-]{43}$/.test(value.headers.Authorization)
    || typeof value.url !== "string") return null;
  const match = value.url.match(/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/mcp$/);
  const port = match ? Number(match[1]) : 0;
  return port > 0 && port <= 65535 ? port : null;
}

function proxyIsGone(port) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = gone => { socket.destroy(); resolve(gone); };
    socket.once("connect", () => finish(false));
    socket.once("error", error => finish(error.code === "ECONNREFUSED"));
    socket.setTimeout(1000, () => finish(false));
  });
}

/** Explicit workspace connection. Only a local bearer is written to the engine. */
export function createGet3wManagedMcp({auth,userData,getServerInfo,fetchImpl=fetch,createProxy=createGet3wMcpProxy}) {
  const file=path.join(userData,"get3w-managed-mcp.json"), live=new Map();
  const journal=createModelTaskJournal({userData,limitUsd:process.env.GET3W_M1_BUDGET_USD});
  const journalFor=(userId,workspaceId,sessionId)=>({
    findTask:async(host,key)=>(await journal.list({userId,workspaceId,sessionId:host.sessionId})).find(row=>row.arguments.idempotency_key===key),
    isStopped:context=>journal.isStopped({userId,workspaceId,sessionId:context.sessionId ?? sessionId},context),
    beforeSubmit:context=>journal.beforeSubmit({userId,workspaceId,sessionId:context.quote.sessionId},context),
    notSubmitted:async context=>{
      const server=await target();
      const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(workspaceId)}/approvals/model-task/reconcile`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},body:JSON.stringify({sessionId:context.quote.sessionId,submissionKey:fingerprint([userId,context.call.arguments.idempotency_key]),quoteId:context.quote.quoteId,result:{},notSubmitted:true})});
      if(!response.ok)throw Error("Cost reservation could not be released");
    },
    releaseSubmit:context=>journal.releaseSubmit({userId,workspaceId,sessionId:context.quote.sessionId},context),
    observe:async(context,payload)=>{const scope={userId,workspaceId,sessionId:context.sessionId ?? sessionId};await journal.observe(scope,context,payload);
      const structured=payload?.result?.structuredContent;const result=structured?.result??structured;
      if(result)await globalThis.__get3wTaskLogs?.captureOutput?.(scope,[],result).catch(()=>{});
      void reconcileCosts(userId,workspaceId).catch(()=>{});
      void syncOutputs({userId,workspaceId}).catch(()=>{});},
  });
  let records,queue=Promise.resolve();
  /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.then(()=>{},()=>{});return next;};
  async function load() {
    if(records!==undefined)return;
    try{records=JSON.parse(await readFile(file,"utf8"));}
    catch(e){if(e.code!=="ENOENT")throw new Error("Could not restore Get3W connection ownership.");records={};}
  }
  async function save(){await mkdir(userData,{recursive:true});await writeFile(file+".tmp",JSON.stringify(records),{mode:0o600});await rename(file+".tmp",file);}
  async function target() {
    const info=await getServerInfo(),url=new URL(info.baseUrl||"http://invalid");
    const token=info.ownerToken||info.clientToken;
    if(!info.running||!info.hostToken||!token||url.protocol!=="http:"||url.hostname!=="127.0.0.1"||url.pathname!=="/"||url.username||url.password||url.search||url.hash)throw new Error("Start the local Get3W engine and retry.");
    return {base:url.origin,token,host:info.hostToken,scope:`${url.origin}:${info.pid}:${info.hostToken}`};
  }
  async function request(server,ws,method,body,name=GET3W_MCP_NAME) {
    const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(ws)}/mcp${method==="DELETE"?`/${name}`:""}`,{
      method,redirect:"error",signal:AbortSignal.timeout(45_000),
      headers:{Authorization:`Bearer ${server.token}`,"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok) {
      const error=Object.assign(new Error("Workspace connection could not be updated. Check workspace access."),{status:response.status});
      throw error;
    }
    return response.json();
  }
  async function requestModelApproval(server,ws,body,signal) {
    const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(ws)}/approvals/model-task`,{
      method:"POST",redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(10 * 60_000), ...(signal ? [signal] : [])]),
      headers:{Authorization:`Bearer ${server.token}`,"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},body:JSON.stringify(body),
    });
    if(!response.ok) throw new Error("Host approval is unavailable.");
    return response.json();
  }
  async function outputRequest(scope,body) {
    await verifyIdentity(scope,body.action!=="save");
    const server=await target();
    const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(scope.workspaceId)}/model-outputs`,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(150_000),
      headers:{Authorization:`Bearer ${server.token}`,"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},body:JSON.stringify(body),
    });
    if(!response.ok)throw Error("Could not access workspace output.");
    const value=await response.json();
    await verifyIdentity(scope,true);
    return value;
  }
  async function verifyIdentity(input,local=false) {
    if(local&&auth.outputIdentity){const identity=auth.outputIdentity();if(identity.userId!==input.userId)throw Error("Get3W account changed.");return;}
    const snapshot=await auth.status();
    if(snapshot.status!=="signed_in"||snapshot.user?.id!==input.userId)throw Error("Get3W account changed.");
  }
  const outputNaming=mediaOutputNaming;
  async function planOutputs(scope,row,urls){
    if(row.outputEntry?.plannedFiles?.length===urls.length)return;
    const planned=await outputRequest(scope,{action:"plan",key:row.key,urls,sessionId:row.scope.sessionId,...outputNaming(row)});
    if(planned?.plans){await journal.updateOutput(row.scope,row.key,{plannedFiles:planned.plans});row.outputEntry={...row.outputEntry,plannedFiles:planned.plans};}
  }
  const downloading=new Set();
  async function syncOutputs(scope,retry=false,onlyKey) {
    for(const row of await journal.listConnection(scope)){
      if((onlyKey&&row.key!==onlyKey)||row.status!=="completed"||row.result?.status!=="completed"||downloading.has(row.key)||(!retry&&row.outputEntry?.downloadError))continue;
      const urls=(row.result.outputs??[]).flatMap(value=>typeof value==="string"?[value]:value&&typeof value==="object"&&typeof value.url==="string"?[value.url]:[]).filter(value=>value.startsWith("https://"));
      const files=row.outputEntry?.files??[];
      if(!retry&&files.length===urls.length)continue;
      downloading.add(row.key);const downloadStarted=Date.now();
      try{
        const naming=outputNaming(row);
        await planOutputs(scope,row,urls);
        const saved=[];
        for(const url of urls)saved.push(await outputRequest(scope,{action:"save",key:row.key,url,sessionId:row.scope.sessionId,...naming}));
        await journal.updateOutput(row.scope,row.key,{files:saved,downloadError:null});
        await globalThis.__get3wTaskLogs?.captureOutput?.(row.scope,saved,row.result).catch(()=>{});
      }catch{await journal.updateOutput(row.scope,row.key,{downloadError:"Download failed. Retry or refresh the result."});}
      finally{downloading.delete(row.key);if(row.nativeMedia?.traceId)console.info("[get3w-media-timing]",JSON.stringify({traceId:row.nativeMedia.traceId,stage:"download",durationMs:Date.now()-downloadStarted}));}
    }
  }
  function approvalCallback(server, ws) {
    return async ({slug,quoteId,sessionId,signal,quote,runKey,userId,arguments:args}) => {
      if (!slug || !quoteId || signal?.aborted) return {allowed:false,reason:"A quote is required before submission."};
      const currentServer = await target();
      if(currentServer.scope !== server.scope) return {allowed:false,reason:"Local server changed. Reconnect and retry."};
      await reconcileCosts(userId,ws);
      const approval = await requestModelApproval(server, ws, {sessionId,slug,quoteId,quote,runKey,submissionKey:args?.idempotency_key?fingerprint([userId,args.idempotency_key]):undefined}, signal).catch(() => null);
      return !signal?.aborted && approval && typeof approval.allowed === "boolean" ? approval : {allowed:false,reason:"Host approval is unavailable."};
    };
  }
  async function reconcileCosts(userId,workspaceId) {
    const server=await target();
    for(const row of await journal.listConnection({userId,workspaceId})) {
      if(!row.result)continue;
      const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(workspaceId)}/approvals/model-task/reconcile`,{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},
        body:JSON.stringify({sessionId:row.scope.sessionId,submissionKey:fingerprint([userId,row.arguments.idempotency_key]),quoteId:row.quote?.quoteId,result:row.result,notSubmitted:row.status==="failed"&&!row.requestId&&["quote_expired","quote_stale","quote_mismatch"].includes(row.result?.error?.code)}),
      });
      if(!response.ok)throw Error("Cost reservation could not be reconciled");
    }
  }
  async function current(server,ws) {
    const result=await request(server,ws,"GET");
    if(!Array.isArray(result.items))throw new Error("Invalid workspace connection response.");
    const matches=result.items.filter(i=>i.name===GET3W_MCP_NAME);
    if(matches.length>1||matches.some(i=>i.source!=="config.remote"))throw new Error("A Get3W connection already exists in user configuration. Rename it before connecting.");
    const value = matches[0]?.config;
    if (value && !records[ws] && !live.has(ws)) {
      const port = legacyProxyPort(value);
      if (port && await proxyIsGone(port)) {
        // Preserve the original before replacing an orphan left by an older
        // profile/runtime DB pair. Never send its bearer to the stale endpoint.
        const backup = path.join(userData, "get3w-mcp-recovery", `${fingerprint([ws,value])}.json`);
        await mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
        await writeFile(backup, JSON.stringify({ workspaceId: ws, config: value }), { mode: 0o600, flag: "wx" })
          .catch(error => { if (error.code !== "EEXIST") throw error; });
        records[ws] = fingerprint(value);
        await save();
      }
    }
    return value;
  }
  function owned(ws,value) {
    if(value&&(!records[ws]||fingerprint(value)!==records[ws]))throw new Error("Get3W connection was edited locally. Rename it before reconnecting.");
  }
  async function stop(ws) {const old=live.get(ws);live.delete(ws);old?.recovery?.close();await old?.proxy.close();}
  async function remove(server,ws) {
    await stop(ws);
    let value;
    try {value=await current(server,ws);}
    catch(error) {if(error.status!==404)throw error;delete records[ws];await save();return;}
    owned(ws,value);
    if(value)await request(server,ws,"DELETE");
    delete records[ws];await save();
  }
  async function reconcile(snapshot) {
    await load();
    for(const [ws,entry] of live) {
      if(snapshot.status!=="signed_in"||snapshot.user?.id!==entry.userId)await stop(ws);
    }
    const stale=Object.keys(records).filter(ws=>!live.has(ws));
    if(stale.length){const server=await target();for(const ws of stale)await remove(server,ws);}
  }
  return {
    tasks:input=>serial(async()=>{
      if(!input || !["list","listAll","detach","retrieve","retryDownload","refreshResult"].includes(input.action) || !/^[-\w]{1,100}$/.test(input.workspaceId??"") || (input.action!=="listAll" && !SESSION_ID_RE.test(input.sessionId??"")))throw Error("Invalid model task scope.");
      await verifyIdentity(input,["list","listAll"].includes(input.action));
      let scope={userId:input.userId,workspaceId:input.workspaceId,sessionId:input.sessionId};
      if(input.key) {
        const original=(await journal.listConnection(scope)).find(row=>row.key===input.key && row.scope.sessionId===input.sessionId);
        if(!original)throw Error("Task not found");
        scope=original.scope;
      }
      if(input.action==="detach"){
        await journal.detach(scope,input.key);
        live.get(input.workspaceId)?.recovery?.cancel(input.key);
      }
      if(input.action==="retrieve")await journal.resume(scope,input.key);
      if(input.action==="refreshResult")await journal.refresh(scope,input.key);
      if(input.action==="retryDownload")await syncOutputs(scope,true,input.key);
      else void syncOutputs(scope).catch(()=>{});
      const rows=input.action==="listAll" ? await journal.listConnection(scope) : await journal.list(scope);
      for(const row of rows){
        if(row.status==="completed"&&!row.outputEntry?.files?.length){
          const urls=(row.result?.outputs??[]).flatMap(value=>typeof value==="string"?[value]:value&&typeof value.url==="string"?[value.url]:[]).filter(value=>value.startsWith("https://"));
          if(urls.length)try{await planOutputs(scope,row,urls);}catch{/* Download retry retains the remote result when allocation is unavailable. */}
        }
        if(!row.outputEntry?.files?.some(file=>file.fileId))continue;
        try{
          const resolved=await outputRequest(scope,{action:"resolve",files:row.outputEntry.files});
          if(Array.isArray(resolved.files)){
            row.outputEntry.files=resolved.files;
            await journal.updateOutput(row.scope,row.key,{files:resolved.files});
          }
        }catch{/* Keep last verified file locations when the local server is temporarily unavailable. */}
      }
      // Keep submission inputs in main; expose only scoped state and result outputs.
      return {items:rows.map(row=>({key:row.key,messageId:row.messageId??null,createdAt:row.createdAt,submittedAt:row.submittedAt,estimatedDuration:row.estimatedDuration,slug:row.arguments.slug,status:row.status,requestId:row.requestId,updatedAt:row.updatedAt,sessionId:row.scope.sessionId,outputs:row.result?.outputs??[],reservedUsd:row.quote?.amountUsd??null,chargedUsd:row.result?.billing?.charged?.usd??null,error:row.result?.error?{code:row.result.error.code}:null,outputEntry:row.outputEntry??null}))};
    }),
    outputs:async input=>{
      if(!input||!/^[-\w]{1,100}$/.test(input.workspaceId??"")||!["index","read"].includes(input.action))throw Error("Invalid output scope.");
      const value=await outputRequest(input,{action:input.action,path:input.path,sessionId:input.sessionId,fileId:input.fileId});
      if(input.action==="index"){
        const filename=path.join(userData,`get3w-output-index-${fingerprint([input.userId,undefined,input.workspaceId])}.json`);
        const temporary=`${filename}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary,JSON.stringify({version:1,updatedAt:Date.now(),...value}),{mode:0o600,flag:"wx"});
          await rename(temporary,filename);
        } finally {await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
      }
      return value;
    },
    run:input=>serial(async()=>{
      if(!input||!["status","enable","disable"].includes(input.action)||typeof input.workspaceId!=="string"||!/^[-\w]{1,100}$/.test(input.workspaceId))throw new Error("Select a local workspace first.");
      // Disconnect only removes our fingerprint-matched local configuration.
      // It must remain available when cloud identity checks fail.
      if(input.action==="disable") {
        await load();
        await stop(input.workspaceId);
        await remove(await target(),input.workspaceId);
        return {enabled:false,state:"disconnected"};
      }
      if(input.action==="status") {
        await load();
        if(input.sessionId!==undefined && (typeof input.sessionId!=="string" || !SESSION_ID_RE.test(input.sessionId))) throw new Error("Invalid Get3W chat session.");
        const ws=input.workspaceId;
        const liveEntry=live.get(ws);
        const rotating=liveEntry && input.sessionId!==undefined && liveEntry.sessionId!==input.sessionId;
        const identity=rotating ? await auth.status() : null;
        if (rotating && (identity.status!=="signed_in" || identity.user?.id!==liveEntry.userId)) {
          await stop(ws);
          throw new Error("Get3W account changed or is unavailable.");
        }
        if (liveEntry && input.sessionId!==undefined && liveEntry.sessionId!==input.sessionId) {
          if(input.userId!==liveEntry.userId) throw Error("Get3W account changed. Reconnect and retry.");
        }
        const server=await target(),value=await current(server,ws);
        try {owned(ws,value);}catch(error){await stop(ws);throw error;}
        if((records[ws]&&!live.has(ws))||(live.has(ws)&&(!value||live.get(ws).scope!==server.scope)))await remove(server,ws);
        const existing=live.get(ws);
        return {enabled:live.has(ws),state:live.has(ws)?"configured":"disconnected"};
      }
      const snapshot=await auth.status();
      if(snapshot.status!=="signed_in"||snapshot.user?.id!==input.userId)throw new Error("Get3W account changed or is unavailable.");
      await reconcile(snapshot);
      const ws=input.workspaceId,server=await target();
      const value=await current(server,ws);owned(ws,value);
      const existing=live.get(ws);
      const requestedSession = input.sessionId === undefined ? undefined : String(input.sessionId);
      if(requestedSession !== undefined && !SESSION_ID_RE.test(requestedSession)) throw new Error("Invalid Get3W chat session.");
      if(existing&&existing.scope===server.scope&&value) return {enabled:true,state:"configured"};
      await stop(ws);
      const proxy=await createProxy({nativeMediaDirectory:path.join(userData,"native-media",fingerprint([input.userId,ws])),workspaceId:ws,onMediaTiming:event=>console.info("[get3w-media-timing]",JSON.stringify(event)),hostToken:server.host,enforceModelGuard:true,auth,userId:input.userId,...(requestedSession ? {sessionId:requestedSession} : {}),journal:journalFor(input.userId,ws,requestedSession),approveSubmit: approvalCallback(server, ws)});
      const definition={type:"remote",url:proxy.url,headers:{Authorization:`Bearer ${proxy.token}`},oauth:false,enabled:true,timeout:10 * 60_000};
      // Persist ownership before a write whose response might be lost.
      const previous=records[ws];
      try {
        records[ws]=fingerprint(definition);await save();
        await request(server,ws,"POST",{name:GET3W_MCP_NAME,config:definition});
        await reconcileCosts(input.userId,ws);
        const recovery=createModelTaskRecovery({auth,journal,scope:{userId:input.userId,workspaceId:ws},onResult:async()=>{await reconcileCosts(input.userId,ws);await syncOutputs({userId:input.userId,workspaceId:ws});}});
        live.set(ws,{proxy,recovery,userId:input.userId,scope:server.scope,sessionId:proxy.sessionId ?? requestedSession});
        return {enabled:true,state:"configured"};
      }catch(error){
        await proxy.close();
        try {
          const actual=await current(server,ws);
          // A POST may still commit after a timeout, even when this GET is
          // empty. Keep the write-ahead fingerprint until explicit cleanup.
          if(!actual){ /* Retain pending ownership for a late commit. */ }
          else if(previous&&fingerprint(actual)===previous){records[ws]=previous;await save();}
        }catch { /* Keep recorded ownership for an explicit retry. */ }
        throw error;
      }
    }),
    reconcile:snapshot=>serial(()=>reconcile(snapshot)),
    close:()=>serial(async()=>{for(const ws of [...live.keys()])await stop(ws);}),
  };
}

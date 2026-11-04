import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { createGet3wMcpProxy } from "./get3w-mcp-proxy.mjs";

export const OPENWORK_MCP_NAME = "openwork-account";
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k,canonical(v[k])])) : v;
const fingerprint = v => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

/** Explicit workspace connection. Only a local bearer is written to the engine. */
export function createGet3wManagedMcp({auth,userData,getServerInfo,fetchImpl=fetch,createProxy=createGet3wMcpProxy}) {
  const file=path.join(userData,"openwork-managed-mcp.json"), live=new Map();
  let records,queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
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
  async function request(server,ws,method,body) {
    const response=await fetchImpl(`${server.base}/workspace/${encodeURIComponent(ws)}/mcp${method==="DELETE"?`/${OPENWORK_MCP_NAME}`:""}`,{
      method,redirect:"error",signal:AbortSignal.timeout(45_000),
      headers:{Authorization:`Bearer ${server.token}`,"X-Get3W-Host-Token":server.host,"Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    if(!response.ok)throw new Error("Workspace connection could not be updated. Check workspace access and organization policy.");
    return response.json();
  }
  async function current(server,ws) {
    const result=await request(server,ws,"GET");
    if(!Array.isArray(result.items))throw new Error("Invalid workspace connection response.");
    const matches=result.items.filter(i=>i.name===OPENWORK_MCP_NAME);
    if(matches.length>1||matches.some(i=>i.source!=="config.remote"))throw new Error("A Get3W connection already exists in user configuration. Rename it before connecting.");
    return matches[0]?.config;
  }
  function owned(ws,value) {
    if(value&&(!records[ws]||fingerprint(value)!==records[ws]))throw new Error("Get3W connection was edited locally. Rename it before reconnecting.");
  }
  async function stop(ws) {const old=live.get(ws);live.delete(ws);await old?.proxy.close();}
  async function remove(server,ws) {
    await stop(ws);
    const value=await current(server,ws);owned(ws,value);
    if(value)await request(server,ws,"DELETE");
    delete records[ws];await save();
  }
  async function reconcile(snapshot) {
    await load();
    for(const [ws,entry] of live) {
      if(snapshot.status!=="signed_in"||snapshot.user?.id!==entry.userId||snapshot.organization?.organization_id!==entry.organizationId||snapshot.organization?.role!==entry.role)await stop(ws);
    }
    const stale=Object.keys(records).filter(ws=>!live.has(ws));
    if(stale.length){const server=await target();for(const ws of stale)await remove(server,ws);}
  }
  return {
    run:input=>serial(async()=>{
      if(!input||!["status","enable","disable"].includes(input.action)||typeof input.workspaceId!=="string"||!/^[-\w]{1,100}$/.test(input.workspaceId))throw new Error("Select a local workspace first.");
      // Disconnect only removes our fingerprint-matched local configuration.
      // It must remain available when cloud identity/organization checks fail.
      if(input.action==="disable") {
        await load();
        await stop(input.workspaceId);
        await remove(await target(),input.workspaceId);
        return {enabled:false,state:"disconnected"};
      }
      if(input.action==="status") {
        await load();
        const ws=input.workspaceId,server=await target(),value=await current(server,ws);
        try {owned(ws,value);}catch(error){await stop(ws);throw error;}
        if((records[ws]&&!live.has(ws))||(live.has(ws)&&(!value||live.get(ws).scope!==server.scope)))await remove(server,ws);
        return {enabled:live.has(ws),state:live.has(ws)?"configured":"disconnected"};
      }
      const snapshot=await auth.status();
      if(snapshot.status!=="signed_in"||snapshot.user?.id!==input.userId)throw new Error("Get3W account changed or is unavailable.");
      const orgs=await auth.organizations({userId:input.userId});
      snapshot.organization=orgs.selectedOrganization;
      await reconcile(snapshot);
      const ws=input.workspaceId,server=await target();
      if(!snapshot.organization||snapshot.organization.organization_id!==input.organizationId)throw new Error("Select an available Get3W organization first.");
      const value=await current(server,ws);owned(ws,value);
      const existing=live.get(ws);
      if(existing&&existing.scope===server.scope&&value)return {enabled:true,state:"configured"};
      await stop(ws);
      const proxy=await createProxy({auth,userId:input.userId,organizationId:input.organizationId});
      const definition={type:"remote",url:proxy.url,headers:{Authorization:`Bearer ${proxy.token}`},oauth:false,enabled:true};
      // Persist ownership before a write whose response might be lost.
      const previous=records[ws];
      try {
        records[ws]=fingerprint(definition);await save();
        await request(server,ws,"POST",{name:OPENWORK_MCP_NAME,config:definition});
        live.set(ws,{proxy,userId:input.userId,organizationId:input.organizationId,role:snapshot.organization.role,scope:server.scope});
        return {enabled:true,state:"configured"};
      }catch(error){
        await proxy.close();
        try {
          const actual=await current(server,ws);
          if(!actual){delete records[ws];await save();}
          else if(previous&&fingerprint(actual)===previous){records[ws]=previous;await save();}
        }catch { /* Keep recorded ownership for an explicit retry. */ }
        throw error;
      }
    }),
    reconcile:snapshot=>serial(()=>reconcile(snapshot)),
    close:()=>serial(async()=>{for(const ws of [...live.keys()])await stop(ws);}),
  };
}

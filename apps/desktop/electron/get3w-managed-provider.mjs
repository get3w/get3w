import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { createGet3wInferenceProxy } from "./get3w-inference-proxy.mjs";

export const OPENWORK_MANAGED_PROVIDER = "openwork-account";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** Own only the exact provider definition we wrote. Never touch user providers. */
export function createGet3wManagedProvider({ auth, userData, getServerInfo, fetchImpl = fetch, createProxy = createGet3wInferenceProxy }) {
  const file = path.join(userData, "openwork-managed-provider.json");
  let record, proxy, owner, serverScope, providerState = "disconnected", queue = Promise.resolve();
  const serial = fn => { const result = queue.then(fn, fn); queue = result.catch(() => {}); return result; };
  async function load() {
    if (record !== undefined) return;
    try { record = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw new Error("Could not restore Get3W model preferences."); record = {}; }
  }
  async function save() {
    await mkdir(userData,{recursive:true});
    await writeFile(file+".tmp",JSON.stringify(record),{mode:0o600});
    await rename(file+".tmp",file);
  }
  async function server() {
    const info = await getServerInfo();
    const url = new URL(info.baseUrl || "http://invalid");
    if (!info.running || !info.hostToken || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Start the local Get3W engine and retry.");
    return { baseURL:url.origin, token:info.hostToken, clientToken:info.ownerToken || info.clientToken, scope:`${url.origin}:${info.pid}:${info.hostToken}` };
  }
  async function request(target, method, provider) {
    const response = await fetchImpl(`${target.baseURL}/runtime-config/providers`, {
      method, redirect:"error", signal:AbortSignal.timeout(90_000),
      headers:{"X-Get3W-Host-Token":target.token,"Content-Type":"application/json"},
      ...(provider ? {body:JSON.stringify({provider})} : {}),
    });
    if (!response.ok) throw new Error("Local model configuration could not be updated. Retry.");
    return response.json();
  }
  async function closeProxy() { const old=proxy;proxy=null;owner=null;serverScope=null;await old?.close(); }
  async function removeOwned(target, current) {
    if (!current) return;
    if (!record.fingerprint || fingerprint(current) !== record.fingerprint) throw new Error("Get3W account provider was edited locally. Rename it before connecting.");
    await request(target,"PATCH",{[OPENWORK_MANAGED_PROVIDER]:null});
  }
  async function reconcile(snapshot, action) {
    await load();
    const userId=snapshot.status === "signed_in" ? snapshot.user?.id : null;
    if (proxy && owner !== `${userId}:${snapshot.organization?.organization_id??""}`) await closeProxy();
    if (action === "disable") { record.enabled=false;await save();await closeProxy(); }
    if (action === "enable") {
      if (!userId) throw new Error("Sign in to Get3W before connecting models.");
      record.enabled=true;record.account=fingerprint(userId);await save();
    }
    // Preserve the preference offline, but never use an unverifiable identity.
    if (snapshot.status === "unavailable") return {enabled:Boolean(record.enabled),state:"unavailable"};
    const enabled=Boolean(userId && record.enabled && record.account===fingerprint(userId));
    if (!enabled && !record.fingerprint) return {enabled:false,state:"disconnected"};
    const target=await server();
    const current=(await request(target,"GET")).provider?.[OPENWORK_MANAGED_PROVIDER];
    if (!enabled) {
      await closeProxy();await removeOwned(target,current);
      record={};await save();return {enabled:false,state:"disconnected"};
    }
    if (current && (!record.fingerprint || fingerprint(current)!==record.fingerprint)) throw new Error("Get3W account provider was edited locally. Rename it before connecting.");
    if (proxy && owner===`${userId}:${snapshot.organization?.organization_id??""}` && serverScope===target.scope && current) return {enabled:true,state:providerState};
    const policy = await fetchImpl(`${target.baseURL}/managed-policy/evaluate`, {
      method:"POST", redirect:"error", signal:AbortSignal.timeout(15_000),
      headers:{"Content-Type":"application/json", "X-Get3W-Host-Token":target.token,
        ...(target.clientToken ? {Authorization:`Bearer ${target.clientToken}`} : {})},
      body:JSON.stringify({action:"provider",input:{providerIDs:[OPENWORK_MANAGED_PROVIDER]}}),
    });
    if (!policy.ok) { await closeProxy();throw new Error("Get3W account models are blocked or the organization policy could not be verified."); }
    await closeProxy();
    const catalog=await auth.models({userId});
    const models=Object.fromEntries(catalog.models.filter(model=>model.protocols.includes("openai")).map(model=>[model.id,{name:`Get3W ${model.id}`,tool_call:true}]));
    if (!Object.keys(models).length) throw new Error("No Get3W models are available. Retry later.");
    proxy=await createProxy({auth,userId,organizationId:snapshot.organization?.organization_id});owner=`${userId}:${snapshot.organization?.organization_id??""}`;serverScope=target.scope;
    const definition={name:"Get3W account",npm:"@ai-sdk/openai-compatible",options:{baseURL:proxy.baseURL,apiKey:proxy.apiKey},models};
    const previous=record.fingerprint;
    // Write ownership first so a timeout after the server applies the patch is recoverable.
    record.fingerprint=fingerprint(definition);await save();
    try {
      const result=await request(target,"PATCH",{[OPENWORK_MANAGED_PROVIDER]:definition});
      providerState=result.reload==="deferred"?"pending":"connected";
      return {enabled:true,state:providerState};
    } catch(error) {
      await closeProxy();
      const actual=(await request(target,"GET")).provider?.[OPENWORK_MANAGED_PROVIDER];
      if (actual && fingerprint(actual)===previous) {record.fingerprint=previous;await save();}
      throw error;
    }
  }
  return {
    run: input => serial(async()=>{
      if (!input || !["enable","disable","status"].includes(input.action)) throw new Error("Invalid model action");
      const snapshot=await auth.status();
      if (snapshot.user?.id !== input.userId) throw new Error("Account changed. Reopen account settings.");
      return reconcile(snapshot,input.action);
    }),
    reconcile: snapshot => serial(()=>reconcile(snapshot)),
    close: () => serial(closeProxy),
  };
}

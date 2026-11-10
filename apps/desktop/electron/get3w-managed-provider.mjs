import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { migrateGet3wStateFile } from "./get3w-state-file.mjs";
import { createGet3wInferenceProxy } from "./get3w-inference-proxy.mjs";
import { get3wModelName } from "./get3w-model-name.mjs";

export const GET3W_MANAGED_PROVIDER = "get3w-account";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** Own only the exact provider definition we wrote. Never touch user providers. */
export function createGet3wManagedProvider({ auth, userData, getServerInfo, fetchImpl = fetch, createProxy = createGet3wInferenceProxy }) {
  const file = path.join(userData, "get3w-managed-provider.json");
  let record, proxy, owner, serverScope, providerState = "disconnected", queue = Promise.resolve();
  const serial = fn => { const result = queue.then(fn, fn); queue = result.catch(() => {}); return result; };
  async function load() {
    if (record !== undefined) return;
    await migrateGet3wStateFile(userData, "get3w-managed-provider.json", "openwork-managed-provider.json");
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
    await request(target,"PATCH",{[GET3W_MANAGED_PROVIDER]:null});
  }
  async function reconcile(snapshot, action) {
    await load();
    const userId=snapshot.status === "signed_in" ? snapshot.user?.id : null;
    if (proxy && owner !== `${userId}:personal`) await closeProxy();
    if (action === "disable") throw new Error("Get3W Models are enabled automatically while signed in. Sign out to disconnect.");
    if (action === "enable" && !userId) throw new Error("Sign in to Get3W to use models.");
    // Never use an identity that could not be verified. Reconnect on the next status check.
    if (snapshot.status === "unavailable") return {enabled:Boolean(record.enabled),state:"unavailable"};
    const enabled=Boolean(userId);
    if (enabled && (!record.enabled || record.account !== fingerprint(userId))) {
      record.enabled=true;record.account=fingerprint(userId);await save();
    }
    if (!enabled && !record.fingerprint) return {enabled:false,state:"disconnected"};
    const target=await server();
    const providers=(await request(target,"GET")).provider ?? {};
    const legacy=providers['openwork-account'];
    // Only the fingerprint we previously wrote authorizes renaming an old id.
    // Persist it separately so a lost PATCH response can be retried safely.
    if (legacy) {
      if (fingerprint(legacy) !== (record.legacyFingerprint || record.fingerprint)) throw new Error("Legacy Get3W provider was edited locally. Rename it before connecting.");
      record.legacyFingerprint=fingerprint(legacy);await save();
    }
    const current=providers[GET3W_MANAGED_PROVIDER];
    if (!enabled) {
      await closeProxy();await removeOwned(target,current);
      if (legacy) await request(target,"PATCH",{"openwork-account":null});
      record={};await save();return {enabled:false,state:"disconnected"};
    }
    if (current && (!record.fingerprint || fingerprint(current)!==record.fingerprint)) throw new Error("Get3W account provider was edited locally. Rename it before connecting.");
    const labelsCurrent = current?.name === "Get3W Models" && current?.models && Object.entries(current.models).every(([id, model]) => model.name === get3wModelName(id));
    if (!legacy && proxy && owner===`${userId}:personal` && serverScope===target.scope && current && labelsCurrent) {
      // A provider definition survives app restarts, but its loopback proxy does
      // not. Probe the live loopback endpoint before reusing it; a stale port
      // otherwise surfaces as the vague “couldn\'t reach the model provider”.
      if (!current.options?.baseURL || current.options.baseURL !== proxy.baseURL) {
        await closeProxy();
      } else if (fetchImpl !== fetch) {
        return {enabled:true,state:providerState};
      } else {
        try {
          const probe = await fetchImpl(`${proxy.baseURL}/models`, {
            method: "GET", redirect: "error", signal: AbortSignal.timeout(2_000),
            headers: { Authorization: `Bearer ${proxy.apiKey}` },
          });
          if (probe.ok) return {enabled:true,state:providerState};
        } catch {}
        await closeProxy();
      }
    }
    await closeProxy();
    let models;
    try {
      const catalog=await auth.models({userId});
      models=Object.fromEntries(catalog.models.filter(model=>model.protocols.includes("openai")).map(model=>[model.id,{name:get3wModelName(model.id),tool_call:true,attachment:model.input_modalities?.includes("image") ?? false,modalities:{input:model.input_modalities ?? ["text"],output:["text"]}}]));
      if (!Object.keys(models).length) throw new Error("No Get3W models are available. Retry later.");
    } catch (error) {
      // The previous identity's proxy is closed. Do not leave its dead URL in
      // the engine, where an access denial becomes endless retries.
      await removeOwned(target,current);
      providerState="unavailable";
      throw error;
    }
    proxy=await createProxy({auth,userId});owner=`${userId}:personal`;serverScope=target.scope;
    const definition={name:"Get3W Models",npm:"@ai-sdk/openai-compatible",options:{baseURL:proxy.baseURL,apiKey:proxy.apiKey},models};
    const previous=record.fingerprint;
    // Write ownership first so a timeout after the server applies the patch is recoverable.
    record.fingerprint=fingerprint(definition);await save();
    try {
      const result=await request(target,"PATCH",{[GET3W_MANAGED_PROVIDER]:definition,...(legacy ? {"openwork-account":null} : {})});
      delete record.legacyFingerprint;await save();
      providerState=result.reload==="deferred"?"pending":"connected";
      return {enabled:true,state:providerState};
    } catch(error) {
      await closeProxy();
      const actual=(await request(target,"GET")).provider?.[GET3W_MANAGED_PROVIDER];
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

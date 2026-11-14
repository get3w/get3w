import { automationRoute } from "./get3w-automation-route.mjs";
import { artifactRoute } from "./get3w-artifact-route.mjs";
import { createTaskCatalogCache } from "./get3w-task-catalog.mjs";
import { GET3W_SERVICES, validateGet3wOrigin } from "./get3w-services.mjs";
import { createGet3wSession } from "./get3w-session.mjs";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";

/** @param {{userData:string,safeStorage:object,openExternal:Function,cloudBase?:string,webBase?:string,fetchImpl?:typeof fetch,now?:()=>number}} options */
export function createGet3wAuth({ userData, safeStorage, openExternal, cloudBase = GET3W_SERVICES.cloudBase, webBase = GET3W_SERVICES.webBase, fetchImpl = fetch, now = Date.now }) {
  cloudBase = validateGet3wOrigin(cloudBase);
  webBase = validateGet3wOrigin(webBase);
  const taskCatalogCache = createTaskCatalogCache({now, directory: path.join(userData, "task-model-catalog"), namespace: `personal-v1:${cloudBase}`});
  const mcpRequests = new Set();
  const inferenceRequests = new Set();
  const cancelMcp = () => { taskCatalogCache.clear(); for (const c of mcpRequests) c.abort(); mcpRequests.clear(); for (const c of inferenceRequests) c.abort(); inferenceRequests.clear(); };
  const account = createGet3wSession({ userData, safeStorage, openExternal, cloudBase, webBase, fetchImpl, now, onReset: cancelMcp });
  const { request, load, refreshIdentity } = account;
  let queue = Promise.resolve();
  /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
  const serial = (fn) => { const result = queue.then(fn, fn); queue = result.then(() => {}, () => {}); return result; };
  /** @param {string} route
   * @param {{method?:string,body?:unknown,signal?:AbortSignal,headers?:Record<string,string>}} options */
  async function personal(route, {method="GET", body, signal, headers={}}={}) {
    const controller=new AbortController(); mcpRequests.add(controller);
    try {
      const response=await fetchImpl(`${cloudBase}/v1/personal/${route}`, {
        method, redirect:"error", headers:{Authorization:`Bearer ${account.session.access_token}`,"Content-Type":"application/json",...headers},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(150_000),...(signal?[signal]:[])]),
        ...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      if(response.status===404 && route==="capabilities") { cancelMcp(); throw Error("Personal account API is unavailable. Update the Get3W server."); }
      return response;
    } finally {mcpRequests.delete(controller);}
  }
  async function requirePersonal(userId) {
    await refreshIdentity();
    if(!account.session || account.status!=="signed_in" || userId!==account.user?.id) throw Error("Get3W account changed or is unavailable.");
    const response=await personal("capabilities");
    if (!response.ok) {
      if (response.status === 401) throw Error("Session expired. Sign in again.");
      throw Error("Personal account service is unavailable. Try again.");
    }
    if ((await response.json()).contract_version !== "personal-account-v1") {
      cancelMcp(); throw Error("Personal account API is unavailable. Update the Get3W server.");
    }
  }
  const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 255;
  return {
    taskLogRequest: async (userId, route, options = {}) => {
      if (!/^$|^\/[A-Za-z0-9_-]+(?:\/(?:events|attachments\/[A-Za-z0-9_-]+))?$/.test(route)) throw Error("Invalid task log route");
      const access = await serial(async () => {
        await load();
        if(account.status!=="signed_in"||!account.session||account.session.expiresAt<=now()+30_000) await refreshIdentity();
        if(account.status!=="signed_in"||account.user?.id!==userId) throw Error("Task log account changed");
        return account.session.access_token;
      });
      const controller=new AbortController();mcpRequests.add(controller);
      try {
        const response=await fetchImpl(`${cloudBase}/v1/personal/task-logs${route}`,{
          method:options.method??"GET",redirect:"error",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(150000)]),
          headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},
          ...(options.body===undefined?{}:{body:JSON.stringify(options.body)}),
        });
        if(!response.ok) throw Object.assign(Error(`Task log upload failed (${response.status})`),{status:response.status});
        if(account.user?.id!==userId) throw Error("Task log account changed");
        return response.json();
      } finally {mcpRequests.delete(controller);}
    },
    outputIdentity: () => ({userId:account.session&&account.status==="signed_in"&&account.user?.id}),
    // The paid and MCP endpoints enforce live permissions. Avoid an extra /me
    // request at every native workflow stage while retaining token refresh.
    mediaIdentity: () => serial(async()=>{
      await load();
      if(account.status!=="signed_in"||!account.session||account.session.expiresAt<=now()+30_000)await refreshIdentity();
      return account.snapshot();
    }),
    mediaCatalog: input => serial(async()=>{
      await load();
      if(account.status!=="signed_in"||!account.session||account.session.expiresAt<=now()+30_000)await refreshIdentity();
      if(!account.session||account.status!=="signed_in"||input.userId!==account.user?.id)throw Error("Get3W account changed or is unavailable.");
      return taskCatalogCache.read({userId:input.userId,load:etag=>personal("models",{headers:etag?{"If-None-Match":etag}:{}})});
    }),
    status: () => serial(async () => {
      try { return await refreshIdentity(); }
      catch (failure) { return account.markUnavailable(failure.message); }
    }),
    begin: () => serial(account.begin),
    poll: () => serial(account.poll),
    cancel: () => serial(account.cancel),
    connectors: (input) => serial(async () => {
      const providers = {google:"https://accounts.google.com/o/oauth2/v2/auth",microsoft:"https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize"};
      if (!input || !["status","authorize","disconnect"].includes(input.action) ||
          (input.action !== "status" && !Object.hasOwn(providers,input.provider))) throw new Error("Invalid connection action.");
      await refreshIdentity();
      await requirePersonal(input.userId);
      const base = `${cloudBase}/v1/personal/connections`;
      let result;
      try {
        const response = await fetchImpl(base + (input.action === "status" ? "" : `/${input.provider}${input.action === "authorize" ? "/authorize" : ""}`), {
          method: input.action === "status" ? "GET" : input.action === "authorize" ? "POST" : "DELETE",
          headers: {Authorization:`Bearer ${account.session.access_token}`,"Content-Type":"application/json"},
          ...(input.action === "authorize" ? {body:"{}"} : {}), redirect:"error",signal:AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error();
        result = await response.json();
      } catch { throw new Error("Connections could not be verified. Reload connections before retrying."); }
      if (input.action === "status") {
        if (!Array.isArray(result.connectors) || result.connectors.length !== 2 || new Set(result.connectors.map(row=>row?.provider)).size !== 2 || result.connectors.some(row=>!row || !Object.hasOwn(providers,row.provider) || typeof row.configured !== "boolean" || typeof row.connected !== "boolean")) throw new Error("Invalid connections response. Reload connections.");
        return {connectors:result.connectors.map(({provider,configured,connected})=>({provider,configured,connected}))};
      }
      if (input.action === "disconnect") {
        if (result.provider !== input.provider || result.connected !== false || result.provider_consent_revoked !== false) throw new Error("Disconnect could not be confirmed. Reload connections.");
        return {ok:true};
      }
      // Authorization state and URLs remain in main. Reject redirect injection,
      // duplicate parameters and scope expansion before opening the browser.
      try {
        const url = new URL(result.authorization_url), params = url.searchParams;
        const scopes = input.provider === "google" ? ["openid","https://www.googleapis.com/auth/drive.metadata.readonly"] : ["openid","offline_access","User.Read","Files.Read"];
        const allowed = new Set(["client_id","redirect_uri","response_type","scope","state","code_challenge","code_challenge_method",...(input.provider === "google" ? ["access_type","prompt"] : [])]);
        if (url.origin + url.pathname !== providers[input.provider] || url.username || url.password || url.hash ||
            [...params.keys()].some(key=>!allowed.has(key)||params.getAll(key).length!==1) ||
            params.get("redirect_uri") !== `${cloudBase}/v1/personal/oauth/${input.provider}/callback` ||
            params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" ||
            !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge")||"") || !/^[A-Za-z0-9_-]{32,256}$/.test(params.get("state")||"") ||
            !params.get("client_id") || params.get("scope") !== scopes.join(" ") ||
            (input.provider === "google" && (params.get("access_type") !== "offline" || params.get("prompt") !== "consent"))) throw new Error();
        await openExternal(url.href);
      } catch { throw new Error("Could not open the verified connection page. Reload connections and retry."); }
      return {ok:true};
    }),
    // Main-process only: never add this streaming method to the renderer IPC allowlist.
    // Main-process only; deliberately absent from the renderer IPC allowlist.
    // Main-process only. The guarded proxy/recovery supplies persisted host consent.
    submitPersonal: async input => {
      // Serialize identity changes, not the potentially slow paid request. Keep
      // its cancellation registered before releasing the identity lock so logout
      // and account replacement cannot leave an old-account request running.
      const controller=new AbortController();
      const access=await serial(async()=>{
        await load();
        if(account.status!=="signed_in"||!account.session||account.session.expiresAt<=now()+30_000)await refreshIdentity();
        if(!account.session||account.status!=="signed_in"||input.userId!==account.user?.id)throw Error("Get3W account changed or is unavailable.");
        // The paid endpoint verifies the current account, entitlement, quote and
        // consent itself. Repeating /me and /capabilities adds two network hops
        // between approval and dispatch without strengthening that decision.
        mcpRequests.add(controller);
        return account.session.access_token;
      });
      try {
      const args=input.arguments;
      const payload_json=JSON.stringify(args);
      const response=await fetchImpl(`${cloudBase}/v1/personal/tasks`,{method:"POST",redirect:"error",
        headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(150_000),...(input.signal?[input.signal]:[])]),body:JSON.stringify({
        slug:args.slug,inputs:args.inputs,quote_id:args.quote_id,idempotency_key:args.idempotency_key,
        conversation_id:args.session_id,approval:{approved:true,quote_id:args.quote_id,payload_json,
          payload_hash:createHash("sha256").update(payload_json).digest("hex")},
      })});
      if(!response.ok) {
        if(response.status===401||response.status===403)taskCatalogCache.clear();
        const failure=await response.json().catch(()=>null);
        const code=failure?.error?.code;
        const corrections={
          idempotency_conflict:"This submission key belongs to a different payload. Retrieve that task; for a new task use a new key unique to this conversation and candidate.",
          quote_expired:"Quote expired before submission. Request a new quote and approval before submitting.",
          quote_stale:"Model catalog changed. Request a new quote and approval before submitting.",
          quote_mismatch:"Quoted inputs do not match. Quote the exact inputs again before submitting.",
          quote_consumed:"Quote already used. Retrieve the original task before submitting again.",
        };
        if(Object.hasOwn(corrections,code)) {
          const error=Object.assign(new Error(corrections[code]),{code,definitive:true});
          throw error;
        }
        throw Error("Personal task submission could not be confirmed. Retrieve the original task before retrying.");
      }
      return await response.json();
      } finally {mcpRequests.delete(controller);}
    },
    mcp: async ({userId, sessionId, appId, method, body, headers = {}, signal}) => {
      if (!["GET","POST","DELETE"].includes(method)) throw new Error("Unsupported MCP method");
      if (appId !== undefined && !/^cob_[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(appId)) throw new Error("Invalid artifact connection");
      const controller = new AbortController();
      const access = await serial(async () => {
        await load();
        if(account.status!=="signed_in"||!account.session||account.session.expiresAt<=now()+30_000)await refreshIdentity();
        // MCP is the source of truth for personal model access, so it does not
        // wait on the capabilities probe before each request.
        if (!account.session || account.status !== "signed_in" || userId !== account.user?.id) throw new Error("Get3W account changed or is unavailable.");
        mcpRequests.add(controller);
        return account.session.access_token;
      });
      try {
        const forwarded = {};
        // Session binding is host-owned. Never forward a session header supplied
        // by the engine/Agent; a future per-call host adapter must inject it.
        for (const name of ["accept","content-type","mcp-protocol-version","mcp-session-id","last-event-id"]) {
          if (typeof headers[name] === "string") forwarded[name] = headers[name];
        }
        if (appId && typeof headers['x-get3w-app-revision'] === 'string' && /^cov_[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(headers['x-get3w-app-revision'])) forwarded['x-get3w-app-revision']=headers['x-get3w-app-revision'];
        const mcpPath = `${cloudBase}/v1/gateway${appId ? `/apps/${appId}` : ""}/mcp`;
        /** @type {RequestInit} */
        const requestOptions = {
          method, redirect:"error", headers:{...forwarded, Authorization:`Bearer ${access}`,
            ...(typeof sessionId === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(sessionId) ? {"X-Get3W-Session-Id":sessionId} : {})},
          ...(method === "POST" ? {body} : {}),
          signal:signal ? AbortSignal.any([controller.signal,signal]) : controller.signal,
        };
        const response = await fetchImpl(mcpPath, requestOptions);
        if(response.status===401||response.status===403)taskCatalogCache.clear();
        if (!response.ok) console.warn("[get3w-account-mcp] upstream", JSON.stringify({status:response.status, method, contentType:response.headers.get("content-type")}));
        return {response,release:()=>{mcpRequests.delete(controller);controller.abort();}};
      } catch {
        mcpRequests.delete(controller);
        throw new Error("Get3W Gateway is unavailable. Check your account.");
      }
    },
    inference: async ({ userId, route, body, signal }) => {
      const startedAt = performance.now();
      if (!["models", "chat/completions"].includes(route)) throw new Error("Unsupported inference route");
      const controller = new AbortController();
      const binding = await serial(async () => {
        await load();
        // The inference endpoint validates the bearer session and live permissions.
        // Reuse a verified, unexpired local identity instead of a redundant /me round trip.
        if (account.status !== "signed_in" || !account.session || account.session.expiresAt <= now() + 30_000) await refreshIdentity();
        if (!account.session || account.status !== "signed_in" || userId !== account.user?.id) throw new Error("Sign in to the current Get3W account and retry.");
        inferenceRequests.add(controller);
        return {access:account.session.access_token};
      });
      const identityMs = Math.round(performance.now() - startedAt);
      const combined = AbortSignal.any([controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(300_000)]);
      try {
        // Never retry a submitted completion: a lost response can already be billed.
        const response = await fetchImpl(`${cloudBase}/v1/inference/${route}`, {
          method: route === "models" ? "GET" : "POST", redirect: "error", signal: combined,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${binding.access}`, "X-Get3W-Request-Id":randomUUID() },
          ...(route === "chat/completions" ? {body} : {}),
        });
        if (route === "chat/completions") console.info("[get3w-inference-auth]", JSON.stringify({
          identityMs, headersMs: Math.round(performance.now() - startedAt),
          serverTiming: response.headers.get("server-timing"), status: response.status,
        }));
        return { response, release: () => { inferenceRequests.delete(controller); controller.abort(); } };
      } catch {
        inferenceRequests.delete(controller);
        throw new Error("Get3W inference is unavailable. Check the session before retrying.");
      }
    },
    automationWork: (userId, runnerId, workspaceIds) => serial(async () => {
      await requirePersonal(userId);
      const response = await personal("automation-runner/work", {method:"POST",signal:AbortSignal.timeout(30000),body:{runnerId,...(workspaceIds ? {workspaceIds} : {})}});
      if (!response.ok) throw Error("Automation queue is unavailable.");
      return (await response.json()).assignment;
    }),
    automationReport: (userId, runId, runnerId, body) => serial(async () => {
      await requirePersonal(userId);
      const response = await personal(`automation-runner/runs/${encodeURIComponent(runId)}`, {method:"POST",signal:AbortSignal.timeout(8000),body:{runnerId,...body}});
      if (!response.ok) throw Error("Automation receipt was not accepted.");
      return response.json();
    }),
    automations: input => serial(async () => {
      const route = automationRoute(input);
      await requirePersonal(input.userId);
      const response = await personal(route, {method: input.method, ...(input.body === undefined ? {} : {body: input.body})});
      if (!account.session || account.status !== "signed_in" || account.user?.id !== input.userId) throw Error("Account changed. Reload automations.");
      const text = await response.text();
      if (text.length > 16_000_000) throw Error("Automation response is too large.");
      return {ok: response.ok, status: response.status, json: JSON.parse(text)};
    }),
    // Renderer transport. Personal identity is verified in main.
    artifacts: input => serial(async () => {
      const route = artifactRoute(input);
      await requirePersonal(input.userId);
      const current = () => account.session && account.status === "signed_in" && account.user?.id === input.userId;
      const response = await fetchImpl(`${cloudBase}/v1/personal${route.replace(/^\/v1/, "")}`, {
        method: input.method, redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: {Authorization: `Bearer ${account.session.access_token}`, "Content-Type": "application/json"},
        ...(input.method === "POST" ? {body: JSON.stringify(input.body ?? {})} : {}),
      });
      if (!current()) throw Error("Account changed. Reload artifacts.");
      const body = await response.text();
      if (body.length > 4_000_000) throw Error("Artifact response is too large.");
      let json;
      try { json = JSON.parse(body); } catch { throw Error("Artifacts are unavailable. Try again."); }
      return {ok: response.ok, status: response.status, json};
    }),
    taskCatalog: input => serial(async()=>{
      if(!input || (input.offline!==undefined&&typeof input.offline!=="boolean") || (input.refresh!==undefined&&typeof input.refresh!=="boolean") || !identifier(input.userId) || Object.keys(input).some(k=>!["userId","offline","refresh"].includes(k))) throw Error("Invalid personal model catalog request.");
      if(input.offline) {
        if(!account.session || account.user?.id!==input.userId) throw Error("Verify your account online before browsing offline models.");
      } else await requirePersonal(input.userId);
      return taskCatalogCache.read({userId:input.userId,allowOffline:input.offline===true,forceRefresh:input.refresh===true,
        load:async etag=>{
          if(input.offline) throw new TypeError("Offline catalog browsing");
          return personal("models",{headers:etag?{"If-None-Match":etag}:{}});
        }});
    }),
    models: (input) => serial(async () => {
      await refreshIdentity();
      if (!account.session || account.status !== "signed_in" || input?.userId !== account.user?.id) throw new Error("Sign in to the current Get3W account and retry.");
      const response = await fetchImpl(`${cloudBase}/v1/inference/models`, {redirect:"error",signal:AbortSignal.timeout(12_000),headers:{Authorization:`Bearer ${account.session.access_token}`}});
      if (!response.ok) throw new Error("Models could not be verified. Retry.");
      const result=await response.json();
      if (result.object !== "list" || !Array.isArray(result.data) || result.data.some(model =>
        !model || !identifier(model.id) || !identifier(model.owned_by) || !Array.isArray(model.protocols) ||
        model.protocols.some(protocol => !["openai", "anthropic", "gemini"].includes(protocol))) ||
        new Set(result.data.map(model => model.id)).size !== result.data.length) throw new Error("Models could not be verified. Retry.");
      return { models: result.data.filter(model=>model.available!==false).map(({id, owned_by, protocols, input_modalities}) => ({id, owned_by, protocols, input_modalities:Array.isArray(input_modalities) ? input_modalities.filter(value=>["text","image","audio","video","pdf"].includes(value)) : ["text"]})) };
    }),
    modelUsage: input => serial(async()=>{
      await requirePersonal(input?.userId);
      if(input.action!=="read") throw Error("Invalid personal usage request.");
      const response=await personal("usage"+(input.after?`?after=${encodeURIComponent(input.after)}`:""));
      if(!response.ok)throw Error("Usage is unavailable. Try again.");
      const value=await response.json();
      if(value.billing!=="personal" || !Array.isArray(value.items))throw Error("Invalid personal usage response.");
      return value;
    }),
    balance: (input) => serial(async () => {
      await refreshIdentity();
      if (!account.session || account.status !== "signed_in" || input?.userId !== account.user?.id) throw new Error("Sign in to the current Get3W account and retry.");
      const response=await personal("balance");
      if(!response.ok)throw Error("Balance is unavailable. Try again.");
      const result = await response.json();
      if (result.balance === null) return { balance: null };
      const value = result.balance;
      if (!value || typeof value.amount !== "string" || !/^-?\d+\.\d{6}$/.test(value.amount) ||
        !["USD", "CNY"].includes(value.currency)) throw new Error("Balance could not be verified. Retry.");
      return { balance: { amount: value.amount, currency: value.currency } };
    }),
    settings: (input) => serial(async () => {
      await refreshIdentity();
      if (!account.session || account.status !== "signed_in") throw new Error(account.status === "unavailable" ? "Get3W is unavailable. Retry when online." : "Sign in to Get3W before syncing settings.");
      if (!input || input.userId !== account.user?.id) throw new Error("Account changed. Reload settings.");
      const body = input.value;
      if (body !== undefined) {
        const keys = ["showThinking", "desktopNotifications", "linkOpenDestination", "keepAwake"];
        if (!body || body.schema_version !== 1 || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
          !body.preferences || Object.keys(body).some(k => !["schema_version","revision","preferences"].includes(k)) ||
          Object.keys(body.preferences).some(k => !keys.includes(k)) || JSON.stringify(body).length > 2048) throw new Error("Invalid settings.");
      }
      try { return await request("settings", body, account.session.access_token, body ? "PUT" : "GET"); }
      catch (failure) {
        if (failure.status === 409) throw new Error("Settings changed on another device. Reload cloud settings before saving.");
        throw failure;
      }
    }),
    logout: () => { cancelMcp(); return serial(account.logout); },
  };
}

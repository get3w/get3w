import { GET3W_SERVICES, validateGet3wOrigin } from "./get3w-services.mjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir, chmod, unlink } from "node:fs/promises";
import path from "node:path";

export function createGet3wAuth({ userData, safeStorage, openExternal, apiBase = GET3W_SERVICES.apiBase, webBase = GET3W_SERVICES.webBase, gatewayBase = apiBase, fetchImpl = fetch, now = Date.now }) {
  apiBase = validateGet3wOrigin(apiBase);
  webBase = validateGet3wOrigin(webBase);
  gatewayBase = validateGet3wOrigin(gatewayBase);
  const mcpRequests = new Set();
  const cancelMcp = () => { for (const c of mcpRequests) c.abort(); mcpRequests.clear(); for (const c of inferenceRequests) c.abort(); inferenceRequests.clear(); };
  const file = path.join(userData, "openwork-session.enc");
  let selectedOrganization = null;
  const inferenceRequests = new Set();
  let session = null, user = null, pending = null, queue = Promise.resolve(), loaded = false;
  let status = "signed_out", error = null;
  const serial = (fn) => { const result = queue.then(fn, fn); queue = result.catch(() => {}); return result; };
  const snapshot = () => ({ status, user, error, pending: Boolean(pending), organization: selectedOrganization });
  async function request(route, body, access, method, scope = "auth") {
    let response;
    try {
      response = await fetchImpl(`${apiBase}/desktop/v1/${scope}/${route}`, {
        method: method || (body ? "POST" : "GET"), redirect: "error", signal: AbortSignal.timeout(12_000),
        headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error("Get3W is unavailable. Try again."); }
    if (!response.ok) {
      const failure = new Error(response.status === 401 ? "Session expired. Sign in again." : "Get3W sign-in failed. Try again.");
      failure.status = response.status;
      throw failure;
    }
    return response.json();
  }
  const roles = new Set(["owner", "admin", "member", "viewer"]);
  const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 255;
  async function readOrganizations() {
    const result = await request("organizations", null, session.access_token);
    if (!Array.isArray(result.organizations) || result.organizations.some(org =>
      !org || !identifier(org.organization_id) || !identifier(org.name) || !roles.has(org.role)) ||
      new Set(result.organizations.map(org => org.organization_id)).size !== result.organizations.length) {
      cancelMcp();
      selectedOrganization = null;
      throw new Error("Invalid organization response. Reload organizations.");
    }
    const organizations = result.organizations.map(({ organization_id, name, role }) => ({ organization_id, name, role }));
    if (selectedOrganization) {
      const current = organizations.find(org => org.organization_id === selectedOrganization.organization_id);
      if (current?.role !== selectedOrganization.role) cancelMcp();
      selectedOrganization = current?.role === selectedOrganization.role ? current : null;
    }
    return organizations;
  }
  async function encryptionAvailable() {
    return await safeStorage.isAsyncEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }
  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const bytes = await readFile(file);
      if (!await encryptionAvailable()) { loaded = false; throw new Error("Secure storage is unavailable. Unlock your keychain and retry."); }
      const decoded = await safeStorage.decryptStringAsync(bytes);
      const value = JSON.parse(typeof decoded === "string" ? decoded : decoded.result);
      if (value.apiBase !== apiBase || typeof value.refresh_token !== "string") throw new Error("Invalid saved session");
      session = value;
    } catch (failure) {
      if (failure.code === "ENOENT") return;
      loaded = false;
      throw new Error("Could not restore the secure Get3W session. Unlock your keychain and retry.");
    }
  }
  async function save(next) {
    if (!await encryptionAvailable()) throw new Error("Secure storage is unavailable. Unlock your keychain and retry.");
    const value = { ...next, apiBase, expiresAt: now() + next.expires_in * 1000 };
    let encrypted;
    try { encrypted = await safeStorage.encryptStringAsync(JSON.stringify(value)); }
    catch { throw new Error("Could not encrypt the Get3W session. Unlock your keychain and retry."); }
    await mkdir(userData, { recursive: true });
    const temp = `${file}.${randomBytes(6).toString("hex")}`;
    await writeFile(temp, encrypted, { mode: 0o600 });
    await chmod(temp, 0o600); await rename(temp, file);
    session = value;
  }
  async function clear() {
    cancelMcp();
    for (const controller of inferenceRequests) controller.abort();
    inferenceRequests.clear();
    session = null; user = null; selectedOrganization = null; status = "signed_out";
    await unlink(file).catch(e => { if (e.code !== "ENOENT") throw e; });
  }
  async function refreshIdentity() {
    await load();
    if (!session) return snapshot();
    try {
      if (session.expiresAt <= now() + 30_000) await save(await request("refresh", { refresh_token: session.refresh_token }));
      try { user = (await request("me", null, session.access_token)).user; }
      catch (failure) {
        if (failure.status !== 401) throw failure;
        await save(await request("refresh", { refresh_token: session.refresh_token }));
        user = (await request("me", null, session.access_token)).user;
      }
      status = "signed_in"; error = null;
    } catch (failure) {
      if (failure.status === 401) await clear(); else status = "unavailable";
      error = failure.message;
    }
    return snapshot();
  }
  async function cancelPending() {
    const old = pending; pending = null;
    if (old) await request("cancel", old.body).catch(() => {});
  }
  return {
    status: () => serial(async () => {
      try { return await refreshIdentity(); }
      catch (failure) { status = "unavailable"; error = failure.message; return snapshot(); }
    }),
    begin: () => serial(async () => {
      await cancelPending();
      if (!await encryptionAvailable()) throw new Error("Secure storage is unavailable. Unlock your keychain and retry.");
      const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url");
      const result = await request("requests", { code_challenge: createHash("sha256").update(verifier).digest("base64url"), state });
      pending = { body: { request_id: result.request_id, code_verifier: verifier, state }, until: now() + result.expires_in * 1000 };
      const url = `${webBase}/desktop-connect?request_id=${encodeURIComponent(result.request_id)}`;
      try { await openExternal(url); } catch { await cancelPending(); throw new Error("Could not open the Get3W sign-in page."); }
      error = null; return snapshot();
    }),
    poll: () => serial(async () => {
      if (!pending) return snapshot();
      if (pending.until <= now()) { await cancelPending(); error = "Sign-in expired. Try again."; return snapshot(); }
      const value = await request("exchange", pending.body);
      if (value.status === "pending") return snapshot();
      pending = null;
      // A new grant must never display the previous account if /me is offline.
      for (const controller of inferenceRequests) controller.abort();
      inferenceRequests.clear();
      cancelMcp();
      user = null; selectedOrganization = null;
      try { await save(value); }
      catch (failure) {
        await request("logout", { refresh_token: value.refresh_token }).catch(() => {});
        error = failure.message; return snapshot();
      }
      return refreshIdentity();
    }),
    cancel: () => serial(async () => { await cancelPending(); return snapshot(); }),
    createOrganization: input => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in" || input?.userId !== user?.id) throw new Error("Account changed. Reopen account settings.");
      if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200 || /[\x00-\x1f]/.test(input.name)) throw new Error("Use an organization name of 1 to 200 characters.");
      const result = await request("organizations", {name:input.name.trim()}, session.access_token);
      if (!identifier(result.organization_id) || !identifier(result.name) || result.role !== "owner") throw new Error("Could not confirm the new organization. Reload organizations before retrying.");
      const organizations = await readOrganizations();
      const created = organizations.find(org => org.organization_id === result.organization_id);
      if (!created) throw new Error("Could not confirm the new organization. Reload organizations before retrying.");
      cancelMcp();selectedOrganization = created;
      return {organizations, selectedOrganization};
    }),
    organizations: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in") throw new Error("Get3W is unavailable or signed out. Reconnect and retry.");
      if (!input || input.userId !== user?.id) throw new Error("Account changed. Reload organizations.");
      const organizations = await readOrganizations();
      if (input.organizationId !== undefined) {
        if (input.organizationId !== selectedOrganization?.organization_id) cancelMcp();
        selectedOrganization = organizations.find(org => org.organization_id === input.organizationId) || null;
        if (input.organizationId !== null && !selectedOrganization) throw new Error("Organization access changed. Reload organizations.");
      }
      return { organizations, selectedOrganization };
    }),
    membership: (input) => serial(async () => {
      if (!input || !["inbox","list","invite","accept","decline","revoke","remove","leave"].includes(input.action)) throw new Error("Invalid membership action.");
      await refreshIdentity();
      if (!session || status !== "signed_in" || input.userId !== user?.id) throw new Error("Account changed. Reopen account settings.");
      const validId = value => typeof value === "string" && /^[^\s\x00-\x1f]{1,50}$/.test(value);
      const memberAction = ["list","invite","revoke","remove","leave"].includes(input.action);
      if (memberAction) {
        if (input.organizationId !== selectedOrganization?.organization_id) throw new Error("Organization changed. Reload organizations.");
        await readOrganizations();
        if (!selectedOrganization) throw new Error("Organization access changed. Reload organizations.");
        if (input.action !== "leave" && !["owner","admin"].includes(selectedOrganization.role)) throw new Error("Organization administrator access required.");
      }
      if (input.after !== undefined && !validId(input.after)) throw new Error("Invalid invitation page.");
      const org = `organizations/${encodeURIComponent(input.organizationId||"")}`;
      let route, body, method;
      if (input.action === "inbox" || input.action === "list") {
        route = (input.action === "inbox" ? "invitations" : `${org}/invitations`) + (input.after ? `?after=${encodeURIComponent(input.after)}` : "");
      } else if (input.action === "invite") {
        if (!validId(input.recipientId) || !["admin","member","viewer"].includes(input.role)) throw new Error("Use a Get3W account ID and invitation role.");
        route=`${org}/invitations`; body={recipient_id:input.recipientId,role:input.role}; method="POST";
      } else if (["accept","decline","revoke"].includes(input.action)) {
        if (!validId(input.invitationId)) throw new Error("Invalid invitation.");
        route = input.action === "revoke" ? `${org}/invitations/${encodeURIComponent(input.invitationId)}` : `invitations/${encodeURIComponent(input.invitationId)}`;
        method = input.action === "revoke" ? "DELETE" : "POST";
        if (method === "POST") body={action:input.action};
      } else if (input.action === "remove") {
        if (!validId(input.memberId)) throw new Error("Invalid organization member.");
        route=`${org}/members/${encodeURIComponent(input.memberId)}`;method="DELETE";
      } else {route=`${org}/leave`;body={};method="POST";}
      let result;
      try { result=await request(route,body,session.access_token,method); }
      catch(failure) {
        if (failure.status === 409) throw new Error("This membership change is unavailable. Keep an active owner and reload invitations.");
        if (failure.status === 422) throw new Error("Check the Get3W account ID and invitation role.");
        if (failure.status === 403) throw new Error("Your organization role no longer allows this action. Reload organizations.");
        throw failure;
      }
      const project = row => {
        if (!row || !validId(row.invitation_id) || !validId(row.organization_id) || !validId(row.recipient_id) || !["admin","member","viewer"].includes(row.role) || !["pending","accepted","declined","revoked","expired"].includes(row.status) || !Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.expires_at)) throw new Error("Invalid invitation response. Reload invitations.");
        return {invitation_id:row.invitation_id,organization_id:row.organization_id,recipient_id:row.recipient_id,role:row.role,status:row.status,created_at:row.created_at,expires_at:row.expires_at};
      };
      if (["inbox","list"].includes(input.action)) {
        if (!Array.isArray(result.invitations) || result.invitations.length>100 || (result.next_cursor !== null && !validId(result.next_cursor)) || (input.action === "list" && result.organization_id !== input.organizationId)) throw new Error("Invalid invitation page. Reload invitations.");
        const invitations=result.invitations.map(row=>{
          const safe=project(row);
          if (input.action === "inbox") {
            if (safe.recipient_id !== user.id || !identifier(row.organization_name)) throw new Error("Invalid invitation recipient.");
            return {...safe,organization_name:row.organization_name};
          }
          if(safe.organization_id!==input.organizationId)throw new Error("Invalid invitation organization.");
          return safe;
        });
        return {invitations,next_cursor:result.next_cursor};
      }
      if (input.action === "invite") {const row=project(result);if(row.organization_id!==input.organizationId||row.recipient_id!==input.recipientId||row.role!==input.role)throw new Error("Invitation could not be confirmed. Reload invitations.");}
      else if (result.ok !== true) throw new Error("Membership change could not be confirmed. Reload organizations.");
      if (input.action === "leave" || (input.action === "remove" && input.memberId === user.id)) {cancelMcp();selectedOrganization=null;}
      return {ok:true};
    }),
    updateMember: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in" || input?.userId !== user?.id || !selectedOrganization) throw new Error("Select an available organization first.");
      if (input.organizationId !== selectedOrganization.organization_id) throw new Error("Organization changed. Reload organizations.");
      if (!identifier(input.memberId) || !roles.has(input.role) || typeof input.active !== "boolean") throw new Error("Invalid member update");
      await readOrganizations();
      if (!selectedOrganization || !["owner", "admin"].includes(selectedOrganization.role)) throw new Error("Organization access changed. Reload organizations.");
      try {
        return await request(`organizations/${encodeURIComponent(selectedOrganization.organization_id)}/members/${encodeURIComponent(input.memberId)}`,
          {role:input.role,active:input.active},session.access_token,"PATCH");
      } catch(failure) {
        if (failure.status === 409) throw new Error("Keep at least one active organization owner.");
        if (failure.status === 403) throw new Error("Your current organization role does not allow this change. Reload organizations.");
        throw failure;
      }
    }),
    connectors: (input) => serial(async () => {
      const providers = {google:"https://accounts.google.com/o/oauth2/v2/auth",microsoft:"https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize"};
      if (!input || !["status","authorize","disconnect"].includes(input.action) ||
          (input.action !== "status" && !Object.hasOwn(providers,input.provider))) throw new Error("Invalid connection action.");
      await refreshIdentity();
      if (!session || status !== "signed_in" || input.userId !== user?.id || input.organizationId !== selectedOrganization?.organization_id) throw new Error("Account or organization changed. Reload organizations.");
      await readOrganizations();
      if (!selectedOrganization || !["owner","admin","member"].includes(selectedOrganization.role)) throw new Error("Organization membership required. Ask your administrator.");
      const base = `${gatewayBase}/connectors/v1/organizations/${encodeURIComponent(selectedOrganization.organization_id)}`;
      let result;
      try {
        const response = await fetchImpl(base + (input.action === "status" ? "" : `/${input.provider}${input.action === "authorize" ? "/authorize" : ""}`), {
          method: input.action === "status" ? "GET" : input.action === "authorize" ? "POST" : "DELETE",
          headers: {Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
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
            params.get("redirect_uri") !== `${gatewayBase}/connectors/oauth/${input.provider}/callback` ||
            params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" ||
            !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge")||"") || !/^[A-Za-z0-9_-]{32,256}$/.test(params.get("state")||"") ||
            !params.get("client_id") || params.get("scope") !== scopes.join(" ") ||
            (input.provider === "google" && (params.get("access_type") !== "offline" || params.get("prompt") !== "consent"))) throw new Error();
        await openExternal(url.href);
      } catch { throw new Error("Could not open the verified connection page. Reload connections and retry."); }
      return {ok:true};
    }),
    toolAccess: (input) => serial(async () => {
      if (!input || !["read", "publish", "publishConnector", "grant"].includes(input.action)) throw new Error("Invalid tool access action.");
      await refreshIdentity();
      if (!session || status !== "signed_in" || input.userId !== user?.id || input.organizationId !== selectedOrganization?.organization_id) throw new Error("Account or organization changed. Reload organizations.");
      await readOrganizations();
      if (!selectedOrganization || !["owner", "admin"].includes(selectedOrganization.role)) throw new Error("Organization administrator access required.");
      const base = `organizations/${encodeURIComponent(selectedOrganization.organization_id)}`;
      if (input.action === "publish" || input.action === "publishConnector") {
        if (input.action === "publishConnector" && !["google","microsoft"].includes(input.provider)) throw new Error("Invalid connector provider.");
        const result = await request(input.action === "publish" ? `${base}/model-catalog` : `${base}/connector-catalog/${input.provider}`, {}, session.access_token, "POST");
        if (result.ok !== true) throw new Error("Publication could not be confirmed. Reload tools before retrying.");
        return {ok:true};
      }
      if (!identifier(input.memberId)) throw new Error("Select an organization member.");
      const route = `${base}/tool-access/${encodeURIComponent(input.memberId)}`;
      if (input.action === "grant") {
        if (typeof input.capability !== "string" || !input.capability || input.capability.length > 100 || typeof input.enabled !== "boolean") throw new Error("Invalid tool grant.");
        const result = await request(`${route}/${encodeURIComponent(input.capability)}`, {enabled:input.enabled}, session.access_token, "PUT");
        if (result.ok !== true) throw new Error("Grant change could not be confirmed. Reload tools before retrying.");
        return {ok:true};
      }
      if (input.after !== undefined && (typeof input.after !== "string" || !input.after || input.after.length > 100)) throw new Error("Invalid tool page.");
      const result = await request(route + (input.after ? `?after=${encodeURIComponent(input.after)}` : ""), null, session.access_token);
      if (result.organization_id !== input.organizationId || result.member_id !== input.memberId || !Array.isArray(result.capabilities) || result.capabilities.length > 100 || result.capabilities.some(row => !row || !identifier(row.name) || row.name.length > 100 || typeof row.description !== "string" || row.description.length > 500 || typeof row.granted !== "boolean") || (result.next_cursor !== null && (typeof result.next_cursor !== "string" || !result.next_cursor || result.next_cursor.length > 100))) throw new Error("Invalid tool access response. Reload tools.");
      return {organization_id:result.organization_id,member_id:result.member_id,capabilities:result.capabilities.map(({name,description,granted})=>({name,description,granted})),next_cursor:result.next_cursor};
    }),
    members: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in" || input?.userId !== user?.id || !selectedOrganization) throw new Error("Select an available organization first.");
      await readOrganizations();
      if (!selectedOrganization || !["owner", "admin"].includes(selectedOrganization.role)) throw new Error("Organization access changed. Reload organizations.");
      const result = await request(`organizations/${encodeURIComponent(selectedOrganization.organization_id)}/members`, null, session.access_token);
      if (result.organization_id !== selectedOrganization.organization_id || !Array.isArray(result.members) ||
        result.members.some(member => !member || !identifier(member.user_id) || !roles.has(member.role))) throw new Error("Invalid member response. Reload organizations.");
      return { organization_id: result.organization_id, members: result.members.map(({user_id, role}) => ({user_id, role})) };
    }),
    // Main-process only: never add this streaming method to the renderer IPC allowlist.
    // Main-process only; deliberately absent from the renderer IPC allowlist.
    mcp: async ({userId, organizationId, method, body, headers = {}, signal}) => {
      if (!["GET","POST","DELETE"].includes(method)) throw new Error("Unsupported MCP method");
      const controller = new AbortController();
      const access = await serial(async () => {
        await refreshIdentity();
        if (!session || status !== "signed_in" || userId !== user?.id) throw new Error("Get3W account changed or is unavailable.");
        await readOrganizations();
        if (!selectedOrganization || selectedOrganization.organization_id !== organizationId) throw new Error("Select the connected Get3W organization first.");
        mcpRequests.add(controller);
        return session.access_token;
      });
      try {
        const forwarded = {};
        for (const name of ["accept","content-type","mcp-protocol-version","mcp-session-id","last-event-id"]) {
          if (typeof headers[name] === "string") forwarded[name] = headers[name];
        }
        const response = await fetchImpl(`${gatewayBase}/desktop-gateway/mcp`, {
          method, redirect:"error", headers:{...forwarded, Authorization:`Bearer ${access}`, "X-Get3W-Organization":organizationId},
          ...(method === "POST" ? {body} : {}),
          signal:signal ? AbortSignal.any([controller.signal,signal]) : controller.signal,
        });
        return {response,release:()=>{mcpRequests.delete(controller);controller.abort();}};
      } catch {
        mcpRequests.delete(controller);
        throw new Error("Get3W Gateway is unavailable. Check your account and organization.");
      }
    },
    inference: async ({ userId, organizationId, route, body, signal }) => {
      if (!["models", "chat/completions"].includes(route)) throw new Error("Unsupported inference route");
      const controller = new AbortController();
      const binding = await serial(async () => {
        await refreshIdentity();
        if (!session || status !== "signed_in" || userId !== user?.id) throw new Error("Sign in to the current Get3W account and retry.");
        if (organizationId!==selectedOrganization?.organization_id) throw new Error("Organization changed. Reconnect models before running a task.");
        if (selectedOrganization) { await readOrganizations(); if (!selectedOrganization) throw new Error("Organization access changed. Reload organizations."); }
        inferenceRequests.add(controller);
        return {access:session.access_token,organizationId:selectedOrganization?.organization_id};
      });
      const combined = AbortSignal.any([controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(300_000)]);
      try {
        // Never retry a submitted completion: a lost response can already be billed.
        const response = await fetchImpl(`${apiBase}/desktop/v1/inference/${route}`, {
          method: route === "models" ? "GET" : "POST", redirect: "error", signal: combined,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${binding.access}`, "X-Get3W-Request-Id":randomUUID(), ...(binding.organizationId?{"X-Get3W-Organization":binding.organizationId}:{}) },
          ...(route === "chat/completions" ? {body} : {}),
        });
        return { response, release: () => { inferenceRequests.delete(controller); controller.abort(); } };
      } catch {
        inferenceRequests.delete(controller);
        throw new Error("Get3W inference is unavailable. Check the session before retrying.");
      }
    },
    models: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in" || input?.userId !== user?.id) throw new Error("Sign in to the current Get3W account and retry.");
      const response = await fetchImpl(`${apiBase}/desktop/v1/inference/models`, {redirect:"error",signal:AbortSignal.timeout(12_000),headers:{Authorization:`Bearer ${session.access_token}`,...(selectedOrganization?{"X-Get3W-Organization":selectedOrganization.organization_id}:{})}});
      if (!response.ok) throw new Error("Models could not be verified. Retry.");
      const result=await response.json();
      if (result.object !== "list" || !Array.isArray(result.data) || result.data.some(model =>
        !model || !identifier(model.id) || !identifier(model.owned_by) || !Array.isArray(model.protocols) ||
        model.protocols.some(protocol => !["openai", "anthropic", "gemini"].includes(protocol))) ||
        new Set(result.data.map(model => model.id)).size !== result.data.length) throw new Error("Models could not be verified. Retry.");
      return { models: result.data.filter(model=>model.available!==false).map(({id, owned_by, protocols}) => ({id, owned_by, protocols})) };
    }),
    modelUsage: (input) => serial(async () => {
      await refreshIdentity();
      if (status==="unavailable") throw new Error("Get3W is unavailable. Retry when online.");
      if (!session || status!=="signed_in" || input?.userId!==user?.id) throw new Error("Account changed. Reopen account settings.");
      if (input.organizationId!==undefined) {
        if (input.organizationId!==selectedOrganization?.organization_id) throw new Error("Organization changed. Reload organizations.");
        await readOrganizations();
        if (!selectedOrganization) throw new Error("Organization access changed. Reload organizations.");
      }
      const base=input.organizationId?`organizations/${encodeURIComponent(input.organizationId)}/`:"";
      if (input.action==="limit") {
        if (!selectedOrganization || !["owner","admin"].includes(selectedOrganization.role) || !Number.isSafeInteger(input.limit) || input.limit<0 || input.limit>1000000 || typeof input.memberId!=="string" || input.memberId.length<1 || input.memberId.length>50) throw new Error("Administrator access and a valid request limit are required.");
        await request(`${base}model-limits/${encodeURIComponent(input.memberId)}`,{monthly_requests:input.limit},session.access_token,"PUT");return {ok:true};
      }
      if (input.action!=="read") throw new Error("Invalid usage action.");
      const result=await request(`${base}model-usage${input.after?`?after=${encodeURIComponent(input.after)}`:""}`,null,session.access_token);
      const money=value=>value===null || (value && typeof value.amount==="string" && /^-?\d+\.\d{6}$/.test(value.amount) && ["USD","CNY"].includes(value.currency));
      const bucket=value=>value===null || (value && Number.isSafeInteger(value.used) && value.used>=0 && (value.limit===null || Number.isSafeInteger(value.limit)) && (value.remaining===null || Number.isSafeInteger(value.remaining)));
      if (result.organization_id!==(input.organizationId??null) || result.billing!=="personal" || !result.quota || result.quota.unit!=="requests" || !/^\d{4}-\d{2}$/.test(result.quota.period) || !bucket(result.quota.organization) || !bucket(result.quota.member) || !Array.isArray(result.entries) || result.entries.length>100 || result.entries.some(row=>!row || !identifier(row.request_id) || !identifier(row.requested_model) || !identifier(row.actual_model) || !["submitted","completed","failed","cancelled"].includes(row.status) || !Number.isSafeInteger(row.created_at) || !money(row.charge) || !money(row.balance_after))) throw new Error("Usage could not be verified. Reload usage.");
      return {organization_id:result.organization_id,billing:"personal",quota:{unit:"requests",period:result.quota.period,organization:result.quota.organization?{limit:result.quota.organization.limit,used:result.quota.organization.used,remaining:result.quota.organization.remaining}:null,member:result.quota.member?{limit:result.quota.member.limit,used:result.quota.member.used,remaining:result.quota.member.remaining}:null},entries:result.entries.map(row=>({request_id:row.request_id,requested_model:row.requested_model,actual_model:row.actual_model,task_id:typeof row.task_id==="string"?row.task_id:null,status:row.status,created_at:row.created_at,billing_model:typeof row.billing_model==="string"?row.billing_model:null,charge:row.charge?{amount:row.charge.amount,currency:row.charge.currency}:null,balance_after:row.balance_after?{amount:row.balance_after.amount,currency:row.balance_after.currency}:null})),next_cursor:typeof result.next_cursor==="string"?result.next_cursor:null};
    }),
    balance: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in" || input?.userId !== user?.id) throw new Error("Sign in to the current Get3W account and retry.");
      const result = await request("balance", null, session.access_token);
      if (result.balance === null) return { balance: null };
      const value = result.balance;
      if (!value || typeof value.amount !== "string" || !/^-?\d+\.\d{6}$/.test(value.amount) ||
        !["USD", "CNY"].includes(value.currency)) throw new Error("Balance could not be verified. Retry.");
      return { balance: { amount: value.amount, currency: value.currency } };
    }),
    settings: (input) => serial(async () => {
      await refreshIdentity();
      if (!session || status !== "signed_in") throw new Error(status === "unavailable" ? "Get3W is unavailable. Retry when online." : "Sign in to Get3W before syncing settings.");
      if (!input || input.userId !== user?.id) throw new Error("Account changed. Reload settings.");
      const body = input.value;
      if (body !== undefined) {
        const keys = ["showThinking", "desktopNotifications", "linkOpenDestination", "keepAwake"];
        if (!body || body.schema_version !== 1 || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
          !body.preferences || Object.keys(body).some(k => !["schema_version","revision","preferences"].includes(k)) ||
          Object.keys(body.preferences).some(k => !keys.includes(k)) || JSON.stringify(body).length > 2048) throw new Error("Invalid settings.");
      }
      try { return await request("settings", body, session.access_token, body ? "PUT" : "GET"); }
      catch (failure) {
        if (failure.status === 409) throw new Error("Settings changed on another device. Reload cloud settings before saving.");
        throw failure;
      }
    }),
    logout: () => serial(async () => {
      await cancelPending(); await load();
      // Do not report a successful logout if server revocation could not finish.
      if (session) await request("logout", { refresh_token: session.refresh_token });
      await clear(); error = null; return snapshot();
    }),
  };
}

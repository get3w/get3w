import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir, chmod, unlink } from "node:fs/promises";
import path from "node:path";
import { migrateGet3wStateFile } from "./get3w-state-file.mjs";

/**
 * Native Desktop session: encrypted storage, PKCE browser sign-in and token refresh.
 * Callers serialize access; nothing here queues on its own.
 * @param {{userData:string,safeStorage:object,openExternal:Function,cloudBase:string,webBase:string,fetchImpl:typeof fetch,now:()=>number,onReset:()=>void}} options
 */
export function createGet3wSession({ userData, safeStorage, openExternal, cloudBase, webBase, fetchImpl, now, onReset }) {
  const file = path.join(userData, "get3w-session.enc");
  let session = null, user = null, pending = null, loaded = false;
  let status = "signed_out", error = null;
  const snapshot = () => ({ status, user, error, pending: Boolean(pending), accountMode: "personal" });

  async function request(route, body, access, method, scope = "auth") {
    let response;
    try {
      response = await fetchImpl(`${cloudBase}/v1/${scope}/${route}`, {
        method: method || (body ? "POST" : "GET"), redirect: "error", signal: AbortSignal.timeout(12_000),
        headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error("Get3W is unavailable. Try again."); }
    if (!response.ok) {
      const message = response.status === 401 ? "Session expired. Sign in again."
        : response.status === 404 ? "The Get3W server does not provide this desktop account endpoint (HTTP 404). Update the server or configure the development API origin."
        : `Get3W sign-in failed (HTTP ${response.status}). Try again.`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    return response.json();
  }
  async function encryptionAvailable() {
    return await safeStorage.isAsyncEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }
  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      await migrateGet3wStateFile(userData, "get3w-session.enc", "openwork-session.enc");
      const bytes = await readFile(file);
      if (!await encryptionAvailable()) { loaded = false; throw new Error("Secure storage is unavailable. Unlock your keychain and retry."); }
      let decoded;
      try {
        decoded = await safeStorage.decryptStringAsync(bytes);
      } catch {
        throw new Error("Saved Get3W session could not be decrypted. The macOS Keychain may be locked or this app profile may have changed. Sign in again.");
      }
      let value;
      try {
        value = JSON.parse(typeof decoded === "string" ? decoded : decoded.result);
      } catch {
        throw new Error("Saved Get3W session is invalid. Sign in again.");
      }
      if (value.cloudBase !== cloudBase || typeof value.refresh_token !== "string") {
        throw new Error("Saved Get3W session belongs to a different app configuration. Sign in again.");
      }
      session = value;
    } catch (failure) {
      if (failure.code === "ENOENT") return;
      // A stale, unreadable, or app-mismatched session is equivalent to being
      // signed out. Remove it quietly so ordinary users are not shown an
      // internal keychain/configuration error on every launch.
      session = null;
      status = "signed_out";
      error = null;
      await unlink(file).catch(() => {});
      loaded = true;
    }
  }
  async function save(next) {
    if (!await encryptionAvailable()) throw new Error("Secure storage is unavailable. Unlock your keychain and retry.");
    const value = { ...next, cloudBase, expiresAt: now() + next.expires_in * 1000 };
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
    onReset();
    session = null; user = null; status = "signed_out";
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
      if (failure.status === 401) await clear(); else { onReset(); status = "unavailable"; }
      error = failure.message;
    }
    return snapshot();
  }
  async function cancelPending() {
    const old = pending; pending = null;
    if (old) await request("cancel", old.body).catch(() => {});
  }
  async function begin() {
    await cancelPending();
    if (!await encryptionAvailable()) throw new Error("Secure storage is unavailable. Unlock your keychain and retry.");
    const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url");
    const result = await request("requests", { code_challenge: createHash("sha256").update(verifier).digest("base64url"), state });
    pending = { body: { request_id: result.request_id, code_verifier: verifier, state }, until: now() + result.expires_in * 1000 };
    const url = `${webBase}/desktop-connect?request_id=${encodeURIComponent(result.request_id)}`;
    try { await openExternal(url); } catch { await cancelPending(); throw new Error("Could not open the Get3W sign-in page."); }
    error = null; return snapshot();
  }
  async function poll() {
    if (!pending) return snapshot();
    if (pending.until <= now()) { await cancelPending(); error = "Sign-in expired. Try again."; return snapshot(); }
    const value = await request("exchange", pending.body);
    if (value.status === "pending") return snapshot();
    pending = null;
    // A new grant must never display the previous account if /me is offline.
    onReset();
    user = null;
    try { await save(value); }
    catch (failure) {
      await request("logout", { refresh_token: value.refresh_token }).catch(() => {});
      error = failure.message; return snapshot();
    }
    return refreshIdentity();
  }
  async function logout() {
    await cancelPending(); await load();
    // Do not report a successful logout if server revocation could not finish.
    if (session) await request("logout", { refresh_token: session.refresh_token });
    await clear(); error = null; return snapshot();
  }
  async function cancel() { await cancelPending(); return snapshot(); }
  function markUnavailable(message) { status = "unavailable"; error = message; return snapshot(); }

  return {
    request, load, refreshIdentity, begin, poll, cancel, logout, snapshot, markUnavailable,
    get session() { return session; },
    get user() { return user; },
    get status() { return status; },
  };
}

import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, unlink, stat} from 'node:fs/promises';
import path from 'node:path';

const valid = (value, etag) => Boolean(value && typeof value.catalog_version === 'string' &&
  typeof etag === "string" && /^"[^"\r\n]+"$/.test(etag) && Array.isArray(value.models) && value.models.every(item =>
    item && typeof item.model_id === 'string' && typeof item.type === 'string' &&
    typeof item.category === 'string' && typeof item.run_type_title === 'string' &&
    item.catalog_version === value.catalog_version && item.api_schema) &&
  new Set(value.models.map(item => item.model_id)).size === value.models.length);

/** Metadata only. Offline values never authorize execution, pricing or upload.
 * @param {{now?:()=>number,ttlMs?:number,offlineMaxAgeMs?:number,directory?:string,namespace?:string}} options
 */
export function createTaskCatalogCache({now = Date.now, ttlMs = 60_000,
  offlineMaxAgeMs = 86_400_000, directory, namespace = ''} = {}) {
  let entry;
  let generation = 0;
  let queue = Promise.resolve();
  const serial = fn => { const result = queue.then(fn, fn); queue = result.catch(() => {}); return result; };
  const filename = key => directory && path.join(directory, createHash('sha256').update(key).digest('hex') + '.json');
  async function restore(key) {
    if (!directory) return undefined;
    try {
      const file = filename(key);
      if ((await stat(file)).size > 16 * 1024 * 1024) return undefined;
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved.version !== 1 || saved.key !== key || !Number.isFinite(saved.verifiedAt) ||
          saved.verifiedAt > now() || now() - saved.verifiedAt > offlineMaxAgeMs || !valid(saved.value, saved.etag)) return undefined;
      return saved;
    } catch { return undefined; }
  }
  async function persist(value) {
    if (!directory) return;
    const file = filename(value.key), temp = file + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(directory, {recursive: true, mode: 0o700});
      await writeFile(temp, JSON.stringify({version: 1, ...value}), {mode: 0o600});
      await rename(temp, file);
    } catch { await unlink(temp).catch(() => {}); } // Disk cache is optional.
  }
  async function discard(key) {
    entry = undefined;
    if (directory) await unlink(filename(key)).catch(() => {});
  }
  return {
    clear() { entry = undefined; generation += 1; },
    read: input => serial(async () => {
      const {userId, load, allowOffline = false} = input;
      const key = JSON.stringify([namespace, userId, undefined]);
      const started = generation;
      const checkIdentity = () => { if (started !== generation) throw new Error('Account changed while loading model catalog.'); };
      const cached = entry?.key === key ? entry : await restore(key);
      checkIdentity();
      if (!input.forceRefresh && !allowOffline && entry?.key === key && cached && cached.expiresAt > now()) {
        entry = cached;
        return structuredClone({...cached.value, expiresAt:cached.expiresAt, offline:false});
      }
      let response;
      try { response = await load(cached?.etag); }
      catch (error) {
        checkIdentity();
        if (error.status === 401 || error.status === 403) await discard(key);
        // Only transport errors allow explicit, time-bounded offline browsing.
        if (allowOffline && error instanceof TypeError && cached && now() - cached.verifiedAt <= offlineMaxAgeMs) {
          entry = cached;
          return structuredClone({...cached.value, expiresAt: cached.expiresAt, offline: true, executionAllowed: false});
        }
        throw error;
      }
      checkIdentity();
      if (response.status === 304) {
        if (!cached) throw new Error('Model catalog cache is unavailable. Retry.');
        entry = {...cached, verifiedAt: now(), expiresAt: now() + ttlMs};
      } else {
        if (!response.ok) { await discard(key); throw new Error('Model catalog access is unavailable.'); }
        const value = await response.json();
        checkIdentity();
        const etag = response.headers.get('etag');
        if (!valid(value, etag)) { await discard(key); throw new Error('Model catalog could not be verified.'); }
        entry = {key, etag, value, verifiedAt: now(), expiresAt: now() + ttlMs};
      }
      const saved = entry;
      await persist(saved);
      checkIdentity();
      return structuredClone({...saved.value, expiresAt: saved.expiresAt, offline: false});
    }),
  };
}

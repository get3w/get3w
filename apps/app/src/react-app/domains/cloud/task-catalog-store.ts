import { useEffect, useSyncExternalStore } from "react";
import type { TaskCatalogSnapshot } from "./get3w-account";

let identity: string | undefined;
let snapshot: TaskCatalogSnapshot | null = null;
let pending: Promise<TaskCatalogSnapshot> | undefined;
let generation = 0;
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
export function resetTaskCatalog(userId?: string) {
  if (identity === userId) return;
  identity = userId; generation++; snapshot = null; pending = undefined; publish();
}
export function cachedTaskCatalog(userId: string) { return identity === userId ? snapshot : null; }
export function loadTaskCatalog(userId: string, refresh = false): Promise<TaskCatalogSnapshot> {
  resetTaskCatalog(userId);
  if (pending) return pending;
  if (!refresh && snapshot && !snapshot.offline && snapshot.expiresAt > Date.now()) return Promise.resolve(snapshot);
  const started = generation;
  const read = window.__GET3W_ACCOUNT__?.taskCatalog;
  if (!read) return Promise.reject(new Error("Model catalog unavailable"));
  const request = read({ userId, ...(refresh?{refresh:true}:{}) }).catch(() => read({ userId, offline: true })).then(value => {
    if (generation !== started) throw new Error("Account changed");
    snapshot = value; publish(); return value;
  }).finally(() => { if (generation === started) pending = undefined; });
  pending = request;
  return request;
}
export function useTaskCatalog(userId?: string) {
  const value = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => userId ? cachedTaskCatalog(userId) : null, () => null);
  useEffect(() => { if (userId) void loadTaskCatalog(userId).catch(() => {}); }, [userId]);
  return value;
}

import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";
import type { ServerConfig } from "./types.js";
import { runtimeDbPath } from "./runtime-db.js";

export type TaskPermissionMode = "default" | "full_access";
interface State { defaultMode: TaskPermissionMode; sessions: Record<string, TaskPermissionMode> }
const store = createWorkspaceKvStore<State>({
  tableName: "task_permission_modes", valueColumn: "state_json",
  parse(json) {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value) || !isRecord(value.sessions)) throw Error("Invalid permission settings");
    const sessions: Record<string, TaskPermissionMode> = {};
    for (const [key, mode] of Object.entries(value.sessions)) {
      if (mode !== "default" && mode !== "full_access") throw Error("Invalid permission mode");
      sessions[key] = mode;
    }
    if (value.defaultMode !== "default" && value.defaultMode !== "full_access") throw Error("Invalid default permission mode");
    return { defaultMode: value.defaultMode, sessions };
  }, serialize: JSON.stringify,
});
const queues = new Map<string, Promise<unknown>>();
function serial<T>(config: ServerConfig, run: () => Promise<T>): Promise<T> {
  const key = runtimeDbPath(config);
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}
const read = async (config: ServerConfig): Promise<State> => await store.get(config, "__local__") ?? { defaultMode: "default", sessions: {} };
export function taskPermissionSettings(config: ServerConfig, sessionId?: string) {
  return serial(config, async () => {
    const state = await read(config);
    return { defaultMode: state.defaultMode, mode: sessionId ? state.sessions[sessionId] ?? "default" : state.defaultMode };
  });
}
export function setTaskPermissionMode(config: ServerConfig, mode: TaskPermissionMode, sessionId?: string) {
  return serial(config, async () => {
    const state = await read(config);
    await store.set(config, "__local__", { defaultMode: mode, sessions: { ...state.sessions, ...(sessionId ? { [sessionId]: mode } : {}) } });
    return { mode, defaultMode: mode };
  });
}
export function initializeTaskPermissionMode(config: ServerConfig, sessionId: string, parentId?: string, fork = false) {
  return serial(config, async () => {
    const state = await read(config);
    if (Object.hasOwn(state.sessions, sessionId)) return;
    const mode = parentId && !fork ? state.sessions[parentId] ?? "default" : state.defaultMode;
    await store.set(config, "__local__", { ...state, sessions: { ...state.sessions, [sessionId]: mode } });
  });
}

/** Workspace startup sets only this session, never another workspace's defaults. */
export function setSessionPermissionMode(config: ServerConfig, mode: TaskPermissionMode, sessionId: string) {
  return serial(config, async () => {
    const state = await read(config);
    await store.set(config, "__local__", { ...state, sessions: { ...state.sessions, [sessionId]: mode } });
  });
}

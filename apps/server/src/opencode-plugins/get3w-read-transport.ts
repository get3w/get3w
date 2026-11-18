import type { SessionActivity } from "./session-activity.js";
import { AsyncLocalStorage } from "node:async_hooks";

export type Get3wEngine = "v1" | "v2";

/** Reads one engine through v1-shaped `/workspace/:id/opencode/*` paths. */
export type Get3wEngineReader = {
  engine: Get3wEngine;
  activity?(workspaceId: string, sessionId: string): Promise<SessionActivity>;
  get(path: string): Promise<unknown>;
};

/** Per-call host transport. Native plugins never inherit the host credential. */
export type Get3wReadTransport = {
  /** Engine `get` reads. Defaults to v1. */
  engine?: Get3wEngine;
  activity?(workspaceId: string, sessionId: string): Promise<SessionActivity>;
  get(path: string): Promise<unknown>;
  /** Read-only access to the other engine while both run; sessions created there stay findable. */
  other?: Get3wEngineReader;
  post(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  /** Writes the host allows on this transport; absent means read-only. */
  send?(method: "POST" | "PATCH" | "DELETE", path: string, body?: Record<string, unknown>): Promise<unknown>;
};

export const get3wReadTransport = new AsyncLocalStorage<Get3wReadTransport>();

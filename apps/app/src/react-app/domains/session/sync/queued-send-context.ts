import type { Get3wServerClient } from "@/app/lib/get3w-server";
import type { ModelRef } from "@/app/types";

export type QueuedSendContext = {
  owner?: string;
  workspaceId: string;
  workspaceRoot: string;
  opencodeBaseUrl: string;
  get3wToken: string;
  client: Get3wServerClient;
  agent: string | null;
  variant: string | null;
  model: ModelRef | null;
  environmentRuntimeKey: string | null;
  isCurrent?: () => boolean;
};

// Context is registered by the mounted surface (enqueueing only happens there)
// and consumed by the global drainer after the surface unmounts.
const queuedSendContexts = new Map<string, QueuedSendContext>();
const listeners = new Set<() => void>();

export function setQueuedSendContext(sessionId: string, context: QueuedSendContext) {
  queuedSendContexts.set(sessionId, context);
  for (const listener of listeners) listener();
}

export function getQueuedSendContext(sessionId: string) {
  return queuedSendContexts.get(sessionId);
}

export function clearQueuedSendContext(sessionId: string) {
  if (!queuedSendContexts.delete(sessionId)) return;
  for (const listener of listeners) listener();
}

export function subscribeQueuedSendContext(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

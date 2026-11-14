import type { WorkspaceInfo } from "./types.js";

export type TaskLogExchange = {
  workspaceId: string; directory: string; engine: "v1" | "v2";
  userId?: string; method: string; path: string; request: unknown; response: unknown; status: number;
};
declare global {
  var __get3wTaskLogs: { captureEvidence?: (sessionId: string, input: Record<string, unknown>) => Promise<void>; identity?: () => string | undefined; capture: (exchange: TaskLogExchange) => Promise<void> } | undefined;
}
/** Capture at the service boundary, including automation calls. Never consume live responses. */
export async function captureTaskLogExchange(
  workspace: WorkspaceInfo, engine: "v1" | "v2", path: string,
  request: Request, send: () => Promise<Response>,
): Promise<Response> {
  const host = globalThis.__get3wTaskLogs;
  if (!host || request.method === "GET" || request.method === "HEAD") return send();
  const userId = host.identity?.();
  const body = await request.clone().json().catch(() => null);
  const response = await send();
  if (response.headers.get("content-type")?.includes("application/json")) {
    const clone = response.clone();
    await clone.json().then((payload: unknown) => host.capture({ workspaceId: workspace.id,
      directory: workspace.path, engine, method: request.method, path,
      userId, request: body, response: payload, status: response.status })).catch(() => {});
  } else {
    await host.capture({ workspaceId: workspace.id, directory: workspace.path, engine,
      method: request.method, path, userId, request: body, response: null, status: response.status }).catch(() => {});
  }
  return response;
}

/** Explicit ownership only; titles and prompt content never determine purpose. */
export function isAlwaysOnTaskSession(workspaceType: string | undefined, workspaceId: string, sessionId: string, session: unknown, runnerSessionId?: string | null): boolean {
  if (workspaceType !== "always-on") return false;
  if (runnerSessionId === sessionId) return true;
  return typeof session === "object" && session !== null &&
    Reflect.get(session, "id") === sessionId && Reflect.get(session, "get3wPurpose") === "task" && Reflect.get(session, "get3wTaskId") === workspaceId;
}

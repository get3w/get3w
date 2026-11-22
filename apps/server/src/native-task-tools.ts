declare global {
  var __get3wPrepareTaskTools: ((workspaceId: string, sessionId: string) => Promise<void>) | undefined;
}

/** Desktop installs this in process; remote clients cannot provide a callback. */
export async function prepareNativeTaskTools(workspaceId: string, sessionId: string) {
  await globalThis.__get3wPrepareTaskTools?.(workspaceId, sessionId);
}

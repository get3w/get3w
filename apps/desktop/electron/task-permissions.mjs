/** Only the trusted main renderer may invoke this bridge through main.mjs. */
export function createTaskPermissionBridge({getServerInfo, fetchImpl = fetch}) {
  return async input => {
    if (!input || !['read', 'set', 'revoke', 'cost-set'].includes(input.action)
      || (input.workspaceId && !/^[\w-]{1,100}$/.test(input.workspaceId))
      || (input.sessionId && (!input.workspaceId || !/^[\w-]{1,256}$/.test(input.sessionId)))) throw Error('Invalid permission scope');
    if (input.action === 'set' && (!['default', 'full_access'].includes(input.mode) || (input.mode === 'full_access' && input.confirmed !== true))) throw Error('Permission confirmation required');
    const info = await getServerInfo();
    const base = new URL(info.baseUrl || 'http://invalid');
    if (!info.running || !info.hostToken || base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw Error('Permission service unavailable');
    const response = await fetchImpl(new URL('/task-permissions', base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {'X-Get3W-Host-Token': info.hostToken, 'content-type': 'application/json'},
      body: JSON.stringify({action: input.action, workspaceId: input.workspaceId, sessionId: input.sessionId, mode: input.mode, confirmed: input.confirmed, index: input.index, grant: input.grant, policy: input.policy}),
    });
    if (!response.ok) throw Error('Permission settings could not be updated');
    return response.json();
  };
}

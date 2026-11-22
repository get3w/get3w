/** Use the signed-in account's existing grants, without copying credentials. */
export function createPrepareTaskTools({auth, models, tools}) {
  return async (workspaceId, sessionId) => {
    const account = await auth.status();
    if (account.status !== 'signed_in' || !account.user?.id) throw Error('Sign in to Get3W before running this task.');
    const userId = account.user.id;
    const connection = await models.reconcile(account);
    if (!connection.enabled || connection.state !== 'connected') throw Error('Get3W model connection is not ready.');
    const result = await tools.run({userId, workspaceId, sessionId, action:'enable'});
    const latest = await auth.status();
    if (latest.status !== 'signed_in' || latest.user?.id !== userId) throw Error('Get3W account changed. Retry the task.');
    if (!result.enabled || result.state !== 'configured') throw Error('Get3W task tools are not ready.');
  };
}

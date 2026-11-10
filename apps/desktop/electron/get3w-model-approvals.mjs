/** Narrow main-process bridge. Host credentials never enter the renderer. */
export function createModelApprovalBridge({getServerInfo, fetchImpl=fetch}) {
  return async input => {
    if (!input || !/^[\w-]{1,100}$/.test(input.workspaceId ?? '') || !/^[\w-]{16,100}$/.test(input.sessionId ?? '')
      || !['list','respond'].includes(input.action)) throw Error('Invalid approval scope.');
    const info=await getServerInfo(), base=new URL(info.baseUrl || 'http://invalid');
    if (!info.running || !info.hostToken || base.protocol!=='http:' || base.hostname!=='127.0.0.1'
      || base.pathname!=='/' || base.username || base.password || base.search || base.hash) throw Error('Local approval service is unavailable.');
    const headers={'X-Get3W-Host-Token':info.hostToken,'Content-Type':'application/json'};
    async function request(path, body) {
      const response=await fetchImpl(`${base.origin}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers,...(body?{body:JSON.stringify(body)}:{})});
      if (!response.ok) throw Error('Approval is no longer available. Refresh and retry.');
      return response.json();
    }
    const pending=await request('/approvals');
    if (!Array.isArray(pending.items)) throw Error('Invalid approval response.');
    const items=pending.items.filter(item=>item.action==='model.submit' && item.workspaceId===input.workspaceId && item.modelTask?.sessionId===input.sessionId);
    if (input.action==='respond') {
      if (!['allow','deny'].includes(input.reply) || !items.some(item=>item.id===input.id)) throw Error('Approval does not belong to this conversation.');
      await request(`/approvals/${encodeURIComponent(input.id)}`,{reply:input.reply});
    }
    // Never return actor details, host tokens, or unrelated workspace requests.
    return {items:items.filter(item=>input.action!=='respond'||item.id!==input.id).map(({id,workspaceId,modelTask})=>({id,workspaceId,modelTask}))};
  };
}

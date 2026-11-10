import { randomUUID } from 'node:crypto';
import { classifyAutomationExecutionError, executeDesktopAutomation } from './automation-runner.mjs';

/** The native account owns the transport; no renderer token or arbitrary endpoint is accepted. */
export function createPersonalAutomationRunner({auth,getLocalRuntime,getWorkspaceIds,execute=executeDesktopAutomation,intervalMs=30000,heartbeatMs=10000,heartbeatMissLimit=3,reportRetryMs=1000,receiptJournal,log=(_message)=>{}}) {
  const runnerId='desktop_'+randomUUID();
  const errorCodes=new Set(['owner_membership_lost','model_access_lost','provider_unavailable','connect_access_unavailable','openwork_web_access_required','execution_runtime_unavailable','execution_failed','execution_timed_out','runner_unavailable','cancelled','lease_lost','internal_error','connection_action_required']);
  const pending=new Map();
  const journal=receiptJournal??{list:async userId=>[...pending.values()].filter(entry=>entry.userId===userId),put:async entry=>{pending.set(entry.runId,entry);},remove:async runId=>{pending.delete(runId);}};
  let timer, controller, stopped=true, busy=false;
  async function tick() {
    if(stopped||busy)return;
    busy=true;
    try {
      const account=await auth.status();
      if(stopped||account.status!=='signed_in'||!account.user)return;
      const userId=account.user.id;
      await journal.prepare?.();
      // Recover completed results first, including receipts from an earlier app boot.
      // A different signed-in account can neither read nor publish these entries.
      for(const entry of pending.values()) {if(entry.userId===userId)await journal.put(entry);}
      for(const entry of await journal.list(userId)) {
        const current=await auth.status();
        if(stopped||current.status!=='signed_in'||current.user?.id!==userId)return;
        await auth.automationReport(userId,entry.runId,entry.runnerId,entry.body);
        await journal.remove(entry.runId);pending.delete(entry.runId);
      }
      const assignment=await auth.automationWork(userId,runnerId,getWorkspaceIds ? await getWorkspaceIds() : undefined);
      if(!assignment||stopped)return;
      controller=new AbortController();
      const runController=controller;
      const {run,revision,automation}=assignment;
      const thread = output => ({id:output.sessionId,threadKind:'automation',executionLocation:'desktop',
        automationId:automation.id,automationRunId:run.id,engineKind:'opencode',nativeThreadId:output.sessionId,workspaceId:output.workspaceId});
      const report=async body=>{
        const current=await auth.status();
        if(current.status!=='signed_in'||current.user?.id!==userId){runController.abort();throw Error('The signed-in account changed.');}
        const response=await auth.automationReport(userId,run.id,runnerId,body);
        if(response?.run?.cancelRequestedAt) runController.abort(new Error('Automation cancellation requested.'));
        return response;
      };
      const finish=async body=>{
        const entry={userId,runId:run.id,runnerId,body};
        // Keep an in-memory copy even if the keychain or disk is temporarily unavailable.
        pending.set(run.id,entry);
        await journal.put(entry);

        // A response may be lost after the server committed it. Re-send the same
        // receipt; never execute the task again or replace success with failure.
        for(let attempt=0;attempt<3;attempt++) {
          try {const response=await report(body);await journal.remove(run.id);pending.delete(run.id);return response;}
          catch(error) {
            if(attempt===2)throw error;
            await new Promise(resolve=>setTimeout(resolve,reportRetryMs));
          }
        }
      };
      let heartbeat, heartbeatStopped=false, heartbeatMisses=0;
      const scheduleHeartbeat=()=>{
        if(heartbeatStopped||runController.signal.aborted)return;
        heartbeat=setTimeout(async()=>{
          try {await report({status:'running'});heartbeatMisses=0;}
          catch {if(++heartbeatMisses>=heartbeatMissLimit)runController.abort(Object.assign(new Error('Automation heartbeat unavailable.'),{code:'lease_lost'}));}
          scheduleHeartbeat();
        },heartbeatMs);
      };
      try {
        await report({status:'running'});
        scheduleHeartbeat();
        const result=await execute({automationName:automation.name,workspaceId:revision.workspaceId,
          instructions:revision.instructions,model:revision.model,timeoutMs:revision.maximumRuntimeMs},
          {getLocalRuntime,signal:runController.signal,onThreadCreated:output=>report({status:'running',executionThread:thread(output)})});
        heartbeatStopped=true;clearTimeout(heartbeat);
        const blocker=result.connectionBlocker;
        const error=blocker ? {code:'connection_action_required',retryable:false,
          message:`${blocker.connectionName} ${blocker.state==='needs_connection' ? 'is not connected' : 'needs to be reconnected'}. Open connections in Get3W, reconnect it, then run this automation again.`} : undefined;
        await finish({status:blocker ? 'failed' : 'succeeded',resultSummary:result.resultSummary,usage:result.usage,
          ...(error?{error}:{}),executionThread:thread(result)}).catch(()=>{});
      } catch(error) {
        heartbeatStopped=true;clearTimeout(heartbeat);
        const failedThread=typeof error?.sessionId==='string' ? thread({sessionId:error.sessionId,workspaceId:error.workspaceId??revision.workspaceId}) : null;
        const classified=classifyAutomationExecutionError(error);
        const code=classified.code!=='execution_failed' ? classified.code : errorCodes.has(error?.code) ? error.code : classified.code;
        await finish({status:'failed',...(failedThread?{executionThread:failedThread}:{}),error:{code,message:String(classified.message||'Automation execution failed').slice(0,2000),retryable:false}}).catch(()=>{});
      } finally {heartbeatStopped=true;clearTimeout(heartbeat);controller=null;}
    } catch(error) { log("Personal automation runner could not continue: "+String(error?.message||error)); }
    finally {busy=false;}
  }
  return {start(){if(!stopped)return;stopped=false;timer=setInterval(()=>void tick(),intervalMs);void tick();},stop(){stopped=true;clearInterval(timer);controller?.abort();},wake(){void tick();}};
}

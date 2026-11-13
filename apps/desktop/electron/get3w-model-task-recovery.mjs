import {createModelTaskPoller} from './get3w-model-task-poller.mjs';
/** Restart recovery under a freshly verified identity; resubmits only persisted approved keys. */
export function createModelTaskRecovery({auth,journal,scope,onResult=()=>{}}) {
  const resultCapabilities=new Map();
  const lifetime=new AbortController();
  const activeRequests=new Map();
  async function call(name,args,sessionId,signal) {
    signal.throwIfAborted();
    const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}};
    const response=await auth.mcp({userId:scope.userId,sessionId,method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:Buffer.from(JSON.stringify(request)),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    try {
      signal.throwIfAborted();
      if(!response.response.ok)throw Error('Model task could not reconnect.');
      const payload=await response.response.json();
      signal.throwIfAborted();
      if(payload.error || payload.result?.isError)throw Error('Model task read was rejected.');
      return payload;
    } finally {response.release?.();}
  }
  async function recover(row,signal){
      const scopeKey="personal-v1";
      let resultCapability=resultCapabilities.get(scopeKey);
      if (!row.requestId) {
        try { return await auth.submitPersonal({userId:scope.userId,arguments:row.arguments,signal}); }
        catch(error) {
          if(error?.definitive) return {status:"failed",error:{code:error.code,message:error.message}};
          throw error;
        }
      }
      if(!resultCapability) {
        const discovery=await call('search_capabilities',{query:'get3w.result',limit:100},row.scope.sessionId,signal);
        resultCapability=discovery.result?.structuredContent?.data?.find(item=>item.handler==='get3w.result' && item.enabled!==false)?.name;
        if(!resultCapability)throw Error('Result retrieval is unavailable.');
        resultCapabilities.set(scopeKey,resultCapability);
      }
      const payload=await call('execute_capability',{name:resultCapability,arguments:{request_id:row.requestId},idempotency_key:`result-${row.requestId}`},row.scope.sessionId,signal);
      const structured=payload.result?.structuredContent;
      if(structured?.status!=='succeeded')throw Error('Model result unavailable.');
      return structured.result;
  }
  const poller=createModelTaskPoller({
    list:async()=>(await journal.listConnection(scope)).filter(row=>!journal.isSubmitting?.(row.key)),
    read:async row=>{
      const controller=new AbortController();
      activeRequests.set(row.key,controller);
      const signal=AbortSignal.any([lifetime.signal,controller.signal]);
      try{return await recover(row,signal);}
      finally{if(activeRequests.get(row.key)===controller)activeRequests.delete(row.key);}
    },
    save:async(row,result)=>{await journal.observe(row.scope,row.requestId?{type:'get3w.result',call:{arguments:{request_id:row.requestId}}}:{type:'get3w.submit',call:{arguments:row.arguments}},{result:{structuredContent:{status:'succeeded',result}}});await onResult();},
  });
  const timer=setInterval(()=>void poller.tick().catch(()=>{}),1000);
  timer.unref?.();
  return {cancel(key){activeRequests.get(key)?.abort();},close(){clearInterval(timer);poller.stop();lifetime.abort();}};
}

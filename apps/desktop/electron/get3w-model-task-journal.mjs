import {assertModelBudget} from './get3w-model-budget.mjs';
import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,open} from 'node:fs/promises';
import path from 'node:path';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal=new Set(['completed','failed']);
/** Persist before dispatch. An interrupted submit keeps its original key and payload. */
export function createModelTaskJournal({userData,limitUsd}) {
  const file=path.join(userData,'get3w-model-tasks.json');
  let records,queue=Promise.resolve();const submitting=new Set();
  /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.then(()=>{},()=>{});return next;};
  async function load() {
    if(records)return;
    try {
      const value=JSON.parse(await readFile(file,'utf8'));
      if(![1,2,3].includes(value.version) || !Array.isArray(value.records))throw Error('Invalid journal');
      records=value.records;
      if(value.version===1) for(const row of records) if(row.result && !row.outputEntry) row.outputEntry=makeOutputEntry(row);
    }catch(error){if(error.code!=='ENOENT')throw Error('Model task history could not be restored. Paid submissions are blocked.');records=[];}
  }
  function makeOutputEntry(row) {
    return {
      id: row.key,
      userId: row.scope.userId,
      workspaceId: row.scope.workspaceId,
      sessionId: row.scope.sessionId ?? null,
      messageId: row.messageId ?? null,
      requestId: row.requestId ?? null,
      slug: row.arguments?.slug ?? null,
      status: row.result?.status ?? row.status,
      files: row.outputEntry?.files ?? [],
      downloadError: row.outputEntry?.downloadError ?? null,
      outputs: Array.isArray(row.result?.outputs) ? row.result.outputs : [],
      structured: row.result ?? null,
      charged: row.result?.charged ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  async function save() {
    await mkdir(userData,{recursive:true});
    const handle=await open(file+'.tmp','w',0o600);
    try{await handle.writeFile(JSON.stringify({version:3,records}));await handle.sync();}finally{await handle.close();}
    await rename(file+'.tmp',file);
    if(process.platform!=='win32'){const folder=await open(userData,'r');try{await folder.sync();}finally{await folder.close();}}
  }
  // Rows written under a retired organization scope stay on disk but are never served.
  const personal=row=>row.scope.organizationId===undefined;
  const owns=(row,scope)=>personal(row)&&['userId','workspaceId','sessionId'].every(key=>row.scope[key]===scope[key]);
  function stopped(scope,context) {
    return records.some(row=>owns(row,scope)&&row.status==='detached'&&(
      (context.type==='get3w.result'&&row.requestId===context.call.arguments.request_id)||
      context.type==='get3w.submit'));
  }
  return {
    isSubmitting:key=>submitting.has(key),
    releaseSubmit:(scope,context)=>submitting.delete(hash([scope,context.call.arguments.idempotency_key])),
    isStopped:(scope,context)=>serial(async()=>{await load();return stopped(scope,context);}),
    beforeSubmit:(scope,context)=>serial(async()=>{
      await load();
      if(stopped(scope,context))throw Error('Model task stopped waiting. Do not retry or continue dependent steps.');
      const args=context.call.arguments;
      const key=hash([scope,args.idempotency_key]);
      const old=records.find(row=>row.key===key);
      if(old) {
        const rejectedQuote=old.status==='failed'&&!old.requestId&&['quote_expired','quote_stale'].includes(old.result?.error?.code);
        if(rejectedQuote&&old.arguments.slug===args.slug&&hash(old.arguments.inputs)===hash(args.inputs)){
          assertModelBudget(records.filter(row=>row!==old),scope,context,limitUsd);
          Object.assign(old,{payloadHash:context.hash,arguments:args,quote:context.quote,status:'submitting',result:undefined,outputEntry:undefined,updatedAt:Date.now()});
          await save();
        }else if(old.payloadHash!==context.hash)throw Error('idempotency_conflict');
        submitting.add(key);return old.key;
      }
      assertModelBudget(records,scope,context,limitUsd);
      records.push({key,...(context.nativeMedia?{nativeMedia:context.nativeMedia}:{}),scope:{...scope},messageId:context.messageId ?? null,payloadHash:context.hash,arguments:args,quote:context.quote,status:'submitting',requestId:null,createdAt:Date.now(),updatedAt:Date.now()});
      await save();submitting.add(key);return key;
    }),
    observe:(scope,context,payload)=>serial(async()=>{
      await load();
      if(!context || payload?.error || payload?.result?.isError)return;
      const structured=payload?.result?.structuredContent;
      const value=structured?.result ?? structured;
      if(!value || typeof value!=='object')return;
      let row;
      if(context.type==='get3w.submit')row=records.find(row=>owns(row,scope)&&row.arguments.idempotency_key===context.call.arguments.idempotency_key);
      if(context.type==='get3w.result')row=records.find(row=>owns(row,scope)&&row.requestId===context.call.arguments.request_id);
      if(!row)return;
      const requestId=value.request_id??value.id;
      if(typeof requestId==='string')row.requestId=requestId;
      if(typeof value.status==='string' && row.status!=='detached')row.status=value.status;
      if(terminal.has(value.status)){
        if(!row.result&&row.nativeMedia?.traceId){
          const duration=value.timings?.total;
          console.info('[get3w-media-timing]',JSON.stringify({traceId:row.nativeMedia.traceId,stage:Number.isFinite(duration)?'upstream_generation':'upstream_observed',durationMs:Number.isFinite(duration)?duration:Date.now()-(row.submittedAt??row.createdAt)}));
        }
        row.result=value;if(row.status!=='detached')row.status=value.status;
        row.outputEntry={...makeOutputEntry(row),updatedAt:Date.now()};
      }
      if(context.type==='get3w.submit'&&row.requestId&&!row.submittedAt)row.submittedAt=Date.now();
      row.retryAfter=typeof value.retry_after==='number'?Math.max(1,Math.min(300,value.retry_after)):3;
      row.updatedAt=Date.now();await save();
    }),
    updateOutput:(scope,key,patch)=>serial(async()=>{await load();const row=records.find(row=>owns(row,scope)&&row.key===key);if(!row)throw Error("Task not found");row.outputEntry={...makeOutputEntry(row),...patch,updatedAt:Date.now()};await save();}),
    refresh:(scope,key)=>serial(async()=>{await load();const row=records.find(row=>owns(row,scope)&&row.key===key);if(!row||!row.requestId)throw Error("Task not found");row.status="processing";if(row.outputEntry)row.outputEntry.downloadError=null;row.updatedAt=Date.now();await save();}),
    listConnection:scope=>serial(async()=>{await load();return records.filter(row=>personal(row) && ["userId","workspaceId"].every(key=>row.scope[key]===scope[key])).map(row=>structuredClone(row));}),
    list:scope=>serial(async()=>{await load();return records.filter(row=>owns(row,scope)).map(row=>structuredClone(row));}),
    resume:(scope,key)=>serial(async()=>{await load();const row=records.find(row=>owns(row,scope)&&row.key===key);if(!row)throw Error("Task not found");if(row.status==="detached"){row.status=row.requestId?"processing":"submitting";row.updatedAt=Date.now();await save();}}),
    detach:(scope,key)=>serial(async()=>{await load();const row=records.find(row=>owns(row,scope)&&row.key===key);if(!row)throw Error('Task not found');if(!terminal.has(row.status)){row.status='detached';row.updatedAt=Date.now();await save();}}),
  };
}

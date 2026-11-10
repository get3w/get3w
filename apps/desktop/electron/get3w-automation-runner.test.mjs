import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPersonalAutomationRunner} from './get3w-automation-runner.mjs';
test('personal runner claims once and reports the actual local session',async()=>{
 let claims=0;const reports=[];let resolve;const done=new Promise(r=>resolve=r);
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>{claims++;return {run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'write report',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}},automationReport:async(uid,id,runner,body)=>{reports.push(body);if(body.status==='succeeded')resolve();}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),execute:async()=>({sessionId:'native-session',workspaceId:'workspace',resultSummary:'Report completed',usage:{inputTokens:1,outputTokens:2,costMicros:null}}),intervalMs:100000});
 runner.start();await done;runner.stop();assert.equal(claims,1);assert.equal(reports[1].executionThread.nativeThreadId,'native-session');assert.equal(reports[1].status,'succeeded');
});
test('account changes abort an active run and cannot publish to the next account',async()=>{
 let account='alice';let resolve;const done=new Promise(r=>resolve=r);let reports=0;
 const auth={status:async()=>({status:'signed_in',user:{id:account}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async()=>{reports++;}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,heartbeatMs:5,execute:async(_,options)=>{
  account='bob';await new Promise(r=>options.signal.addEventListener('abort',r,{once:true}));resolve();throw Error('aborted');
 }});
 runner.start();await done;runner.stop();assert.equal(reports,1);
});
test('a lost terminal response retries the receipt without repeating execution or reporting failure',async()=>{
 let executions=0,attempts=0;const reports=[];let resolve;const done=new Promise(r=>resolve=r);
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{
  reports.push(body);if(body.status==='succeeded'){attempts++;if(attempts===1)throw Error('response lost');resolve();}
 }};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,reportRetryMs:1,execute:async()=>{executions++;return {sessionId:'native',workspaceId:'workspace',resultSummary:'Done',usage:{inputTokens:1,outputTokens:1,costMicros:null}};}});
 runner.start();await done;runner.stop();assert.equal(executions,1);assert.equal(attempts,2);assert.equal(reports.some(body=>body.status==='failed'),false);assert.deepEqual(reports[1],reports[2]);
});
test('executor acknowledges cancellation after aborting the local task',async()=>{
 let running=0,resolve;const done=new Promise(r=>resolve=r);let aborted=false;
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{
  if(body.status==='running')return {run:{cancelRequestedAt:++running>1?123:null}};
  if(body.status==='failed'){assert.equal(aborted,true);resolve();return {run:{status:'cancelled'}};}
 }};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,heartbeatMs:5,execute:async(_,options)=>{
  await new Promise(r=>options.signal.addEventListener('abort',r,{once:true}));aborted=true;throw Error('cancelled');
 }});
 runner.start();await done;runner.stop();assert.equal(aborted,true);
});
test('execution receipts preserve actionable runtime error codes',async()=>{
 let resolve;const done=new Promise(r=>resolve=r);let failure;
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{if(body.status==='failed'){failure=body.error;resolve();}}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,execute:async()=>{throw Object.assign(new Error('Provider unavailable'),{code:'provider_unavailable'});}});
 runner.start();await done;runner.stop();assert.equal(failure.code,'provider_unavailable');assert.equal(failure.message,'Provider unavailable');
});
test('a transient heartbeat failure recovers without overlapping probes or aborting execution',async()=>{
 let probes=0,inFlight=0,maxInFlight=0,resolveHealthy,resolveDone;
 const healthy=new Promise(r=>resolveHealthy=r),done=new Promise(r=>resolveDone=r);
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{
  if(body.status==='succeeded'){resolveDone();return;}
  probes++;if(probes===1)return;
  inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
  try {await new Promise(r=>setTimeout(r,15));if(probes===2)throw Error('temporary outage');resolveHealthy();}finally{inFlight--;}
 }};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,heartbeatMs:2,execute:async(_,options)=>{
  await healthy;assert.equal(options.signal.aborted,false);return {sessionId:'native',workspaceId:'workspace',resultSummary:'Done',usage:{inputTokens:1,outputTokens:1,costMicros:null}};
 }});
 try{runner.start();await done;assert.equal(maxInFlight,1);}finally{runner.stop();}
});
test('consecutive heartbeat failures stop execution at the configured threshold',async()=>{
 let probes=0,resolve;const done=new Promise(r=>resolve=r);
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{
  if(body.status==='failed'){resolve();return;}
  if(++probes>1)throw Error('offline');
 }};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,heartbeatMs:2,heartbeatMissLimit:3,execute:async(_,options)=>{
  await new Promise(r=>options.signal.addEventListener('abort',r,{once:true}));assert.equal(probes,4);throw options.signal.reason;
 }});
 try{runner.start();await done;assert.equal(probes,4);}finally{runner.stop();}
});
test('restarting the runner replays a durable terminal receipt without rerunning the task',async()=>{
 const entries=new Map();let online=false,executions=0,claims=0,resolve;
 const recovered=new Promise(r=>resolve=r);
 const journal={list:async uid=>[...entries.values()].filter(entry=>entry.userId===uid),put:async entry=>{entries.set(entry.runId,entry);},remove:async id=>{entries.delete(id);}};
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>{claims++;return claims===1?{run:{id:'durable-run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'test'},maximumRuntimeMs:10000}}:null;},automationReport:async(uid,id,runner,body)=>{
  if(body.status==='running')return;
  if(!online)throw Error('offline');
  assert.equal(body.status,'succeeded');assert.equal(body.resultSummary,'Completed while offline');resolve();
 }};
 const options={auth,receiptJournal:journal,getLocalRuntime:async()=>({}),intervalMs:100000,reportRetryMs:1,execute:async()=>{executions++;return {sessionId:'native',workspaceId:'workspace',resultSummary:'Completed while offline'};}};
 const first=createPersonalAutomationRunner(options);first.start();
 while(entries.size===0)await new Promise(r=>setTimeout(r,1));
 await new Promise(r=>setTimeout(r,15));first.stop();online=true;
 const second=createPersonalAutomationRunner(options);
 try{second.start();await recovered;assert.equal(executions,1);}finally{second.stop();}
});
test('raw missing-model errors receive the same recovery classification as OpenWork',async()=>{
 let resolve;const done=new Promise(r=>resolve=r);let failure;
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'missing'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{if(body.status==='failed'){failure=body.error;resolve();}}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,execute:async()=>{throw Object.assign(Error('Model not found: test/missing'),{code:'http_error'});}});
 try{runner.start();await done;assert.equal(failure.code,'model_access_lost');assert.match(failure.message,/Choose a supported model/);}finally{runner.stop();}
});
test('a required connector failure cannot become a successful automation receipt',async()=>{
 let resolve;const done=new Promise(r=>resolve=r);let terminal;
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'model'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{if(body.status!=='running'){terminal=body;resolve();}}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,execute:async()=>({sessionId:'native',workspaceId:'workspace',resultSummary:'Could not read Slack',usage:{inputTokens:1,outputTokens:2,costMicros:null},connectionBlocker:{connectionId:'slack',connectionName:'Slack',state:'reauth_required'}})});
 try{runner.start();await done;assert.equal(terminal.status,'failed');assert.equal(terminal.error.code,'connection_action_required');assert.match(terminal.error.message,/Slack needs to be reconnected/);assert.equal(terminal.resultSummary,'Could not read Slack');}finally{runner.stop();}
});
test('unrecognized engine codes cannot break the shared receipt schema',async()=>{
 let resolve;const done=new Promise(r=>resolve=r);let terminal;
 const auth={status:async()=>({status:'signed_in',user:{id:'alice'}}),automationWork:async()=>({run:{id:'run'},automation:{id:'auto',name:'Report'},revision:{instructions:'test',workspaceId:'workspace',model:{providerId:'test',modelId:'model'},maximumRuntimeMs:10000}}),automationReport:async(uid,id,runner,body)=>{if(body.status!=='running'){terminal=body;resolve();}}};
 const runner=createPersonalAutomationRunner({auth,getLocalRuntime:async()=>({}),intervalMs:100000,execute:async()=>{throw Object.assign(Error('Engine refused the request'),{code:'http_error'});}});
 try{runner.start();await done;assert.equal(terminal.error.code,'execution_failed');assert.equal(terminal.error.message,'Engine refused the request');}finally{runner.stop();}
});

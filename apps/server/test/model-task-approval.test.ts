import {test} from "bun:test";
import assert from "node:assert/strict";
import {ApprovalService} from "../src/approvals.js";
import {modelTaskApprovalDecision} from "../src/model-task-approval.js";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {persistModelApprovalCommitments, restoreModelApprovalCommitments} from "../src/model-approval-commitments.js";
import type {ServerConfig} from "../src/types.js";

const quote = {quoteId:"q",slug:"p/m/type",sessionId:"s",amountUsd:"0.100000",expiresAt:200};
const policy = {autoApproveBelowUsd:"0.2",maxSessionUsd:"1"};
test("exact decimal threshold and committed session spend",()=>{
 assert.equal(modelTaskApprovalDecision({quote,policy,sessionCommittedUsd:"0.9",now:100}),"allow");
 assert.equal(modelTaskApprovalDecision({quote,policy,sessionCommittedUsd:"0.900001",now:100}),"ask");
 assert.equal(modelTaskApprovalDecision({quote:{...quote,amountUsd:"0.2"},policy,sessionCommittedUsd:"0",now:100}),"ask");
 for(const amountUsd of ["NaN","-1","1e-3","0.0000001"]){
  assert.throws(()=>modelTaskApprovalDecision({quote:{...quote,amountUsd},policy,sessionCommittedUsd:"0",now:100}));
 }
 assert.throws(()=>modelTaskApprovalDecision({quote,policy,sessionCommittedUsd:"0",now:200}));
});
test("paid task approval cannot inherit generic auto mode",async()=>{
 const service=new ApprovalService({mode:"auto",timeoutMs:1000});
 const pending=service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote,
  policy:{...policy,autoApproveBelowUsd:"0"},sessionCommittedUsd:"0",now:()=>100});
 const [request]=service.list();assert.equal(request.action,"model.submit");
 assert.ok(request.summary.includes("continues and is billed"));
 service.respond(request.id,"deny");assert.equal((await pending).allowed,false);
});
test("approved quote is checked again after review",async()=>{
 const service=new ApprovalService({mode:"auto",timeoutMs:1000});let time=100;
 const pending=service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote,
  policy:{...policy,autoApproveBelowUsd:"0"},sessionCommittedUsd:"0",now:()=>time});
 const [request]=service.list();time=200;service.respond(request.id,"allow");
 assert.equal((await pending).reason,"quote_expired");assert.equal(service.list().length,0);
});
test("approved model spend is retained by host for the next quote",async()=>{
 const service=new ApprovalService({mode:"auto",timeoutMs:1000});
 const first={...quote,amountUsd:"0.100000",sessionId:"retained"};
 assert.equal((await service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote:first,policy:{autoApproveBelowUsd:"0.2",maxSessionUsd:"0.15"},sessionCommittedUsd:"0",now:()=>100})).allowed,true);
 const second={...quote,quoteId:"q2",amountUsd:"0.100000",sessionId:"retained"};
 const pending=service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote:second,policy:{autoApproveBelowUsd:"0.2",maxSessionUsd:"0.15"},sessionCommittedUsd:"0",now:()=>100});
 assert.equal(service.list().length,1);
 const [request]=service.list(); service.respond(request.id,"deny");
 assert.equal((await pending).reason,"denied");
 assert.equal(service.committedSessionUsd("w","retained"),"0.100000");
});
test("caller committed amount cannot poison a fresh host session",async()=>{
 const service=new ApprovalService({mode:"auto",timeoutMs:1000});
 const result=await service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote,policy:{autoApproveBelowUsd:"0.2",maxSessionUsd:"0.15"},sessionCommittedUsd:"999",now:()=>100});
 assert.equal(result.allowed,true);
 assert.equal(service.committedSessionUsd("w",quote.sessionId),"0.100000");
});
test("commitment snapshots round-trip and reject malformed state",async()=>{
 const service=new ApprovalService({mode:"auto",timeoutMs:1000});
 await service.requestModelTaskApproval({workspaceId:"w",actor:{type:"host"},quote,policy,sessionCommittedUsd:"0",now:()=>100});
 const snapshot=service.exportModelCommitments();
 const restored=new ApprovalService({mode:"auto",timeoutMs:1000});
 restored.importModelCommitments(snapshot);
 assert.equal(restored.committedSessionUsd("w","s"),"0.100000");
 assert.throws(()=>restored.importModelCommitments({version:1,sessions:{"bad":"NaN"}}));
 assert.throws(()=>restored.importModelCommitments({version:2,sessions:{}}));
});
test("approved commitments survive the workspace KV store", async()=>{
 const root=await mkdtemp(join(tmpdir(),"get3w-approval-"));
 const config={configPath:join(root,"server.json")} as ServerConfig;
 const service=new ApprovalService({mode:"auto",timeoutMs:1000},{persistModelCommitments:()=>persistModelApprovalCommitments(config,service)});
 await service.requestModelTaskApproval({workspaceId:"workspace-a",actor:{type:"host"},quote,policy,sessionCommittedUsd:"0",now:()=>100});
 const restored=new ApprovalService({mode:"auto",timeoutMs:1000});
 assert.equal(await restoreModelApprovalCommitments(config,restored),true);
 assert.equal(restored.committedSessionUsd("workspace-a","s"),"0.100000");
 assert.equal(restored.committedSessionUsd("workspace-b","s"),"0");
});

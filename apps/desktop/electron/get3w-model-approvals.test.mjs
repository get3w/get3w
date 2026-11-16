import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelApprovalBridge} from './get3w-model-approvals.mjs';
test('approval bridge scopes both listing and replies without exposing credentials',async()=>{
 const writes=[];
 const request=createModelApprovalBridge({getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'secret'}),fetchImpl:async(url,options)=>{
  assert.equal(options.headers['X-Get3W-Host-Token'],'secret');
  if(options.method==='POST') {writes.push(url);return Response.json({ok:true});}
  return Response.json({items:[{id:'mine',workspaceId:'ws',action:'model.submit',actor:{secret:'hidden'},modelTask:{sessionId:'session-123456789'}},{id:'other',workspaceId:'ws',action:'model.submit',modelTask:{sessionId:'session-987654321'}}]});
 }});
 const scope={workspaceId:'ws',sessionId:'session-123456789'};
 const result=await request({...scope,action:'list'});
 assert.equal(result.items.length,1);assert.equal(result.items[0].actor,undefined);
 await assert.rejects(request({...scope,action:'respond',id:'other',reply:'allow'}),/belong/);
 assert.equal(writes.length,0);
 await request({...scope,action:'respond',id:'mine',reply:'deny'});assert.equal(writes.length,1);
});
test('child budget approvals are shown and answered in their root conversation',async()=>{
 const request=createModelApprovalBridge({getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'secret'}),fetchImpl:async(url,options)=>options.method==='POST'?Response.json({ok:true}):Response.json({items:[{id:'child',workspaceId:'ws',action:'model.submit',modelTask:{sessionId:'session-child-1234',approvalSessionId:'session-parent-1234'}}]})});
 assert.equal((await request({workspaceId:'ws',sessionId:'session-parent-1234',action:'list'})).items.length,1);
 assert.equal((await request({workspaceId:'ws',sessionId:'session-child-1234',action:'list'})).items.length,0);
 await request({workspaceId:'ws',sessionId:'session-parent-1234',action:'respond',id:'child',reply:'allow'});
});

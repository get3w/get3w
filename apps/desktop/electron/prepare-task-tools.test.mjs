import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrepareTaskTools} from './prepare-task-tools.mjs';

test('background task prepares models then workspace tools without a renderer', async () => {
  const calls=[];
  const prepare=createPrepareTaskTools({
    auth:{status:async()=>({status:'signed_in',user:{id:'alice'}})},
    models:{reconcile:async()=>{calls.push('models');return {enabled:true,state:'connected'};}},
    tools:{run:async input=>{calls.push(input);return {enabled:true,state:'configured'};}},
  });
  await prepare('ws_background','ses_background');
  assert.deepEqual(calls,['models',{userId:'alice',workspaceId:'ws_background',sessionId:'ses_background',action:'enable'}]);
});

test('unavailable models and account changes fail task admission', async () => {
  let ready=false,changed=false,reads=0,toolCalls=0;
  const prepare=createPrepareTaskTools({
    auth:{status:async()=>({status:'signed_in',user:{id:changed&&++reads>1?'bob':'alice'}})},
    models:{reconcile:async()=>({enabled:ready,state:ready?'connected':'unavailable'})},
    tools:{run:async()=>{toolCalls++;return {enabled:true,state:'configured'};}},
  });
  await assert.rejects(prepare('ws','ses_background'),/model connection/);
  assert.equal(toolCalls,0);
  ready=true;changed=true;
  await assert.rejects(prepare('ws','ses_background'),/account changed/);
  assert.equal(toolCalls,1);
});

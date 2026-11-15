import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTaskPermissionBridge} from './task-permissions.mjs';
test('trusted loopback bridge requires explicit confirmation and never exposes credentials',async()=>{
 let calls=0;
 const bridge=createTaskPermissionBridge({getServerInfo:async()=>({running:true,baseUrl:'http://127.0.0.1:1234',hostToken:'secret'}),fetchImpl:async(url,init)=>{calls++;assert.equal(init.headers['X-Get3W-Host-Token'],'secret');assert.equal(new URL(url).pathname,'/task-permissions');return Response.json({mode:'full_access',defaultMode:'full_access',grants:[]});}});
 await assert.rejects(bridge({action:'set',mode:'full_access'}));assert.equal(calls,0);
 assert.deepEqual(await bridge({action:'set',mode:'full_access',confirmed:true}),{mode:'full_access',defaultMode:'full_access',grants:[]});
 await assert.rejects(bridge({action:'read',sessionId:'ses_test'}));
 const remote=createTaskPermissionBridge({getServerInfo:async()=>({running:true,baseUrl:'https://example.com',hostToken:'secret'})});
 await assert.rejects(remote({action:'read'}));
});

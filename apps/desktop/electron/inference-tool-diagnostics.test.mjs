import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toolSchemaDiagnostics,toolCallDiagnostics} from './inference-tool-diagnostics.mjs';

test('reports schema shape and streamed argument keys without sensitive values',()=>{
  assert.deepEqual(toolSchemaDiagnostics(Buffer.from(JSON.stringify({messages:[{content:'private'}],tools:[{function:{name:'execute',parameters:{type:'object',properties:{code:{type:'string'}},required:['code']}}}]}))),[{name:'execute',type:'object',properties:['code'],required:['code']}]);
  const calls=toolCallDiagnostics();
  calls.observe({choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'execute',arguments:'{"co'}}]}}]});
  calls.observe({choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'de":"private program"}'}}]}}]});
  assert.deepEqual(calls.summary(),[{name:'execute',argumentBytes:26,validJson:true,keys:['code'],fields:['index','function'],functionFields:['name','arguments']}]);
  assert.ok(!JSON.stringify(calls.summary()).includes('private'));
});

test('distinguishes missing arguments from an empty object',()=>{
  const calls=toolCallDiagnostics();
  calls.observe({choices:[{delta:{tool_calls:[{index:0,function:{name:'execute'}},{index:1,function:{name:'execute',arguments:'{}'}}]}}]});
  assert.deepEqual(calls.summary().map(row=>[row.argumentBytes,row.validJson,row.keys]),[[0,false,[]],[2,true,[]]]);
});

 test('reports native read arguments too, without recording file paths',()=>{
  const calls=toolCallDiagnostics();
  calls.observe({choices:[{delta:{tool_calls:[{index:0,function:{name:'read',arguments:'{"path":"/private/input.png"}'}}]}}]});
  assert.equal(calls.summary()[0].name,'read');
  assert.deepEqual(calls.summary()[0].keys,['path']);
  assert.ok(!JSON.stringify(calls.summary()).includes('/private'));
});

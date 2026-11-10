import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeDesktopAutomation } from './automation-runner.mjs';

test('automation omits a null model variant before submitting a native session', async () => {
  let submitted;
  const fetchImpl=async (input,init)=>{
    const url=String(input);
    if(url.endsWith('/workspaces'))return Response.json({items:[{id:'workspace',path:'/tmp/automation-test'}]});
    if(url.includes('engine-v2-preview'))return Response.json({enabled:true,chatRouting:true});
    if(url.endsWith('/model'))return Response.json([{providerID:'test',id:'model'}]);
    if(init?.method==='POST') {
      submitted=JSON.parse(init.body);
      throw Error('stop before native mutation');
    }
    return Response.json({});
  };
  await assert.rejects(executeDesktopAutomation({automationName:'test',workspaceId:'workspace',instructions:'test',model:{providerId:'test',modelId:'model',variant:null},timeoutMs:10000},{getLocalRuntime:async()=>({baseUrl:'http://localhost:5555',token:'test'}),signal:new AbortController().signal,fetchImpl}));
  assert.ok(submitted, 'must reach native session creation');
  assert.ok(submitted.model, 'native session must bind its model');
  assert.equal(Object.hasOwn(submitted.model,'variant'),false);
});

test('execution timeout bounds workspace discovery before creating any session', async () => {
  let mutations=0;
  const fetchImpl=async (_input,init)=>{
    if(init?.method==='POST')mutations++;
    return new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
    });
  };
  // Keep the test process alive while AbortSignal's unref'd timeout fires.
  const keepAlive=setInterval(()=>{},1000);
  try {
    await assert.rejects(executeDesktopAutomation({automationName:'timeout',instructions:'test',model:{providerId:'test',modelId:'model'},timeoutMs:20},
      {getLocalRuntime:async()=>({baseUrl:'http://localhost:5555',token:'test'}),signal:new AbortController().signal,fetchImpl}),/execution timed out/);
    assert.equal(mutations,0);
  } finally {clearInterval(keepAlive);}
});

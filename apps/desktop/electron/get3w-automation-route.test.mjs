import assert from 'node:assert/strict';
import {test} from 'node:test';
import {automationRoute} from './get3w-automation-route.mjs';
test('automation transport is bounded to personal operations',()=>{
  const input={userId:'alice',method:'GET',path:'/v1/automations?limit=100'};
  assert.equal(automationRoute(input),'automations?limit=100');
  assert.equal(automationRoute({...input,path:'/v1/automation-runner/presence'}),'automation-runner/presence');
  assert.throws(()=>automationRoute({...input,path:'/v1/automation-runner/work'}));
  for(const patch of [{path:'https://evil.test/v1/automations'}, {path:'/v1/apps'}, {path:'/v1/automations?token=secret'}, {path:'/v1/automations/../apps'}, {method:'PUT'}, {body:{}}, {organizationId:'other'}])
    assert.throws(()=>automationRoute({...input,...patch}));
  assert.equal(automationRoute({...input,method:'POST',path:'/v1/automations/atm_test/deactivate',body:{}}),'automations/atm_test/deactivate');
  assert.equal(automationRoute({...input,method:'POST',path:'/v1/automations/atm_test/runs/arn_test/cancel',body:{}}),'automations/atm_test/runs/arn_test/cancel');
  assert.throws(()=>automationRoute({...input,method:'POST',path:'/v1/automations/atm_test/runs/arn_test/report',body:{}}));
});

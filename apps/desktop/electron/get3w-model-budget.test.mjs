import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertModelBudget} from './get3w-model-budget.mjs';
test('acceptance budget totals all chats and retains uncertain reservations',()=>{
 const scope={userId:'u',workspaceId:'w',sessionId:'s'};
 const rows=[{scope,quote:{amountUsd:'9.900001'},arguments:{idempotency_key:'first'},status:'submitting'}];
 const context={quote:{amountUsd:'0.100000'},call:{arguments:{idempotency_key:'new'}}};
 assert.throws(()=>assertModelBudget(rows,{...scope,sessionId:'different'},context,'10'),/budget exceeded/);
 assert.doesNotThrow(()=>assertModelBudget(rows,scope,{...context,call:{arguments:{idempotency_key:'first'}}},'10'));
 assert.doesNotThrow(()=>assertModelBudget(rows,{...scope,userId:'other'},context,'10'));
});

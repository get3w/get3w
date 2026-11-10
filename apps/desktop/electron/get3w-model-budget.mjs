const micros=value=>{if(typeof value!=='string'||!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value))throw Error('Invalid model budget');const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));};
/** Conservative acceptance cap across all chats. Uncertain calls stay reserved. */
export function assertModelBudget(rows,scope,context,limitUsd) {
  if(!limitUsd)return;
  const same=rows.find(row=>row.scope.userId===scope.userId&&row.scope.organizationId===undefined&&row.scope.workspaceId===scope.workspaceId&&row.scope.sessionId===scope.sessionId&&row.arguments.idempotency_key===context.call.arguments.idempotency_key);
  if(same)return;
  const used=rows.filter(row=>row.scope.userId===scope.userId).reduce((sum,row)=>sum+micros(row.quote.amountUsd),0n);
  if(used+micros(context.quote.amountUsd)>micros(limitUsd))throw Error('Model acceptance budget exceeded.');
}

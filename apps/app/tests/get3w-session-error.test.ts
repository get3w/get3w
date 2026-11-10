import { expect, test } from 'bun:test';
import { presentOpencodeSessionError } from '../src/react-app/domains/session/sync/session-error';
test('Get3W balance, quota and unknown outcome have distinct recovery',()=>{
  for(const [message,kind] of [['Model unavailable: balance_exhausted','openwork-balance'],['Model unavailable: quota_exhausted','openwork-quota'],['Get3W request failed. Check model usage before trying again; it was not automatically replayed.','openwork-request-failed']]){
    const result=presentOpencodeSessionError({name:'APIError',data:{statusCode:402,message,responseBody:JSON.stringify({error:{message}})}});
    expect(result.kind).toBe(kind);expect(result.description).toBeTruthy();
  }
});
test('model task errors map to actionable desktop states',()=>{
  const cases=[
    ['quote_expired','model-quote-expired'],
    ['insufficient_balance','model-insufficient-balance'],
    ['invalid_inputs','model-schema-invalid'],
    ['session_mismatch','model-session-mismatch'],
    ['upstream_failed','model-upstream-failed'],
  ] as const;
  for (const [code,kind] of cases) {
    const result=presentOpencodeSessionError({name:'APIError',data:{statusCode:409,message:code,responseBody:JSON.stringify({error:{code,message:code}})}});
    expect(result.kind).toBe(kind);expect(result.description).toBeTruthy();
  }
});

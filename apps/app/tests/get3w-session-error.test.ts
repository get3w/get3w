import { expect, test } from 'bun:test';
import { presentOpencodeSessionError } from '../src/react-app/domains/session/sync/session-error';
test('Get3W balance, quota and unknown outcome have distinct recovery',()=>{
  for(const [message,kind] of [['Model unavailable: balance_exhausted','get3w-balance'],['Model unavailable: quota_exhausted','get3w-quota'],['Get3W request failed. Check model usage before trying again; it was not automatically replayed.','get3w-request-failed']]){
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

test("Get3W failure and recovery guidance follow the selected language", async () => {
 const { setLocale } = await import("../src/i18n");
 const error = { message: "Get3W inference unavailable. Check model usage before trying again." };
 try {
  setLocale("zh"); const zh = presentOpencodeSessionError(error);
  expect(zh.title).toBe("Get3W 请求未完成"); expect(zh.description).toContain("未自动重发");
  setLocale("en"); expect(presentOpencodeSessionError(error).title).toBe("Get3W request could not finish");
 } finally { setLocale("zh"); }
});

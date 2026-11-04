import { expect, test } from 'bun:test';
import { resolvePosthogKey } from '../src/app/lib/analytics-key';
import { buildFeedbackUrl, DEFAULT_FEEDBACK_URL } from '../src/app/lib/feedback';
test('Get3W default analytics stays silent and explicit blank remains disabled',()=>{
  expect(resolvePosthogKey(undefined,false)).toBe('');
  expect(resolvePosthogKey(undefined,true)).toBe('');
  expect(resolvePosthogKey(' ',false)).toBe('');
  expect(resolvePosthogKey(' explicit-test-project ',false)).toBe('explicit-test-project');
});
test('feedback targets Get3W and carries only diagnostic context',()=>{
  expect(new URL(DEFAULT_FEEDBACK_URL).hostname).toBe('get3w.com');
  const url=new URL(buildFeedbackUrl({entrypoint:'settings',deployment:'desktop',appVersion:'0.1.0'}));
  expect(url.searchParams.get('source')).toBe('get3w-desktop');
  expect(url.searchParams.has('token')).toBe(false);
  expect(url.searchParams.has('messages')).toBe(false);
});

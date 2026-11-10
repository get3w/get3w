import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGet3wMcpProxy } from './get3w-mcp-proxy.mjs';

// Real loopback HTTP + submit guard; deterministic upstream, no paid calls.
async function fixture(t, { allowed = true, failFirstRead = false } = {}) {
  const events = [];
  let reads = 0;
  const sessionId = 'ses_basic_image_flow';
  const inputs = { prompt: '一只可爱的奶牛猫', resolution: '1k' };
  const proxy = await createGet3wMcpProxy({
    userId: 'owner', sessionId,
    enforceModelGuard: true,
    approveSubmit: async request => {
      events.push({ type: 'approval', request });
      return allowed;
    },
    journal: {
      beforeSubmit: async context => { events.push({ type: 'journal', context }); },
      observe: async () => {},
    },
    auth: { submitPersonal: async ({ userId, arguments: args }) => {
      assert.equal(userId, 'owner');
      events.push({ type: 'upstream', message: { params: { arguments: { name: 'submit', arguments: args } } } });
      return { request_id: 'image-request', status: 'queued' };
    }, mcp: async ({ body, userId, sessionId: actualSession }) => {
      assert.equal(userId, 'owner');
      assert.equal(actualSession, sessionId);
      const message = JSON.parse(body);
      const call = message.params.arguments;
      events.push({ type: 'upstream', message });
      let structuredContent;
      if (message.params.name === 'search_capabilities') {
        structuredContent = { data: ['models.list', 'models.schema', 'quote', 'submit', 'result'].map(handler => ({
          name: handler, handler: `get3w.${handler}`,
        })) };
      } else if (call.name === 'models.list') {
        structuredContent = { status: 'succeeded', result: { data: [{ slug: 'test/image', output_type: 'image' }] } };
      } else if (call.name === 'models.schema') {
        structuredContent = { status: 'succeeded', result: { required: ['prompt'], properties: { prompt: { type: 'string' } } } };
      } else if (call.name === 'quote') {
        structuredContent = { status: 'succeeded', result: {
          quote_id: 'quote-image', slug: 'test/image', currency: 'USD', discounted_price: '0.02',
          expires_at: Math.floor(Date.now() / 1000) + 600,
        } };
      } else if (call.name === 'submit') {
        structuredContent = { status: 'succeeded', result: { request_id: 'image-request', status: 'queued' } };
      } else if (call.name === 'result') {
        assert.equal(call.arguments.request_id, 'image-request');
        reads++;
        if (failFirstRead && reads === 1) return { response: Response.json({ error: { message: 'temporary failure' } }, { status: 503 }) };
        structuredContent = { status: 'succeeded', result: { request_id: 'image-request', status: 'completed',
          outputs: [{ type: 'image', url: 'https://example.invalid/cat.png', mime_type: 'image/png' }],
          billing: { charged: { usd: '0.02' } },
        } };
      } else throw Error(`Unexpected capability: ${call.name}`);
      return { response: Response.json({ jsonrpc: '2.0', id: message.id, result: { structuredContent } }) };
    } },
  });
  t.after(() => proxy.close());
  let id = 0;
  const call = async (name, args, token = proxy.token) => {
    const response = await fetch(proxy.url, { method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
    return { status: response.status, payload: await response.json() };
  };
  const execute = (name, args, key) => call('execute_capability', { name, arguments: args, ...(key ? { idempotency_key: key } : {}) });
  const discover = () => call('search_capabilities', { query: 'image generation' });
  const quote = () => execute('quote', { slug: 'test/image', inputs });
  const submit = (changes = {}, outerKey = 'cat-once') => execute('submit', {
    slug: 'test/image', inputs, quote_id: 'quote-image', session_id: sessionId, idempotency_key: 'cat-once', ...changes,
  }, outerKey);
  const submissions = () => events.filter(event => event.type === 'upstream' && event.message.params.arguments.name === 'submit');
  return { events, call, execute, discover, quote, submit, submissions };
}

test('basic image flow discovers models, quotes, approves, submits once and returns an image', async t => {
  const f = await fixture(t);
  assert.equal((await f.discover()).status, 200);
  const models = await f.execute('models.list', { output_type: 'image' });
  assert.equal(models.payload.result.structuredContent.result.data[0].slug, 'test/image');
  const schema = await f.execute('models.schema', { slug: 'test/image' });
  assert.deepEqual(schema.payload.result.structuredContent.result.required, ['prompt']);
  await f.quote();
  const submitted = await f.submit();
  assert.equal(submitted.payload.result.structuredContent.result.request_id, 'image-request');
  const approval = f.events.find(event => event.type === 'approval').request;
  assert.equal(approval.quote.amountUsd, '0.02');
  assert.equal(approval.sessionId, 'ses_basic_image_flow');
  assert.deepEqual(f.events.slice(-3).map(event => event.type), ['approval', 'journal', 'upstream']);
  const result = (await f.execute('result', { request_id: 'image-request' })).payload.result.structuredContent.result;
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.outputs, [{ type: 'image', url: 'https://example.invalid/cat.png', mime_type: 'image/png' }]);
  assert.equal(result.billing.charged.usd, '0.02');
  assert.equal(f.submissions().length, 1);
});

test('declining the image quote never journals or dispatches a paid task', async t => {
  const f = await fixture(t, { allowed: false });
  await f.discover(); await f.quote();
  const result = await f.submit();
  assert.equal(result.payload.error.code, -32003);
  assert.equal(f.submissions().length, 0);
  assert.equal(f.events.filter(event => event.type === 'journal').length, 0);
});

for (const [name, changes, message] of [
  ['missing quote', { quote_id: 'missing' }, /quote_required/],
  ['changed prompt after quote', { inputs: { prompt: 'different cat' } }, /quote_required/],
  ['wrong chat session', { session_id: 'different-session' }, /session_mismatch/],
  ['mismatched submission key', { idempotency_key: 'different-key' }, /same inner and outer/],
]) test(`${name} gives a corrective tool error and permits a corrected submission`, async t => {
  const f = await fixture(t);
  await f.discover(); await f.quote();
  const rejected = await f.submit(changes);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.payload.result.isError, true);
  assert.match(rejected.payload.result.content[0].text, message);
  assert.equal(f.submissions().length, 0);
  assert.equal(f.events.filter(event => event.type === 'approval').length, 0);
  assert.equal((await f.submit()).payload.result.structuredContent.result.request_id, 'image-request');
  assert.equal(f.submissions().length, 1);
});

test('temporary result failure can recover the original request without a new submit or approval', async t => {
  const f = await fixture(t, { failFirstRead: true });
  await f.discover(); await f.quote(); await f.submit();
  assert.equal((await f.execute('result', { request_id: 'image-request' })).status, 503);
  assert.equal((await f.execute('result', { request_id: 'image-request' })).payload.result.structuredContent.result.status, 'completed');
  assert.equal(f.submissions().length, 1);
  assert.equal(f.events.filter(event => event.type === 'approval').length, 1);
});

test('untrusted requests and undiscovered capabilities cannot dispatch model work', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('search_capabilities', {}, 'wrong-token')).status, 401);
  const rejected = await f.submit();
  assert.equal(rejected.payload.result.isError, true);
  assert.match(rejected.payload.result.content[0].text, /capability_required/);
  assert.deepEqual(f.events, []);
});

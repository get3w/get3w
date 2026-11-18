import { expect, test } from 'bun:test';
import { createHeadlessThreadClient } from '../src/client';

test('v1 sends attachment bytes in SDK file parts', async () => {
  const submissions: unknown[] = [];
  const client = createHeadlessThreadClient({ baseUrl: 'http://isolated.test', workspaceId: 'bench', token: 'test',
    engine: 'v1', requireModelAvailability: false,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/message')) return Response.json([]);
      if (request.url.endsWith('/prompt_async')) {
        submissions.push(await request.json());
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    },
  });
  const attachment = {mime: 'image/png', filename: 'input.png', url: 'data:image/png;base64,cHVibGlj'};
  await client.sendTurn('ses_bench', {prompt: 'Inspect this image', model: {providerId: 'get3w', modelId: 'fixed'},
    messageId: 'msg_bench', attachments: [attachment]});
  expect(submissions).toEqual([{ messageID: 'msg_bench', model: {providerID: 'get3w', modelID: 'fixed'},
    parts: [{type: 'text', text: 'Inspect this image'}, {type: 'file', ...attachment}] }]);
});

test('v2 rejects unsupported attachment URLs before submitting a prompt', async () => {
  const prompts: string[] = [];
  const client = createHeadlessThreadClient({baseUrl: 'http://isolated.test', workspaceId: 'bench', token: 'test',
    engine: 'v2', requireModelAvailability: false,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      prompts.push(request.url);
      if (new URL(request.url).pathname.endsWith('/message')) return Response.json({data: []});
      throw new Error(`Unexpected request: ${request.url}`);
    }});
  await expect(client.sendTurn('ses_bench', {prompt: 'image', model: {providerId: 'get3w', modelId: 'fixed'},
    attachments: [{mime: 'image/png', url: 'https://example.test/image.png'}]})).rejects.toThrow('base64 data URLs');
  expect(prompts.some(url => url.endsWith('/prompt'))).toBe(false);
});

test('v2 maps base64 attachments into native files without dropping bytes', async () => {
  const submitted: unknown[] = [];
  const client = createHeadlessThreadClient({baseUrl: 'http://isolated.test', workspaceId: 'bench', token: 'test',
    engine: 'v2', requireModelAvailability: false,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/message')) return Response.json({data: []});
      if (path.endsWith('/model')) return Response.json({data: {}});
      if (path.endsWith('/prompt')) { submitted.push(await request.json()); return Response.json({data: {}}); }
      throw new Error(path);
    }});
  await client.sendTurn('ses_bench', {prompt: 'inspect', model: {providerId: 'get3w', modelId: 'fixed'},
    attachments: [{mime: 'image/png', filename: 'input.png', url: 'data:image/png;base64,cHVibGlj'}]});
  expect(submitted).toEqual([{text: 'inspect', files: [{uri: 'data:image/png;base64,cHVibGlj', name: 'input.png'}]}]);
});

// Exercise the same wire conversion used by snapshots and transcript export.
import { fromV2Messages, v2MessagePageSchema } from '../src/v2-wire';
import { threadMessagesSchema, toThreadMessage } from '../src/wire';
import { toTranscriptMessage } from '../src/transcript';

test('v1 snapshots and transcripts retain file bytes and metadata in order', () => {
  const [wire] = threadMessagesSchema.parse([{info: {id: 'user1', role: 'user'}, parts: [
    {id: 'text1', type: 'text', text: 'inspect'},
    {id: 'file1', type: 'file', mime: 'image/png', filename: 'input.png', url: 'data:image/png;base64,cHVibGlj'},
  ]}]);
  const message = toThreadMessage(wire!);
  expect(message.parts[1]?.url).toBe('data:image/png;base64,cHVibGlj');
  expect(toTranscriptMessage(message).parts).toEqual([
    {type: 'text', text: 'inspect'},
    {type: 'file', partId: 'file1', mime: 'image/png', filename: 'input.png', url: 'data:image/png;base64,cHVibGlj'},
  ]);
});

test('v2 persisted inline files survive snapshots and transcript export', () => {
  const page = v2MessagePageSchema.parse({data: [{id: 'user2', type: 'user', text: 'inspect', files: [
    {data: 'cHVibGlj', mime: 'image/png', name: 'input.png', source: {type: 'inline'}},
    {mime: 'image/jpeg', name: 'unavailable.jpg', source: {type: 'blob', id: 'blob1'}},
  ]}]});
  const [wire] = fromV2Messages(page.data);
  const transcript = toTranscriptMessage(toThreadMessage(wire!));
  expect(transcript.parts).toEqual([
    {type: 'text', text: 'inspect'},
    {type: 'file', partId: 'user2:file:0', mime: 'image/png', filename: 'input.png', url: 'data:image/png;base64,cHVibGlj'},
    {type: 'file', partId: 'user2:file:1', mime: 'image/jpeg', filename: 'unavailable.jpg', url: null},
  ]);
});

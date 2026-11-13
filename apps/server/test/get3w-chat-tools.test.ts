import { test, expect } from "bun:test";
import contextPlugin from "../src/opencode-plugins/openwork-context-v2.js";
import { GET3W_CHAT_TOOLS } from "../src/get3w-chat-tools.js";

test("Artifact and capability tools use trusted engine context without changing the MCP result", async () => {
  const calls: unknown[] = [];
  let rejected = false;
  const result = { content: [{ type: "text", text: "draft" }], _meta: { "openwork/appDraft": { appId: "draft" } } };
  const endpoint = Bun.serve({ port: 0, async fetch(request) {
    expect(request.headers.get("Authorization")).toBe("Bearer bridge-token");
    calls.push(await request.json());
    return rejected ? Response.json({ error: { code: -32003, message: "quote_expired: Request a fresh quote." } }) : Response.json({ result });
  } });
  type Editor = Parameters<Parameters<Parameters<typeof contextPlugin.setup>[0]["tool"]["transform"]>[0]>[0];
  type Execute = Parameters<Parameters<Editor["update"]>[1]>[0]["execute"];
  const wrapped = new Map<string, { execute: Execute }>();
  for (const name of GET3W_CHAT_TOOLS) wrapped.set(`get3w-account_${name}`, { execute: async () => { throw Error("Untrusted transport used"); } });
  const stop = await contextPlugin.setup({
    options: { url: `http://127.0.0.1:${endpoint.port}/read`, token: "bridge-token" },
    location: { directory: "/test/workspace" },
    tool: { async transform(callback) {
      callback({ add() {}, get: id => wrapped.get(id), update(id, change) { const tool = wrapped.get(id); if (tool) change(tool); } });
      return { async dispose() {} };
    } },
    skill: { async transform() { return { async dispose() {} }; }, async reload() {} },
  });
  try {
    for (const name of GET3W_CHAT_TOOLS) {
      const tool = wrapped.get(`get3w-account_${name}`);
      if (!tool) throw Error("Missing tool");
      const input = { sessionId: "model-forged-session", title: "Test" };
      expect(await tool.execute(input, { signal: new AbortController().signal, sessionID: "ses_trusted", messageID: "msg_trusted", id: "call_trusted" })).toEqual({ output: result });
      expect(calls.at(-1)).toEqual({ name: "get3w_model_call", input: { name, arguments: input }, sessionId: "ses_trusted", caller: { directory: "/test/workspace", messageId: "msg_trusted", callId: "call_trusted" } });
      await expect(tool.execute({}, { signal: new AbortController().signal, sessionID: "ses_trusted" })).rejects.toThrow("Conversation context is unavailable");
    }
    expect(calls.length).toBe(GET3W_CHAT_TOOLS.length);
    rejected = true;
    const execute = wrapped.get("get3w-account_execute_capability")?.execute;
    if (!execute) throw Error("Missing capability tool");
    await expect(execute({}, { signal: new AbortController().signal, sessionID: "ses_trusted", messageID: "msg_trusted" }))
      .rejects.toThrow("quote_expired: Request a fresh quote.");
  } finally { await stop(); endpoint.stop(true); }
});

test("native media tools are direct, readiness-gated and flatten only the typed media result",async()=>{
 const requests:unknown[]=[];
 const endpoint=Bun.serve({port:0,async fetch(request){requests.push(await request.json());return Response.json({result:{structuredContent:{status:'ready',preparation_id:'prep'}}});}});
 type Editor=Parameters<Parameters<Parameters<typeof contextPlugin.setup>[0]['tool']['transform']>[0]>[0];
 type Added=Parameters<Editor['add']>[0];
 const tools:Added[]=[];
 const removed:string[]=[];
 const run=async(ready:boolean)=>contextPlugin.setup({options:{url:`http://127.0.0.1:${endpoint.port}`,token:'bridge'},location:{directory:'/workspace'},tool:{async transform(callback){callback({add:tool=>tools.push(tool),get:id=>ready&&id==='get3w-account_native_media_ready'?{}:undefined,remove:id=>{removed.push(id);}});return {async dispose(){}};}}});
 try{
  const offline=await run(false);expect(tools.some(tool=>tool.name==='media_prepare')).toBe(false);await offline();tools.length=0;
  const close=await run(true);
  expect(removed).toEqual(['get3w-account_native_media_ready']);
  for(const name of ['media_prepare','media_generate']){
   const tool=tools.find(item=>item.name===name);expect(tool?.options.codemode).toBe(false);expect(tool?.options.pinned).toBe(true);
   if(!tool)throw Error('Native media tool missing');
   const result=await tool.execute({task_type:'text-to-image'},{signal:new AbortController().signal,sessionID:'trusted-session',messageID:'trusted-message'});
   expect(result.content).toEqual([{type:'text',text:JSON.stringify({status:'ready',preparation_id:'prep'})}]);
  }
  expect(requests).toContainEqual({name:'get3w_model_call',input:{name:'media_prepare',arguments:{task_type:'text-to-image'}},sessionId:'trusted-session',caller:{directory:'/workspace',messageId:'trusted-message'}});
  await close();
 }finally{endpoint.stop(true);}
});

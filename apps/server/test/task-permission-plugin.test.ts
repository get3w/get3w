import { test, expect } from "bun:test";
import plugin from "../src/opencode-plugins/openwork-agent-permissions-v2.js";
test("full access grants ask only for the current task; deny and paid submission stay independent", async () => {
  let evaluate: (event: {sessionID: string; action: string; resources: string[]; effect: "allow" | "ask" | "deny"}) => void | Promise<void> = () => {};
  const server = Bun.serve({port:0,hostname:"127.0.0.1",fetch:async req => Response.json({mode:(await req.json()).sessionId === "full" ? "full_access":"default"})});
  const registration={dispose:async()=>{}};
  const dispose=await plugin.setup({options:{rules:[],permissionPolicy:{url:server.url.href,token:"private"}},permission:{hook:async(_name,callback)=>{evaluate=callback;return registration;}},tool:{hook:async()=>registration},mcp:{transform:async()=>registration}});
  try {
    for (const [sessionID, initial, expected] of [["full","ask","allow"],["normal","ask","ask"],["full","deny","deny"]] as const) {
      const event={sessionID,action:"external_directory",resources:["/outside"],effect:initial as "allow"|"ask"|"deny"};
      await evaluate(event);expect(event.effect).toBe(expected);
    }
  } finally {await dispose();server.stop(true);}
});
test("unavailable policy cannot turn an ask into allow", async () => {
 let evaluate: (event: {sessionID:string;action:string;resources:string[];effect:"ask"})=>void|Promise<void>=()=>{};
 const r={dispose:async()=>{}};
 const dispose=await plugin.setup({options:{rules:[],permissionPolicy:{url:"http://127.0.0.1:1/read",token:"private"}},permission:{hook:async(_,fn)=>{evaluate=fn;return r;}},tool:{hook:async()=>r},mcp:{transform:async()=>r}});
 try { await expect(evaluate({sessionID:"full",action:"shell",resources:["pwd"],effect:"ask"})).rejects.toThrow(); } finally {await dispose();}
});

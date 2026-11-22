import { test, expect, afterEach } from "bun:test";
import { createClientV2 } from "../src/app/lib/opencode-v2-adapter";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
test("native task ownership survives the adapter; ordinary chats are not inferred from title", async () => {
 globalThis.fetch = Object.assign(async () => Response.json({ data: [
  { id: "task", title: "Hello", metadata: { get3wTask: { purpose: "task", taskId: "workspace" } } },
  { id: "ordinary", title: "持续运行任务" },
 ] }), { preconnect: original.preconnect });
 const client = createClientV2("http://127.0.0.1:9", undefined, {});
 const response = await client.session.list();
 expect(response.data?.[0]).toMatchObject({ get3wPurpose: "task", get3wTaskId: "workspace" });
 expect(response.data?.[1]).not.toHaveProperty("get3wPurpose");
});

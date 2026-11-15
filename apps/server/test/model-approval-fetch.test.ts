import { expect, test } from "bun:test";
import { modelApprovalFetch } from "../src/server-fetch.js";

test("model approval transport preserves delayed responses and caller cancellation", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch() {
    await Bun.sleep(80);
    return Response.json({ request_id: "existing-request" });
  } });
  try {
    const url = new URL(server.url);
    const response = await modelApprovalFetch(url, { method: "POST", signal: AbortSignal.timeout(2000) });
    expect(await response.json()).toEqual({ request_id: "existing-request" });
    const controller = new AbortController();
    const pending = modelApprovalFetch(url, { method: "POST", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  } finally {
    server.stop(true);
  }
});

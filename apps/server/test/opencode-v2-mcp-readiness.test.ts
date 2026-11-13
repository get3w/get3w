import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForMcpBindings, mcpBindingsReady, mcpToolId, type McpPublishedTool, type McpReadinessRegistry } from "../src/opencode-v2-mcp-readiness.js";

const server = "reload-witness";
const id = mcpToolId(server, "read_report");
const witness = { id, options: { namespace: server } };

function registry(initial: readonly McpPublishedTool[] = []) {
  let current = initial;
  let reads = 0;
  let disposals = 0;
  let rebuilding = false;
  let registered = () => {};
  const registration = new Promise<void>(resolve => { registered = resolve; });
  const observers = new Set<() => void>();
  const publish = (next: readonly McpPublishedTool[]) => {
    rebuilding = true;
    for (const observe of observers) observe();
    current = next;
    rebuilding = false;
  };
  const tools: McpReadinessRegistry = {
    async list() {
      assert.equal(rebuilding, false, "reads cannot recurse inside native registry replay");
      reads++;
      return current;
    },
    async transform(observe) {
      observers.add(observe);
      publish(current);
      registered();
      return { async dispose() {
        if (!observers.delete(observe)) return;
        disposals++;
        publish(current);
      } };
    },
  };
  return { tools, registration, publish, counts: () => ({ reads, disposals, observers: observers.size }) };
}

const signal = () => new AbortController().signal;

test("an authoritative zero-tool catalog needs no executable observer", async () => {
  const native = registry();
  await waitForMcpBindings(native.tools, server, [], [], signal());
  assert.deepEqual(native.counts(), { reads: 1, disposals: 0, observers: 0 });
});

test("native readiness observes newly executable bindings after the complete replay", async () => {
  const native = registry();
  let completed = false;
  const ready = waitForMcpBindings(native.tools, server, [id], [], signal()).then(() => { completed = true; });
  await native.registration;
  await Promise.resolve();
  assert.equal(completed, false);
  native.publish([witness]);
  await ready;
  assert.equal(native.counts().disposals, 1);
  assert.equal(native.counts().observers, 0);
});

test("removal waits for the old binding to leave the executable registry", async () => {
  const native = registry([witness]);
  let completed = false;
  const ready = waitForMcpBindings(native.tools, server, [], [id], signal()).then(() => { completed = true; });
  await native.registration;
  await Promise.resolve();
  assert.equal(completed, false);
  native.publish([]);
  await ready;
  assert.equal(native.counts().disposals, 1);
  assert.equal(native.counts().observers, 0);
});

test("an unrelated namespace cannot satisfy native MCP readiness", () => {
  assert.equal(mcpBindingsReady([{ id, options: { namespace: "builtin" } }], server, [id], []), false);
  assert.equal(mcpBindingsReady([witness], server, [id], [id]), true);
  assert.equal(mcpToolId("server.with.dots", "tool/with/dots"), "server_with_dots_tool_with_dots");
});

test("cancellation disposes the observer and prevents late native registry reads", async () => {
  const native = registry();
  const controller = new AbortController();
  const ready = waitForMcpBindings(native.tools, server, [id], [], controller.signal);
  const rejected = assert.rejects(ready, /canceled by caller/);
  await native.registration;
  controller.abort(new Error("canceled by caller"));
  await rejected;
  assert.equal(native.counts().disposals, 1);
  assert.equal(native.counts().observers, 0);
  const reads = native.counts().reads;
  native.publish([witness]);
  await Promise.resolve();
  assert.equal(native.counts().reads, reads);
});


test("the shipped engine pin has a reviewed readiness adapter", async () => {
  const { readFileSync } = await import("node:fs");
  const { isMcpReadinessVersionSupported } = await import("../src/opencode-v2-mcp-readiness.js");
  const pinned = JSON.parse(readFileSync(new URL("../../../constants.json", import.meta.url), "utf8")).opencodeV2Version;
  assert.equal(isMcpReadinessVersionSupported(pinned), true);
  assert.equal(isMcpReadinessVersionSupported("unreviewed"), false);
});

test("native media readiness requires both direct tools after removing its internal marker", async () => {
  const { mcpBindingsReady } = await import("../src/opencode-v2-mcp-readiness.js");
  const desired = ["get3w-account_native_media_ready"];
  assert.equal(mcpBindingsReady([{id:"media_prepare"}], "get3w-account", desired, []), false);
  assert.equal(mcpBindingsReady([{id:"media_prepare"},{id:"media_generate"}], "get3w-account", desired, []), true);
  assert.equal(mcpBindingsReady([{id:desired[0],options:{namespace:"get3w-account"}}], "get3w-account", desired, []), false);
});

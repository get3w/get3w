import { expect, test } from "bun:test";
import { OpenWorkExtensionsPreview } from "../src/opencode-plugins/openwork-extensions-preview";
import { openworkReadTransport } from "../src/opencode-plugins/openwork-read-transport";
import { createV2ContextBridge } from "../src/opencode-v2-context-bridge";

test("local agent context reads UI and user MCPs without organization catalogs or health probes", async () => {
  const plugin = await OpenWorkExtensionsPreview({ client: { mcp: { status: async () => ({ data: { manual: { status: "connected" } } }) } }, directory: "/fixture" });
  const requests: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(async () => { throw new Error("Unexpected network"); }, original);
  try {
    const context = await openworkReadTransport.run({
      get: async path => { requests.push(path); throw new Error("Unexpected host read"); },
      post: async (path) => { requests.push(path); if (path === "/experimental/ui-control/request") return {}; throw new Error("Unexpected host write"); },
    }, () => plugin.tool.openwork_context.execute());
    const parsed = JSON.parse(context);
    expect(parsed.instructions.routing).toContain("local Get3W");
    expect(context).not.toContain("create-skill remote");
    expect(requests.every(path => !path.includes("connect/") && !path.includes("openwork-cloud"))).toBe(true);
  } finally { globalThis.fetch = original; plugin.dispose(); }
});

test("older v2 skill discovery returns an empty local catalog without touching the host", async () => {
  let hostCalls = 0;
  const bridge = await createV2ContextBridge(async () => { hostCalls++; throw new Error("Unexpected host request"); });
  try {
    const response = await fetch(bridge.url, { method: "POST", headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" }, body: JSON.stringify({ name: "openwork_skills", input: {} }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, skills: [] });
    expect(hostCalls).toBe(0);
  } finally { await bridge.close(); }
});

test("personal v1 and v2 registries offer local context without retired cloud file tools or skill polling", async () => {
  const nativeContext = (await import("../src/opencode-plugins/openwork-context-v2")).default;
  const names: string[] = [];
  const plugin = await OpenWorkExtensionsPreview();
  const stop = await nativeContext.setup({
    options: { url: "http://127.0.0.1:9/read", token: "fixture" },
    tool: { async transform(callback) { callback({ add: tool => { names.push(tool.name); } }); return { async dispose() {} }; } },
  });
  try {
    expect(names).toEqual(["openwork_context", "openwork_query", "openwork_execute"]);
    expect(Object.keys(plugin.tool).some(name => /drive_|gmail|outlook/.test(name))).toBe(false);
    expect(Object.keys(plugin.tool)).toContain("openwork_context");
  } finally { await stop(); plugin.dispose(); }
});

test("retired cloud bridge commands cannot reach host transport or approvals", async () => {
  let hostCalls = 0;
  const bridge = await createV2ContextBridge(async () => { hostCalls++; throw new Error("Unexpected host request"); });
  try {
    for (const name of ["openwork_drive_upload", "openwork_gmail_draft", "openwork_outlook_draft", "drive_pull_file", "drive_push_file"]) {
      const response = await fetch(bridge.url, { method: "POST", headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" }, body: JSON.stringify({ name, input: {} }) });
      expect(response.status).toBe(400);
    }
    expect(hostCalls).toBe(0);
  } finally { await bridge.close(); }
});

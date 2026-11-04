import { expect, test } from "bun:test";
import { createClient } from "../src/app/lib/opencode";
import { healWorkspaceMcpInBackground } from "../src/react-app/domains/connections/use-session-mcp-maintenance";

test("personal MCP maintenance reconnects manual OAuth without organization provisioning", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init); const path = new URL(req.url).pathname;
    requests.push(`${req.method} ${path}`);
    if (path === "/mcp") return Response.json({ manual: { status: "needs_auth" }, "openwork-cloud": { status: "needs_auth" }, "openwork-direct-fixture": { status: "needs_auth" } });
    if (path === "/mcp/manual/connect") return Response.json(true);
    throw new Error(`Unexpected request: ${req.url}`);
  }, original);
  try {
    const names = ["manual", "openwork-cloud", "openwork-direct-fixture"];
    const client = { listMcp: async () => ({ items: names.map(name => ({ name, config: { type: "remote" as const, url: "https://mcp.example.test", oauth: true } })) }) };
    const healed = await healWorkspaceMcpInBackground({ client, workspaceId: "local", directory: "/fixture-personal", opencodeClient: createClient("http://127.0.0.1:8787") });
    expect(healed).toBe(true);
    expect(requests).toEqual(["GET /mcp", "POST /mcp/manual/connect"]);
    requests.splice(0);
    let current = true;
    expect(await healWorkspaceMcpInBackground({ client: { listMcp: async () => { current = false; return { items: [] }; } }, workspaceId: "local", directory: "/fixture", opencodeClient: createClient("http://127.0.0.1:8787"), isCurrent: () => current })).toBe(false);
    expect(requests).toEqual([]);
  } finally { globalThis.fetch = original; }
});

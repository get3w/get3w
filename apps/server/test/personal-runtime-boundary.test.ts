import { expect, test } from "bun:test";
import { buildOpenworkRuntimeConfigObjectFromSnapshot } from "../src/openwork-runtime-config";
import { readOpenWorkConnectMcpAppHostAuthorization, readOpenWorkConnectMcpAppHostCatalog, refreshOpenWorkConnectMcpAppHostCatalog } from "../src/connect-mcp-server-catalog";
import type { ServerConfig } from "../src/types";

test("v1 ignores inherited organization MCPs and prompts while preserving personal configuration", () => {
 const personal = { type: "remote", url: "https://personal.example/mcp", headers: { Authorization: "test-only" } };
 const runtime = buildOpenworkRuntimeConfigObjectFromSnapshot({ mcp: {
  personal, "openwork-cloud": personal, "openwork-direct-old": personal,
  "openwork-connect-old": personal, "openwork-app-host-connect-old": personal,
 }, managedPrompt: "Organization secret instructions" });
 expect(runtime.mcp).toEqual({ personal });
 expect(JSON.stringify(runtime.agent)).not.toContain("Organization secret instructions");
 expect(JSON.stringify(runtime.plugin)).not.toContain("gateway-quota");
});
test("retired app catalogue does not read private stores or make discovery requests", async () => {
 const config = { configPath: "/must-not-read/server.json" } as ServerConfig;
 let requests = 0;
 const fetcher = async () => { requests++; throw new Error("unexpected request"); };
 expect(await readOpenWorkConnectMcpAppHostAuthorization(config, "old", "https://old.example")).toBeNull();
 expect((await readOpenWorkConnectMcpAppHostCatalog(config, "old")).servers).toEqual([]);
 expect((await refreshOpenWorkConnectMcpAppHostCatalog(config, "old", fetcher)).status).toBe("unavailable");
 expect(requests).toBe(0);
});

import { expect, test } from "bun:test";
import { buildGet3wRuntimeConfigObjectFromSnapshot } from "../src/get3w-runtime-config";
import { readGet3WConnectMcpAppHostAuthorization, readGet3WConnectMcpAppHostCatalog, refreshGet3WConnectMcpAppHostCatalog } from "../src/connect-mcp-server-catalog";
import type { ServerConfig } from "../src/types";

test("v1 ignores inherited organization MCPs and prompts while preserving personal configuration", () => {
 const personal = { type: "remote", url: "https://personal.example/mcp", headers: { Authorization: "test-only" } };
 const runtime = buildGet3wRuntimeConfigObjectFromSnapshot({ mcp: {
  personal, "get3w-cloud": personal, "get3w-direct-old": personal,
  "get3w-connect-old": personal, "get3w-app-host-connect-old": personal,
 }, managedPrompt: "Organization secret instructions" });
 expect(runtime.mcp).toEqual({ personal });
 expect(JSON.stringify(runtime.agent)).not.toContain("Organization secret instructions");
 expect(JSON.stringify(runtime.plugin)).not.toContain("gateway-quota");
});
test("retired app catalogue does not read private stores or make discovery requests", async () => {
 const config = { configPath: "/must-not-read/server.json" } as ServerConfig;
 let requests = 0;
 const fetcher = async () => { requests++; throw new Error("unexpected request"); };
 expect(await readGet3WConnectMcpAppHostAuthorization(config, "old", "https://old.example")).toBeNull();
 expect((await readGet3WConnectMcpAppHostCatalog(config, "old")).servers).toEqual([]);
 expect((await refreshGet3WConnectMcpAppHostCatalog(config, "old", fetcher)).status).toBe("unavailable");
 expect(requests).toBe(0);
});

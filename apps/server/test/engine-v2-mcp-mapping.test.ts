import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRuntimeMcpToV2 } from "../src/engine-v2-preview.js";
const remote = { type: "remote", url: "https://personal.example/mcp", headers: { Authorization: "Bearer synthetic-test-token" }, oauth: false };
test("retained organization MCP entries never register on v2", () => {
 for (const name of ["openwork-cloud", "openwork-connect-old", "openwork-direct-old", "openwork-app-host-connect-old"]) {
  assert.equal(mapRuntimeMcpToV2(remote, name), undefined);
  assert.equal(mapRuntimeMcpToV2({ type: "local", command: ["example"] }, name), undefined);
 }
});
test("personal MCP configuration preserves credentials and supported fields", () => {
 for (const name of [undefined, "personal", "openwork-cloud-copy", "get3w"]) assert.deepEqual(mapRuntimeMcpToV2({ ...remote, unsupported: true }, name), remote);
 assert.deepEqual(mapRuntimeMcpToV2({ type: "local", command: ["example"] }, "personal"), { type: "local", command: ["example"], environment: {} });
 assert.equal(mapRuntimeMcpToV2({ ...remote, enabled: false }, "personal"), undefined);
});

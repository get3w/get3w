import { expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectConnectState } from "../src/connect-state";
import { listExperimentalExtensionActions } from "../src/extensions/index";
import type { ServerConfig } from "../src/types";

test("personal transport never recovers retained organization credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-credentials-"));
  const previous = process.env.GET3W_RUNTIME_DB;
  process.env.GET3W_RUNTIME_DB = join(root, "runtime.sqlite");
  const path = join(root, "connect-state.json");
  const original = JSON.stringify({ connectEnabled: true, updatedAt: 1, cloudMcp: { url: "https://retired.example.test/mcp/agent", headers: { Authorization: "Bearer legacy-fixture" } } });
  const config = { configPath: join(root, "server.json") } as ServerConfig;
  try {
    await writeFile(path, original);
    const state = await inspectConnectState(config);
    expect(state.status).toBe("available");
    expect(state.state.cloudMcp).toBeNull();
    expect(await readFile(path, "utf8")).toBe(original);
    expect(listExperimentalExtensionActions("openwork-cloud-uploads")).toEqual([]);
    expect(listExperimentalExtensionActions("openai-image-generation").length).toBeGreaterThan(0);
  } finally {
    if (previous === undefined) delete process.env.GET3W_RUNTIME_DB;
    else process.env.GET3W_RUNTIME_DB = previous;
    await rm(root, { recursive: true, force: true });
  }
});

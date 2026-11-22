import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWebObservation, recordWebObservation, type WebObservation } from "../src/web-observations.js";
import { runtimeStorageDir } from "../src/runtime-db.js";

test("host observations preserve original responses, failures, scope and retry history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "get3w-web-observations-"));
  const config = { configPath: join(directory, "config.json") };
  const base: WebObservation = {
    workspaceId: "ws_a", sessionId: "s", messageId: "m", callId: "../../unsafe/call",
    operation: "fetch", input: { url: "https://example.com/" },
    startedAt: 100, observedAt: 200, status: 200,
    response: { content: "unaltered <body>\npublication unknown", request_id: "provider-id" },
  };
  const read = (id: string) => readFile(join(runtimeStorageDir(config), "web-observations", id.slice(0, 2), `${id}.json`), "utf8");
  try {
    const first = await recordWebObservation(config, base);
    const bytes = await read(first.id);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), first.sha256);
    assert.deepEqual(JSON.parse(bytes), { version: 1, ...base });
    assert.deepEqual((await readWebObservation(config, "ws_a", "s", first.id)).record, JSON.parse(bytes));
    await assert.rejects(readWebObservation(config, "ws_b", "s", first.id), /another conversation/);
    await assert.rejects(readWebObservation(config, "ws_a", "other", first.id), /another conversation/);
    await assert.rejects(readWebObservation(config, "ws_a", "s", "../../outside"), /Invalid/);
    assert.equal((await recordWebObservation(config, base)).id, first.id);
    const retry = await recordWebObservation(config, { ...base, observedAt: 300, status: 502, response: { error: { message: "all_providers_failed" } } });
    assert.notEqual(retry.id, first.id);
    assert.equal(JSON.parse(await read(retry.id)).status, 502);
    assert.equal(await read(first.id), bytes);
    for (const scope of [{ workspaceId: "ws_b" }, { sessionId: "other" }, { callId: "other" }]) {
      assert.notEqual((await recordWebObservation(config, { ...base, ...scope })).id, first.id);
    }
    assert.equal(first.started_at, 100);
    assert.equal(first.observed_at, 200);
    assert.equal("published_at" in first, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("host export preserves original evidence and refuses occupied result paths", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { planDeliverable } = await import("../src/workspace-deliverables.js");
  const { exportWebObservation } = await import("../src/web-observations.js");
  const root = await mkdtemp(join(tmpdir(), "web-export-"));
  const workspace: import("../src/types.js").WorkspaceInfo = { id: "ws", name: "Test", path: join(root,"workspace"), preset: "starter", workspaceType: "local" };
  const config: import("../src/types.js").ServerConfig = { host: "127.0.0.1", port: 0, token: "t", hostToken: "h", configPath: join(root,"state/config.json"), approval: {mode:"auto",timeoutMs:1000}, corsOrigins:[], workspaces:[workspace], authorizedRoots:[], readOnly:false, startedAt:0, tokenSource:"generated", hostTokenSource:"generated", logFormat:"json", logRequests:false };
  try {
    await mkdir(workspace.path);
    const observation = await recordWebObservation(config, { workspaceId:"ws", sessionId:"s", messageId:"m", callId:"c", operation:"fetch", input:{url:"https://example.com"}, startedAt:1, observedAt:2, status:200, response:{content:"Original unchanged source".repeat(20000)} });
    const plan = await planDeliverable(config, workspace, {key:"evidence",directory:".",filename:"evidence",extension:".json"});
    const exported = await exportWebObservation(config, workspace, "s", observation.id, plan.fileId);
    assert.equal(await readFile(join(workspace.path,plan.path),"utf8"), JSON.stringify(await readWebObservation(config,"ws","s",observation.id)));
    assert.equal(exported.saved.fileId, plan.fileId);
    assert.equal(exported.id, observation.id);
    assert.equal(exported.sha256, observation.sha256);
    assert.ok(!("record" in exported));
    assert.ok(JSON.stringify(exported).length < 4000);
    const changed = await recordWebObservation(config, { workspaceId:"ws", sessionId:"s", messageId:"m", callId:"c2", operation:"fetch", input:{url:"https://example.com"}, startedAt:3, observedAt:4, status:200, response:{content:"Different source"} });
    await assert.rejects(exportWebObservation(config,workspace,"s",changed.id,plan.fileId),/different observation/);
    assert.equal(await readFile(join(workspace.path,plan.path),"utf8"), JSON.stringify(await readWebObservation(config,"ws","s",observation.id)));
    await assert.rejects(exportWebObservation(config,workspace,"other",observation.id,plan.fileId),/another conversation/);
    const occupied = await planDeliverable(config, workspace, {key:"occupied",directory:".",filename:"occupied",extension:".json"});
    await writeFile(join(workspace.path,occupied.path), "user content");
    await assert.rejects(exportWebObservation(config,workspace,"s",observation.id,occupied.fileId),/occupied/);
    assert.equal(await readFile(join(workspace.path,occupied.path),"utf8"),"user content");
  } finally { await rm(root,{recursive:true,force:true}); }
});

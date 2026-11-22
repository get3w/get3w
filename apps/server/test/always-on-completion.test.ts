import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitAlwaysOnCompletion, readAlwaysOnCompletion } from "../src/always-on-completion";
const identity = { eventId: "event-test", sessionId: "session-test", messageId: "message-test" };
const input = { outcome: "changed", summary: "Report saved", artifacts: ["report.md"], continuity: "Report checked; waiting for next event", notification: { action: "send", text: "Report ready" } };
async function fixture(run: (root: string) => Promise<void>) {
 const root = await mkdtemp(join(tmpdir(), "completion-"));
 try { await writeFile(join(root, "report.md"), "Verified report"); await run(root); }
 finally { await rm(root, { recursive: true, force: true }); }
}
test("durable receipt survives response loss and identical retry without rewriting", () => fixture(async root => {
 const first = await commitAlwaysOnCompletion(root, identity, input, 100);
 expect(first.evidence[0].sha256).toHaveLength(64);
 expect(await readAlwaysOnCompletion(root, identity)).toEqual(first);
 // A retry after commit must not depend on a deliverable still being present.
 await rm(join(root, "report.md"));
 expect(await commitAlwaysOnCompletion(root, identity, input, 200)).toEqual(first);
 await expect(commitAlwaysOnCompletion(root, identity, { ...input, summary: "Different" })).rejects.toThrow("different completion");
 await expect(readAlwaysOnCompletion(root, { ...identity, sessionId: "other" })).rejects.toThrow("another run");
}));
test("missing, empty, internal, escaping and symlink artifacts never commit", () => fixture(async root => {
 await expect(commitAlwaysOnCompletion(root, identity, { ...input, artifacts: ["missing.md"] })).rejects.toMatchObject({status:422,code:"completion_artifact_missing"});
 await symlink(join(root, "report.md"), join(root, "link.md"));
 await writeFile(join(root, "empty.md"), "");
 for (const path of ["missing.md", "empty.md", "../outside.md", "/etc/hosts", "link.md", ".get3w/always-on/state.json"]) {
  await expect(commitAlwaysOnCompletion(root, identity, { ...input, artifacts: [path] })).rejects.toThrow();
  expect(await readAlwaysOnCompletion(root, identity)).toBeNull();
 }
 await expect(commitAlwaysOnCompletion(root, identity, { ...input, summary: "" })).rejects.toThrow();
 expect(await readAlwaysOnCompletion(root, identity)).toBeNull();
}));
test("storage failure and corrupt receipt cannot be treated as success", () => fixture(async root => {
 const directory = join(root, ".get3w/always-on/completions");
 await mkdir(directory, { recursive: true });
 await mkdir(join(directory, `${identity.eventId}.json`));
 await expect(commitAlwaysOnCompletion(root, identity, input)).rejects.toThrow();
 await rm(join(directory, `${identity.eventId}.json`), { recursive: true });
 await writeFile(join(directory, `${identity.eventId}.json`), "{broken");
 await expect(readAlwaysOnCompletion(root, identity)).rejects.toThrow();
 expect(await readFile(join(directory, `${identity.eventId}.json`), "utf8")).toBe("{broken");
}));
test("quiet completion requires explicit valid conclusion without deliverables", () => fixture(async root => {
 const receipt = await commitAlwaysOnCompletion(root, identity, { ...input, outcome: "no_change", artifacts: [], notification: { action: "quiet" } });
 expect(receipt.input.notification.action).toBe("quiet");
 expect(receipt.evidence).toEqual([]);
}));

test("scheduled delivery metadata is durable and validates its delivery window",()=>fixture(async root=>{
 const notification={action:"send",text:"Prepared",notBefore:2000,expiresAt:3000,dedupeKey:"instance:2026-11-22:system"};
 const receipt=await commitAlwaysOnCompletion(root,identity,{...input,notification},1000);
 expect(receipt.input.notification).toEqual(notification);
 expect((await readAlwaysOnCompletion(root,identity))?.input.notification).toEqual(notification);
 for(const changes of [{notBefore:-1},{expiresAt:2000},{expiresAt:1000},{dedupeKey:""}])await expect(commitAlwaysOnCompletion(root,{...identity,eventId:"invalid"},{...input,notification:{...notification,...changes}})).rejects.toThrow();
}));

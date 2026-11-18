import { test, expect } from "bun:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { effectiveWorkspaceConfig, saveWorkspaceProjectConfig } from "../src/get3w-project-config";

test("project edits override cached metadata without importing grants; patches keep local state out of root file", async () => {
 const root = await mkdtemp(join(tmpdir(), "get3w-config-api-"));
 try {
  const local = { version: 1, workspace: { name: "Cached" }, authorizedRoots: [root], reload: { auto: true } };
  await writeFile(join(root, "get3w.json"), JSON.stringify({version:1,workspace:{name:"Edited"},runtime:"pi",authorizedRoots:["/untrusted"]}));
  const effective = await effectiveWorkspaceConfig(root, local);
  expect(effective.workspace).toEqual({name:"Edited"});
  expect(effective.authorizedRoots).toEqual([root]);
  const next = await saveWorkspaceProjectConfig(root, local, {runtime:"opencode"});
  expect(next.authorizedRoots).toEqual([root]);
  expect(JSON.parse(await readFile(join(root,"get3w.json"),"utf8"))).toEqual({version:1,workspace:{name:"Edited"},runtime:"opencode"});
 } finally { await rm(root,{recursive:true,force:true}); }
});

import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeTaskPermissionMode, setTaskPermissionMode, taskPermissionSettings } from "../src/task-permission-modes.js";
import { rememberThreadApproval, listThreadApprovals, revokeThreadApproval, grantCovers } from "../src/thread-approvals.js";
import type { ServerConfig } from "../src/types.js";
const config = async () => ({ configPath: join(await mkdtemp(join(tmpdir(), "task-permission-")), "server.json") }) as Promise<ServerConfig>;

test("mode persists, defaults apply only to newly created roots, and children inherit their parent", async () => {
  const c = await config();
  expect((await taskPermissionSettings(c, "historical")).mode).toBe("default");
  await initializeTaskPermissionMode(c, "existing");
  await setTaskPermissionMode(c, "full_access", "current");
  await initializeTaskPermissionMode(c, "new");
  expect((await taskPermissionSettings(c, "new")).mode).toBe("full_access");
  expect((await taskPermissionSettings(c, "existing")).mode).toBe("default");
  expect((await taskPermissionSettings(c, "historical")).mode).toBe("default");
  await initializeTaskPermissionMode(c, "child", "existing");
  expect((await taskPermissionSettings(c, "child")).mode).toBe("default");
  await initializeTaskPermissionMode(c, "fork", "existing", true);
  expect((await taskPermissionSettings(c, "fork")).mode).toBe("full_access");
  await setTaskPermissionMode(c, "default", "current");
  expect((await taskPermissionSettings({ ...c }, "new")).mode).toBe("full_access");
  expect((await taskPermissionSettings({ ...c })).defaultMode).toBe("default");
});
test("concurrent updates do not lose other tasks and initialization never overwrites a mode", async () => {
  const c = await config();
  await Promise.all(Array.from({ length: 20 }, (_, i) => setTaskPermissionMode(c, "full_access", `task${i}`)));
  for (let i=0;i<20;i++) expect((await taskPermissionSettings(c, `task${i}`)).mode).toBe("full_access");
  await setTaskPermissionMode(c, "default");
  await initializeTaskPermissionMode(c, "task0");
  expect((await taskPermissionSettings(c, "task0")).mode).toBe("full_access");
});
test("same-operation grants stay scoped and can be revoked without clearing another chat", async () => {
  const c = await config();
  await rememberThreadApproval(c, "w", "a", {permission:"shell", patterns:["git status*"]});
  await rememberThreadApproval(c, "w", "b", {permission:"shell", patterns:["pwd"]});
  const [grant] = await listThreadApprovals(c,"w","a");
  expect(grantCovers(grant,"shell",["git status --short"])).toBe(true);
  expect(grantCovers(grant,"shell",["rm -rf other"])).toBe(false);
  expect(await listThreadApprovals(c,"other","a")).toEqual([]);
  await revokeThreadApproval(c,"w","a",0);
  expect(await listThreadApprovals(c,"w","a")).toEqual([]);
  expect(await listThreadApprovals(c,"w","b")).toHaveLength(1);
});

test("concurrent chat grants are retained and stale revocations cannot delete a different grant",async()=>{
 const c=await config();
 await Promise.all(Array.from({length:12},(_,i)=>rememberThreadApproval(c,"w","a",{permission:"shell",patterns:[`command${i}`]})));
 const grants=await listThreadApprovals(c,"w","a");expect(grants).toHaveLength(12);
 await revokeThreadApproval(c,"w","a",0,grants[0]);
 await expect(revokeThreadApproval(c,"w","a",0,grants[0])).rejects.toThrow("Permission changed");
 expect(await listThreadApprovals(c,"w","a")).toHaveLength(11);
});

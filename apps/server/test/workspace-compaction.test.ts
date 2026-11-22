import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readWorkspaceCompaction, writeWorkspaceAutoCompaction } from "../src/workspace-compaction.js";

test("workspace auto compaction persists without affecting sibling workspaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "compaction-scope-"));
  try {
    const first = join(root, "first"), second = join(root, "second");
    await mkdir(first); await mkdir(second);
    expect(await writeWorkspaceAutoCompaction(first, { auto: false })).toEqual({ changed: true, path: join(first, "opencode.jsonc") });
    expect(await readWorkspaceCompaction(first)).toEqual({ auto: false });
    expect(await readWorkspaceCompaction(second)).toBeUndefined();
    expect((await writeWorkspaceAutoCompaction(first, { auto: false })).changed).toBe(false);
    await writeWorkspaceAutoCompaction(first, { auto: true });
    expect(await readWorkspaceCompaction(first)).toEqual({ auto: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("engine precedence, comments and other compaction options survive a toggle", async () => {
  const root = await mkdtemp(join(tmpdir(), "compaction-project-"));
  try {
    await mkdir(join(root, ".opencode"));
    const low = join(root, "opencode.jsonc"), high = join(root, ".opencode", "opencode.jsonc");
    await writeFile(low, '{"compaction":{"auto":true,"buffer":100}}');
    await writeFile(high, '// keep this comment\n{"compaction":{"auto":true,"keep":{"tokens":200}},"model":"fixture"}\n');
    expect((await writeWorkspaceAutoCompaction(root, { auto: false })).path).toBe(high);
    expect(await readWorkspaceCompaction(root)).toEqual({ auto: false, buffer: 100, keep: { tokens: 200 } });
    expect(await readFile(high, "utf8")).toContain("// keep this comment");
    expect(await readFile(high, "utf8")).toContain('"model":"fixture"');
    expect(await readFile(low, "utf8")).toBe('{"compaction":{"auto":true,"buffer":100}}');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid patches and malformed project files are rejected without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "compaction-invalid-"));
  try {
    await expect(writeWorkspaceAutoCompaction(root, { auto: "false" })).rejects.toThrow();
    await expect(writeWorkspaceAutoCompaction(root, { auto: false, unknown: 1 })).rejects.toThrow();
    const path = join(root, "opencode.jsonc");
    await writeFile(path, "{ broken");
    await expect(writeWorkspaceAutoCompaction(root, { auto: false })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{ broken");
  } finally { await rm(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildOpenWorkV2Instructions, readConfiguredInstructions } from "../src/opencode-v2-instructions.js";

test("personal instructions do not advertise organization tools or a cloud runner", () => {
  for (const ready of [true, false]) {
    const instructions = buildOpenWorkV2Instructions(ready);
    assert.match(instructions.operatingInstructions, /Get3W/);
    assert.match(instructions.operatingInstructions, /Call one outer tool at a time/);
    assert.match(instructions.operatingInstructions, /read needs path, shell needs command, and execute needs code/);
    assert.match(instructions.connect, /Get3W model gateway/);
    assert.match(instructions.automations, /automation.propose/);
    assert.match(instructions.automations, /must be open/);
    assert.match(instructions.automations, /Cloud execution and meeting-triggered schedules are not available/);
    assert.doesNotMatch(JSON.stringify(instructions), /search_capabilities|execute_capability|signed-in desktop runner/);
  }
});

test("configured instructions load workspace files the engine skips", async () => {
  const base = await mkdtemp(join(tmpdir(), "openwork-configured-instructions-"));
  try {
    const workspace = join(base, "workspace");
    await mkdir(join(workspace, ".opencode"), { recursive: true });
    await mkdir(join(workspace, "rules"));
    await writeFile(join(base, "outside.md"), "outside rules");
    await writeFile(join(workspace, ".opencode", "AGENTS.md"), "project rules");
    await writeFile(join(workspace, "rules", "b.md"), "rule b");
    await writeFile(join(workspace, "rules", "a.md"), "rule a");
    await symlink(join(base, "outside.md"), join(workspace, "rules", "c.md"));
    await writeFile(join(workspace, "opencode.jsonc"), `{
      // Same file twice, a glob, paths outside the workspace and a URL.
      "instructions": [".opencode/AGENTS.md", "rules/*.md", "../outside.md", "${join(base, "outside.md")}", "https://example.com/rules.md"],
    }`);
    await writeFile(join(workspace, ".opencode", "opencode.json"), JSON.stringify({ instructions: [".opencode/AGENTS.md"] }));

    assert.equal(await readConfiguredInstructions(workspace), [
      `Instructions from: ${join(workspace, ".opencode", "AGENTS.md")}\nproject rules`,
      `Instructions from: ${join(workspace, "rules", "a.md")}\nrule a`,
      `Instructions from: ${join(workspace, "rules", "b.md")}\nrule b`,
    ].join("\n\n"));

    await writeFile(join(workspace, "opencode.jsonc"), "{}");
    await rm(join(workspace, ".opencode", "opencode.json"));
    assert.equal(await readConfiguredInstructions(workspace), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("configured instructions never send local or secret files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "openwork-configured-instructions-git-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    await mkdir(join(workspace, "rules"));
    await writeFile(join(workspace, ".gitignore"), "private.md\n");
    await writeFile(join(workspace, "CONTRIBUTING.md"), "shared rules");
    await writeFile(join(workspace, "private.md"), "ignored notes");
    await writeFile(join(workspace, ".env"), "TOKEN=secret");
    await writeFile(join(workspace, "deploy.env.md"), "TOKEN=secret");
    await writeFile(join(workspace, "credentials.json"), "{\"token\":\"secret\"}");
    await symlink(join(workspace, ".env"), join(workspace, "rules", "env.md"));
    await symlink(join(workspace, "private.md"), join(workspace, "rules", "private-link.md"));
    await writeFile(join(workspace, "opencode.json"), JSON.stringify({
      instructions: ["CONTRIBUTING.md", "private.md", ".env", "deploy.env.md", "credentials.json", "rules/*.md"],
    }));

    assert.equal(await readConfiguredInstructions(workspace), `Instructions from: ${join(workspace, "CONTRIBUTING.md")}\nshared rules`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});


test("connected model gateway guides native generation and image editing without advertising it offline", () => {
  const connected = buildOpenWorkV2Instructions(false, true);
  assert.match(connected.connect, /get3w-account/);
  assert.match(connected.connect, /search_capabilities/);
  assert.match(connected.connect, /previous generated image URL/);
  assert.match(connected.connect, /native approval card/);
  assert.match(connected.connect, /including missing illustrations inside office documents/);
  assert.match(connected.connect, /Do not open an external generation app or website/);
  assert.match(connected.connect, /third-party generation CLI or skill/);
  assert.match(connected.connect, /preserve work for retry/);
  assert.match(connected.connect, /never call execute with \{\} or omit code/);
  assert.match(connected.connect, /non-empty string field code/);
  assert.match(connected.connect, /Never use a centered crop that clips the product/);
  assert.match(connected.connect, /all label text inside safe margins/);
  assert.match(connected.connect, /Preserve the original subject pixels with a foreground mask/);
  assert.match(connected.connect, /also preserve the cup from the original scene/);
  assert.match(connected.connect, /Code Mode does not provide setTimeout/);
  assert.match(connected.connect, /continuous scene content across the entire canvas/);
  assert.match(connected.connect, /reopen every final output after the last write/);
  assert.match(connected.connect, /pass both URLs to a model that supports multiple image references/);
  assert.match(connected.connect, /same inner and outer idempotency_key/);
  assert.doesNotMatch(buildOpenWorkV2Instructions(false).connect, /gateway is connected|search_capabilities/);
});


test("deliverables use the user workspace rather than engine scratch space", () => {
  const instructions=buildOpenWorkV2Instructions(false,true,"/user/workspace");
  assert.match(instructions.context,/\/user\/workspace/);
  assert.match(instructions.context,/absolute Markdown file links/);
});


test("presentations require confirmation, bounded geometry and verified isolated revisions", () => {
  const instructions = buildOpenWorkV2Instructions(false, true);
  assert.match(instructions.presentations, /wait for the user's confirmation/);
  assert.match(instructions.presentations, /both width and height limits/);
  assert.match(instructions.presentations, /out-of-bounds objects/);
  assert.match(instructions.presentations, /render every slide and visually inspect/);
  assert.match(instructions.presentations, /other slides and their media unchanged/);
  assert.match(instructions.presentations, /model request IDs/);
  assert.match(instructions.presentations, /including at the outline stage/);
  assert.match(instructions.presentations, /Omit unsupported details/);
  assert.match(instructions.presentations, /DrawingML a:ea/);
  assert.match(instructions.presentations, /source-image letterbox bars/);
  assert.match(instructions.presentations, /explicit text wrapping/);
  assert.match(instructions.presentations, /actual viewer as well as its PDF/);
  assert.match(instructions.presentations, /Export PDF directly from the final PPTX/);
});


test("documents require actual editable files, live fields and isolated revisions", () => {
  const { documents } = buildOpenWorkV2Instructions(false, true);
  assert.match(documents, /do not hand a prose instruction to computer_open/);
  assert.match(documents, /Discover installed apps/);
  assert.match(documents, /real TOC, PAGE, SEQ and REF\/PAGEREF fields/);
  assert.match(documents, /Update field results/);
  assert.match(documents, /render and visually inspect every page/);
  assert.match(documents, /only the requested paragraph and dependent field results/);
  assert.match(documents, /quote and settled charge/);
  assert.match(documents, /preserve original product pixels/);
});

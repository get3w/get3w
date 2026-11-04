import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mapRuntimeProvidersToV2Specs } from "../src/engine-v2-preview.js";

const preset = JSON.parse(readFileSync(new URL("../../../config/openwork-provider.json", import.meta.url), "utf8"));

test("Get3W uses Chat Completions, retains model IDs and tool capability", () => {
  const result = mapRuntimeProvidersToV2Specs(preset, new Map(), new Map([["openwork", "test-only-key"]]), new Set(["openwork"]));
  assert.deepEqual(result.skippedProviderIds, []);
  const spec = result.specs[0];
  assert.equal(spec?.baseUrl, "https://api.openwork.com/v1");
  assert.equal(spec?.package, "@opencode/ai/providers/openai-compatible");
  assert.equal(spec?.apiKey, "test-only-key");
  assert.ok(spec?.models.some(model => model.id === "gpt-6.1-sol" && model.config?.tool_call === true));
});

test("Get3W stays unavailable without its own credential", () => {
  const result = mapRuntimeProvidersToV2Specs(preset, new Map([["OPENAI_API_KEY", "unrelated-test-key"]]), new Map(), new Set(["openwork"]));
  assert.deepEqual(result.specs, []);
  assert.deepEqual(result.skippedProviders, [{ id: "openwork", reason: "credentials" }]);
});

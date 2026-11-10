import { test } from "node:test";
import assert from "node:assert/strict";
import { get3wModelName } from "./get3w-model-name.mjs";

test("account models use readable product names without the Get3W prefix", () => {
  for (const [id, label] of [
    ["gemini-3.8-flash", "Gemini 3.8 Flash"],
    ["gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash Lite Preview"],
    ["claude-opus-5.5", "Claude Opus 5.5"],
    ["claude-fable-5.1", "Claude Fable 5.1"],
    ["gpt-6-astra", "GPT 6 Astra"],
    ["get3w-auto", "Auto"],
  ]) assert.equal(get3wModelName(id), label);
});

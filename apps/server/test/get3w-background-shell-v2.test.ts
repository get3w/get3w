import assert from "node:assert/strict";
import { test } from "node:test";
import { quietShellNotice } from "../src/opencode-plugins/get3w-background-shell-v2.js";

test("explicit stop parks its own completion without waking the owner", () => {
  const input = { sessionID: "ses_a", metadata: { source: "shell", shellID: "sh_1", state: "error" } };
  assert.deepEqual(quietShellNotice(input, new Map([["sh_1", "ses_a"]])), {
    ...input, text: "The user explicitly stopped this background task. Keep it stopped unless the user asks to restart it.", resume: false, delivery: "queue", metadata: { ...input.metadata, state: "cancelled", get3wUserStopped: true },
  });
});
test("ordinary completion, other sessions and other synthetic sources stay unchanged", () => {
  for (const input of [
    { sessionID: "ses_a", metadata: { source: "shell", shellID: "sh_other" } },
    { sessionID: "ses_b", metadata: { source: "shell", shellID: "sh_1" } },
    { sessionID: "ses_a", metadata: { source: "subagent", shellID: "sh_1" } },
  ]) assert.equal(quietShellNotice(input, new Map([["sh_1", "ses_a"]])), input);
});

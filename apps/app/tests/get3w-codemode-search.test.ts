import { expect, test } from "bun:test";
import type { ToolPart } from "@opencode-ai/sdk/v2/client";
import { codeModeConnectionParts } from "../src/app/lib/opencode-v2-adapter";

function script(status: "running" | "completed" | "error", inner: string): ToolPart {
  const metadata = { toolCalls: [{ tool: "get3w-account.search_capabilities", status: inner, input: { query: "models" } }] };
  const base = { id: "call", callID: "call", messageID: "msg", sessionID: "ses", type: "tool" as const, tool: "execute", metadata: { openworkV2CodeMode: true } };
  if (status === "running") return { ...base, state: { status, input: {}, title: "execute", metadata, time: { start: 1 } } };
  if (status === "error") return { ...base, state: { status, input: {}, error: "denied", metadata, time: { start: 1, end: 2 } } };
  return { ...base, state: { status, input: {}, output: "script output", title: "execute", metadata, time: { start: 1, end: 2 } } };
}

test("Get3W discovery's terminal projection replaces its running row without inventing output", () => {
  const running = codeModeConnectionParts(script("running", "running"));
  const completed = codeModeConnectionParts(script("completed", "completed"));
  expect(running).toHaveLength(1);
  expect(completed).toHaveLength(1);
  expect(completed[0].id).toBe(running[0].id);
  expect(completed[0].state.status).toBe("completed");
  expect(completed[0].state).toMatchObject({ output: JSON.stringify({ unrecorded: true }) });
});

test("search failures settle as errors and unfinished inner calls do not become successes", () => {
  expect(codeModeConnectionParts(script("error", "error"))[0].state.status).toBe("error");
  expect(codeModeConnectionParts(script("completed", "running"))).toEqual([]);
});

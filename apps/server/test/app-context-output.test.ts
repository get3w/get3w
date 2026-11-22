import { test, expect } from "bun:test";
import { formatAppContextOutput } from "../src/app-context-output.js";

test("large retained context keeps schemas once and current workspace visible", () => {
  const affordance = { id: "session.search", kind: "query", arguments: [{ name: "query", type: "string" }], effects: { data: "read" } };
  const output = formatAppContextOutput({ ok: true, context: {
    screen: { workspaceId: "current" },
    conversations: { tabs: [...Array.from({ length: 100 }, (_, i) => ({ workspaceId: "other", sessionId: String(i) })), { workspaceId: "current", sessionId: "active" }] },
    resources: Array.from({ length: 100 }, (_, i) => ({ ref: String(i) })),
    availableAffordances: [affordance], contributions: [{ featureId: "sessions", affordances: [affordance] }],
  } });
  const result = JSON.parse(output);
  expect(result.context.conversations.tabs[0].sessionId).toBe("active");
  expect(result.context.conversations.tabs).toHaveLength(8);
  expect(result.context.conversations.tabsOmitted).toBe(93);
  expect(result.context.resourcesOmitted).toBe(92);
  expect(result.context.availableAffordances).toEqual([affordance]);
  expect(result.context.contributions[0].affordanceIds).toEqual(["session.search"]);
  expect(output.split("\n").length).toBeGreaterThan(10);
  expect(Buffer.byteLength(output)).toBeLessThan(10000);
});

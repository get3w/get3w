import { test, expect } from "bun:test";
import { isAlwaysOnTaskSession } from "../src/react-app/domains/workspace/always-on-task-session";
test("only explicit task ownership hides input; local and ordinary sessions remain editable", () => {
 const task = { id: "task", get3wPurpose: "task", get3wTaskId: "workspace" };
 expect(isAlwaysOnTaskSession("always-on", "workspace", "task", task)).toBe(true);
 expect(isAlwaysOnTaskSession("always-on", "workspace", "legacy", undefined, "legacy")).toBe(true);
 expect(isAlwaysOnTaskSession("local", "workspace", "task", task, "task")).toBe(false);
 expect(isAlwaysOnTaskSession("always-on", "workspace", "ordinary", {id:"ordinary", title:"持续任务"}, "task")).toBe(false);
 expect(isAlwaysOnTaskSession("always-on", "other", "task", task)).toBe(false);
});

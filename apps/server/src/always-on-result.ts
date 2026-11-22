import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { completionNotificationSchema as notificationSchema } from "./always-on-completion.js";
export const verificationSchema = z.object({
  notification: notificationSchema.optional(),
  status: z.enum(["verified", "needs_review"]), checkedAt: z.number(),
  issues: z.array(z.enum(["result_invalid", "checkpoint_missing", "artifact_missing"])),
  outcome: z.enum(["changed", "no_change"]).optional(), summary: z.string().optional(), artifacts: z.array(z.string()).optional(),
});
const resultSchema = z.object({ notification: notificationSchema.optional(), eventId: z.string(), outcome: z.enum(["changed", "no_change"]), summary: z.string().trim().min(1).max(4000), artifacts: z.array(z.string().min(1).max(1000)).max(100) });
export const resultPath = (id: string) => `.get3w/always-on/results/${id}.json`;
// File evidence only; this does not certify external facts or delivery.
export async function verifyAlwaysOnResult(root: string, id: string, startedAt: number, now: number) {
  const issues: z.infer<typeof verificationSchema>["issues"] = [];
  async function file(path: string) {
    if (isAbsolute(path) || path.includes("\\") || !path.trim()) throw Error("Invalid path");
    const base = await realpath(root); const target = resolve(base, path); const inside = relative(base, target);
    if (!inside || inside === ".." || inside.startsWith("../") || isAbsolute(inside)) throw Error("Outside workspace");
    let part = base;
    for (const name of inside.split("/")) { part = join(part, name); if ((await lstat(part)).isSymbolicLink()) throw Error("Symbolic link"); }
    const info = await lstat(target);
    if (!info.isFile() || info.size === 0) throw Error("Missing file");
    return { path: target, info };
  }
  let result: z.infer<typeof resultSchema> | undefined;
  try {
    const entry = await file(resultPath(id));
    if (entry.info.size > 128000 || entry.info.mtimeMs < startedAt) throw Error("Stale result");
    const parsed = resultSchema.parse(JSON.parse(await readFile(entry.path, "utf8")));
    if (parsed.eventId !== id) throw Error("Wrong event");
    result = parsed;
  } catch { issues.push("result_invalid"); }
  try {
    const entry = await file(".get3w/always-on/checkpoint.md");
    if (entry.info.size > 96000 || entry.info.mtimeMs < startedAt || !(await readFile(entry.path, "utf8")).includes(id)) throw Error("Missing continuity evidence");
  } catch { issues.push("checkpoint_missing"); }
  if (result) for (const path of result.artifacts) {
    try { if ((path === ".get3w" || path.startsWith(".get3w/")) && path !== ".get3w/always-on/checkpoint.md" && path !== resultPath(id)) throw Error("Not a deliverable"); await file(path); }
    catch { issues.push("artifact_missing"); break; }
  }
  return verificationSchema.parse({ status: issues.length ? "needs_review" : "verified", checkedAt: now, issues, ...(result ? { notification: result.notification, outcome: result.outcome, summary: result.summary, artifacts: result.artifacts } : {}) });
}

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { ApiError } from "./errors.js";

const timestamp = z.number().int().safe().positive().max(8640000000000000);
export const completionNotificationSchema = z.discriminatedUnion("action", [
  z.object({ action:z.literal("send"), text:z.string().trim().min(1).max(4000),
    notBefore:timestamp.optional(), expiresAt:timestamp.optional(), dedupeKey:z.string().trim().min(1).max(500).optional(),
  }).strict().refine(value => value.expiresAt === undefined || value.notBefore === undefined || value.expiresAt > value.notBefore, "Delivery expiry must be after its scheduled time"),
  z.object({ action:z.literal("quiet") }).strict(),
]);

export const completionInputSchema = z.object({
  outcome: z.enum(["changed", "no_change"]),
  summary: z.string().trim().min(1).max(4000),
  artifacts: z.array(z.string().min(1).max(1000).refine(path => !isAbsolute(path) && !path.includes("\\") && !path.split("/").some(part => part === ".." || part === ".get3w"), "Use workspace-relative deliverable paths, such as candidates.md; never absolute paths or .get3w runtime files")).max(100),
  continuity: z.string().trim().min(1).max(24000),
  followupSuggestions: z.array(z.object({text:z.string().trim().min(1).max(16000),dueAt:z.number().int().safe().positive().max(8640000000000000)}).strict()).max(5).optional(),
  memorySuggestions: z.array(z.string().trim().min(1).max(2000)).max(5).optional(),
  notification: completionNotificationSchema,
}).strict();
const identitySchema = z.object({ eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/), sessionId: z.string().min(1), messageId: z.string().min(1) });
const receiptSchema = z.object({
  version: z.literal(1), identity: identitySchema, committedAt: z.number(), digest: z.string(), input: completionInputSchema,
  evidence: z.array(z.object({ path: z.string(), bytes: z.number(), sha256: z.string() })),
});
export type CompletionIdentity = z.infer<typeof identitySchema>;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

// Called under the runner's workspace lock. The receipt is the single commit
// point. Legacy result/checkpoint files are projections, never another commit.
async function folder(root: string, create = true) {
  const base = await realpath(root);
  let path = base;
  for (const name of [".get3w", "always-on", "completions"]) {
    path = join(path, name);
    if (create) await mkdir(path).catch(error => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error("Unsafe completion storage");
  }
  return path;
}
async function stored(path: string) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512000) throw Error("Invalid completion receipt");
    return receiptSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
export async function readAlwaysOnCompletion(root: string, identity: CompletionIdentity) {
  const expected = identitySchema.parse(identity);
  let directory: string;
  try { directory = await folder(root, false); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const path = join(directory, `${expected.eventId}.json`);
  const receipt = await stored(path);
  if (receipt && JSON.stringify(receipt.identity) !== JSON.stringify(expected)) throw Error("Completion belongs to another run");
  if (receipt && receipt.digest !== hash(JSON.stringify(receipt.input))) throw Error("Invalid completion digest");
  return receipt;
}
export async function commitAlwaysOnCompletion(root: string, identity: CompletionIdentity, value: unknown, now = Date.now()) {
  const expected = identitySchema.parse(identity);
  const input = completionInputSchema.parse(value);
  const digest = hash(JSON.stringify(input));
  const previous = await readAlwaysOnCompletion(root, expected);
  if (previous) {
    if (previous.digest !== digest) throw Error("This run already has a different completion");
    return previous;
  }
  const base = await realpath(root);
  const evidence = [];
  for (const path of input.artifacts) {
    const local = relative(base, resolve(base, path));
    if (isAbsolute(path) || path.includes("\\") || !local || local === ".." || local.startsWith("../") || isAbsolute(local) || local.split("/").some(part => part === ".get3w")) throw Error("Invalid deliverable path");
    let target = base;
    for (const part of local.split("/")) {
      target = join(target, part);
      const entry = await lstat(target).catch(error => {
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") throw new ApiError(422, "completion_artifact_missing", `Deliverable does not exist: ${path}. A planned path is not a saved file. Verify existing files; omit missing files and report the limitation.`);
        throw error;
      });
      if (entry.isSymbolicLink()) throw new ApiError(422, "completion_artifact_invalid", "Deliverable cannot be a symbolic link");
    }
    const info = await lstat(target);
    if (!info.isFile() || !info.size) throw new ApiError(422, "completion_artifact_invalid", `Deliverable is not a nonempty file: ${path}`);
    // Stream large artifacts; do not load media into the host's memory.
    const file = await open(target, "r");
    const digest = createHash("sha256");
    try { for await (const chunk of file.createReadStream({ autoClose: false })) digest.update(chunk); }
    finally { await file.close(); }
    const after = await lstat(target);
    if (after.isSymbolicLink() || after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw Error("Deliverable changed during verification");
    evidence.push({ path, bytes: info.size, sha256: digest.digest("hex") });
  }
  const receipt = receiptSchema.parse({ version: 1, identity: expected, committedAt: now, digest, input, evidence });
  const directory = await folder(root);
  const destination = join(directory, `${expected.eventId}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(receipt)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, destination);
    const directoryHandle = await open(directory, "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } finally { await rm(temporary, { force: true }); }
  return receipt;
}

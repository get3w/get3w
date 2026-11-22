import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runtimeStorageDir } from "./runtime-db.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";
import { resolveDeliverable, saveDeliverableBytes } from "./workspace-deliverables.js";
import { get3wspaceFileForReading } from "./workspace-file-identity.js";

export type WebObservation = {
  workspaceId: string;
  sessionId: string;
  messageId: string;
  callId: string;
  operation: "search" | "fetch";
  input: Record<string, unknown>;
  startedAt: number;
  observedAt: number;
  status: number;
  response: unknown;
};

/** Host records retain provider responses, not model-authored interpretations. */
export async function recordWebObservation(config: Pick<ServerConfig, "configPath">, observation: WebObservation) {
  const identity = createHash("sha256").update(JSON.stringify([
    observation.workspaceId, observation.sessionId, observation.callId,
  ])).digest("hex");
  const bytes = JSON.stringify({ version: 1, ...observation });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const directory = join(runtimeStorageDir(config), "web-observations", identity.slice(0, 2));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Content-addressed attempts preserve retries of the same call as separate observations.
  const path = join(directory, `${identity}-${sha256}.json`);
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== bytes) throw Error("Web observation integrity check failed");
  }
  return { id: `${identity}-${sha256}`, sha256, started_at: observation.startedAt, observed_at: observation.observedAt };
}

export async function readWebObservation(config: Pick<ServerConfig, "configPath">, workspaceId: string, sessionId: string, id: string) {
  if (!/^[a-f0-9]{64}-[a-f0-9]{64}$/.test(id)) throw Error("Invalid web observation identity");
  const path = join(runtimeStorageDir(config), "web-observations", id.slice(0, 2), `${id}.json`);
  const bytes = await readFile(path, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (!id.endsWith(`-${digest}`)) throw Error("Web observation integrity check failed");
  const record: unknown = JSON.parse(bytes);
  if (typeof record !== "object" || record === null || !("workspaceId" in record) || !("sessionId" in record)
    || record.workspaceId !== workspaceId || record.sessionId !== sessionId) throw Error("Web observation belongs to another conversation");
  return { id, sha256: digest, record };
}

export async function exportWebObservation(config: ServerConfig, workspace: WorkspaceInfo, sessionId: string, id: string, fileId: string) {
  const observation = await readWebObservation(config, workspace.id, sessionId, id);
  const plan = await resolveDeliverable(config, workspace, fileId);
  const bytes = JSON.stringify(observation);
  const saved = await saveDeliverableBytes(config, workspace, plan, new TextEncoder().encode(bytes));
  const root = await realpath(workspace.path);
  const opened = await get3wspaceFileForReading(root, join(root, saved.path), saved.path);
  try {
    if (await opened.handle.readFile("utf8") !== bytes) throw Error("This result contains a different observation; plan a new JSON result");
  } finally { await opened.handle.close(); }
  // The original bytes are in the workspace file. Repeating a large response
  // here can truncate the export receipt and send readers back to tool caches.
  return { id: observation.id, sha256: observation.sha256, saved };
}

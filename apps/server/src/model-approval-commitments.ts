import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";
import type { ApprovalService, ModelApprovalCommitSnapshot } from "./approvals.js";

function parseSnapshot(json: string): ModelApprovalCommitSnapshot {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.sessions)) {
    throw new Error("Invalid model approval snapshot");
  }
  const sessions: Record<string, string> = {};
  for (const [key, amount] of Object.entries(value.sessions)) {
    if (typeof amount !== "string") throw new Error("Invalid model approval snapshot");
    sessions[key] = amount;
  }
  return { version: 1, sessions };
}

const store = createWorkspaceKvStore<ModelApprovalCommitSnapshot>({
  tableName: "model_approval_commitments",
  valueColumn: "commitments_json",
  parse: parseSnapshot,
  serialize: (value) => JSON.stringify(value),
});

// A single host-local row keeps the complete, workspace-qualified snapshot.
// The session key contains the workspace id, so restoring cannot cross hosts.
const ROW_ID = "__all__";

export async function restoreModelApprovalCommitments(
  config: ServerConfig,
  approvals: ApprovalService,
): Promise<boolean> {
  const snapshot = await store.getExisting(config, ROW_ID);
  if (!snapshot) return false;
  approvals.importModelCommitments(snapshot);
  return true;
}

export async function persistModelApprovalCommitments(
  config: ServerConfig,
  approvals: ApprovalService,
): Promise<void> {
  await store.set(config, ROW_ID, approvals.exportModelCommitments());
}

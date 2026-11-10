import type { ApprovalConfig, ApprovalRequest } from "./types.js";
import { modelTaskApprovalDecision, type ModelTaskApprovalQuote, type ModelTaskApprovalPolicy } from "./model-task-approval.js";
import { shortId } from "./utils.js";

interface ApprovalResult {
  id: string;
  allowed: boolean;
  reason?: string;
}

interface PendingApproval {
  request: ApprovalRequest;
  sessionKey?: string;
  amountUsd?: string;
  resolve: (result: ApprovalResult) => void;
  timeout?: NodeJS.Timeout;
}

export type ModelApprovalCommitSnapshot = {
  version: 1;
  sessions: Record<string, string>;
};

export class ApprovalService {
  private config: ApprovalConfig;
  private pending = new Map<string, PendingApproval>();
  private committed = new Map<string, string>();

  constructor(config: ApprovalConfig, options: { persistModelCommitments?: () => Promise<void> } = {}) {
    this.config = config;
    this.persistModelCommitments = options.persistModelCommitments;
  }
  private persistModelCommitments?: () => Promise<void>;

  list(): ApprovalRequest[] {
    return Array.from(this.pending.values()).map((entry) => entry.request);
  }

  /** Host-owned committed model spend; agents cannot write this map. */
  committedSessionUsd(workspaceId: string, sessionId: string): string {
    return this.committed.get(`${workspaceId}\u0000${sessionId}`) ?? "0";
  }

  /** Serialize only host-owned settled commitments; pending prompts are never restored. */
  exportModelCommitments(): ModelApprovalCommitSnapshot {
    return { version: 1, sessions: Object.fromEntries(this.committed) };
  }

  /** Restore a previously verified host snapshot. Reject malformed or negative values. */
  importModelCommitments(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || Reflect.get(snapshot, "version") !== 1) throw new Error("Invalid model approval snapshot");
    const sessions = Reflect.get(snapshot, "sessions");
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) throw new Error("Invalid model approval snapshot");
    const next = new Map<string, string>();
    for (const [key, value] of Object.entries(sessions)) {
      if (!key.includes("\u0000") || key.length > 201 || typeof value !== "string") throw new Error("Invalid model approval snapshot");
      // Reuse the exact decimal parser through the decision helper.
      modelTaskApprovalDecision({ quote: { quoteId: "restore", slug: "restore", sessionId: "restore", amountUsd: "0", expiresAt: Number.MAX_SAFE_INTEGER }, policy: { autoApproveBelowUsd: "1", maxSessionUsd: value }, sessionCommittedUsd: value, now: 0 });
      next.set(key, value);
    }
    this.committed = next;
  }

  async requestApproval(
    input: Omit<ApprovalRequest, "id" | "createdAt">,
  ): Promise<ApprovalResult> {
    return this.enqueue(input, false);
  }

  /** Host bridge without verified price data: always require an explicit reply. */
  async requestExplicitModelApproval(input: Omit<ApprovalRequest, "id" | "createdAt" | "action" | "paths">): Promise<ApprovalResult> {
    return this.enqueue({ ...input, action: "model.submit", paths: [] }, true);
  }

  private async enqueue(input: Omit<ApprovalRequest, "id" | "createdAt">, requireExplicit: boolean): Promise<ApprovalResult> {
    if (this.config.mode === "auto" && !requireExplicit) {
      return { id: "auto", allowed: true };
    }
    const id = shortId();
    const request: ApprovalRequest = {
      ...input,
      id,
      createdAt: Date.now(),
    };

    const result = await new Promise<ApprovalResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve({ id, allowed: false, reason: "timeout" });
      }, input.action === "model.submit" ? Math.max(this.config.timeoutMs, 10 * 60_000) : this.config.timeoutMs);

      this.pending.set(id, { request, resolve, timeout });
    });

    return result;
  }

  async requestModelTaskApproval(input: {
    workspaceId: string;
    actor: ApprovalRequest["actor"];
    quote: ModelTaskApprovalQuote;
    policy: ModelTaskApprovalPolicy;
    sessionCommittedUsd: string;
    now?: () => number;
  }): Promise<ApprovalResult> {
    const now = input.now ?? Date.now;
    const sessionKey = `${input.workspaceId}\u0000${input.quote.sessionId}`;
    // The caller-provided value is retained only for wire compatibility. It
    // never establishes host state; a fresh session always starts at zero.
    const committed = this.committed.get(sessionKey) ?? "0";
    const decision = modelTaskApprovalDecision({ ...input, sessionCommittedUsd: committed, now: now() });
    if (decision === "allow") {
      this.addCommitted(sessionKey, input.quote.amountUsd);
      await this.persistModelCommitments?.();
      return { id: "model-threshold", allowed: true };
    }
    const result = await this.enqueue({
      workspaceId: input.workspaceId, actor: input.actor, action: "model.submit",
      summary: `${input.quote.slug}: USD ${input.quote.amountUsd}. Quote ${input.quote.quoteId}. Session ${input.quote.sessionId}. Cancelling only stops waiting; the upstream task continues and is billed.`,
      paths: [], modelTask: { ...input.quote },
    }, true);
    // A quote may expire while the user reviews it. Never dispatch that quote.
    if (result.allowed && input.quote.expiresAt <= now()) return {id: result.id, allowed: false, reason: "quote_expired"};
    if (result.allowed) {
      this.addCommitted(sessionKey, input.quote.amountUsd);
      await this.persistModelCommitments?.();
    }
    return result;
  }

  private addCommitted(sessionKey: string, amountUsd: string): void {
    const current = this.committed.get(sessionKey) ?? "0";
    const micros = (value: string) => {
      const [whole, fraction = ""] = value.split(".");
      return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    };
    const next = micros(current) + micros(amountUsd);
    this.committed.set(sessionKey, `${next / 1_000_000n}.${(next % 1_000_000n).toString().padStart(6, "0")}`);
  }

  respond(id: string, reply: "allow" | "deny"): ApprovalResult | null {
    const pending = this.pending.get(id);
    if (!pending) return null;
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pending.delete(id);
    const result: ApprovalResult = {
      id,
      allowed: reply === "allow",
      reason: reply === "allow" ? undefined : "denied",
    };
    pending.resolve(result);
    return result;
  }
}

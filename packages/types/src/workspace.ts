/**
 * Shared wire contract for workspace records.
 *
 * Producers:
 * - get3w-server (apps/server): `GET /workspaces` and friends — emits plain
 *   optionals (never null) plus the `opencode*` engine credential fields.
 * - desktop Electron IPC bridge (apps/desktop main.mjs): emits explicit nulls
 *   and the desktop-managed `get3wClientToken`/`get3wHostToken`.
 *
 * Consumers (apps/app) must treat every optional field as possibly absent,
 * undefined, or null. Producer-side types assert assignability against this
 * shape (see apps/server/src/types.ts) so drift fails typecheck instead of
 * surfacing as runtime undefined-field bugs.
 */
export type WorkspaceKind = "local" | "always-on";

export type WorkspaceWire = {
  id: string;
  name: string;
  path: string;
  preset: string;
  workspaceType: WorkspaceKind;
  baseUrl?: string | null;
  directory?: string | null;
  displayName?: string | null;
  /**
   * Vocabulary differs per producer today ("docker" | "microsandbox" on the
   * desktop, "none" | "docker" | "container" in get3w-server), so the wire
   * stays a plain string until the backends converge.
   */
  sandboxBackend?: string | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
  /** get3w-server only: credentials for the proxied opencode engine. */
  opencodeUsername?: string | null;
  opencodePassword?: string | null;
  opencode?: {
    baseUrl?: string;
    directory?: string;
    username?: string;
    password?: string;
  } | null;
};

/** One goal per workspace; credentials stay in the existing secure stores. */
export interface AlwaysOnSettings {
  goal: string;
  /** Legacy fields are merged into goal when read or edited. */
  criteria?: string;
  behavior?: string;
  fullAccess: boolean;
  costAuto: boolean;
  costLimit: string;
  intervalMinutes: number;
}
export interface AlwaysOnStatus {
  settings: AlwaysOnSettings;
  paused: boolean;
  phase: "queued" | "running" | "waiting" | "idle" | "error" | "interrupted";
  sessionId: string | null;
  nextRunAt: number | null;
  lastError: string | null;
  lastErrorCode?: string | null;
  event?: { id: string; phase: AlwaysOnRun["phase"]; verification?: AlwaysOnVerification } | null;
  retryAt?: number | null;
  retryCount?: number;
}

export interface AlwaysOnFollowup {
  id: string;
  text: string;
  dueAt: number;
  createdAt: number;
  state: "suggested" | "scheduled" | "triggered" | "cancelled" | "skipped";
  repeatMinutes?: number;
  calendar?: { kind: "daily"; at: string; timeZone: string };
  missedPolicy?: "once" | "skip";
  lastTriggeredAt?: number;
  originEventId?: string;
  eventId?: string;
  taskId?: string;
}
export interface AlwaysOnTask {
  id: string;
  title: string;
  sessionId: string | null;
  engine?: "v1" | "v2";
}
export interface AlwaysOnTimers {
  status: AlwaysOnStatus;
  followups: AlwaysOnFollowup[];
  tasks?: AlwaysOnTask[];
  currentTaskId?: string;
}
export interface AlwaysOnSource {
  mergeWindowSeconds?: number;
  id: string;
  kind: "webhook" | "files" | "github" | "connector";
  provider?: string;
  subscriptionId?: string;
  ownerUserId?: string;
  repositoryId?: number;
  lastSynced?: number | null;
  syncError?: boolean;
  name: string;
  scope: string;
  enabled: boolean;
  deleted?: boolean;
  lastReceived: number | null;
}
export interface AlwaysOnInbox {
  focusedRun?: AlwaysOnRun;
  status: AlwaysOnStatus;
  pending: AlwaysOnRun[];
  processing: AlwaysOnRun[];
  history: AlwaysOnRun[];
  historyTotal: number;
  nextOffset: number | null;
  unreadableCount: number;
  sources: AlwaysOnSource[];
}
export interface AlwaysOnVerification {
  notification?: { action: "send" | "quiet"; text?: string; notBefore?: number; expiresAt?: number; dedupeKey?: string };
  status: "verified" | "needs_review"; checkedAt: number;
  issues: ("result_invalid" | "checkpoint_missing" | "artifact_missing")[];
  outcome?: "changed" | "no_change"; summary?: string; artifacts?: string[];
}
export interface AlwaysOnRun {
  batch?: {closesAt:number;members:Array<{id:string;text:string;dedupeKey:string;createdAt:number}>};
  batchId?: string;
  batchSize?: number;
  taskId?: string;
  verification?: AlwaysOnVerification;
  repairCount?: number;
  id: string;
  messageId: string;
  sourceId?: string;
  sourceName?: string;
  text?: string;
  kind: "created" | "timer" | "manual" | "source";
  phase: "queued" | "creating" | "submitting" | "running" | "waiting" | "done" | "error" | "interrupted";
  createdAt: number;
  finishedAt: number | null;
  sessionId: string | null;
  summary: string;
}
export interface AlwaysOnOverview {
  status: AlwaysOnStatus;
  runs: AlwaysOnRun[];
  nextOffset: number | null;
  unreadableCount: number;
  progress: { total: number; completed: number; active: number; waiting: number; failed: number; paused: number };
}

export interface AlwaysOnMemory {
  version: 1; revision: number; clearedAt?: number; useNotes: boolean;
  extract?: boolean;
  suggestions?: { id: string; text: string; eventId: string; sessionId: string; messageId: string; createdAt: number }[];
  blocked?: string[];
  blockedEntries?: { hash: string; text?: string; createdAt: number }[];
  history?: { id: string; action: string; noteId?: string; before?: string; after?: string; createdAt: number }[];
  usage?: { eventId: string; sessionId: string; messageId: string; revision: number; notes: { id: string; text: string }[]; submittedAt: number; kind?: "index" | "read" }[];
  reported?: { eventId: string; sessionId: string; messageId: string; text: string; truncated: boolean; completedAt: number; viewedAt?: number }[];
  processed?: string[];
  notes: { id: string; title?: string; sourceUrl?: string; observedAt?: string; text: string; enabled: boolean; locked: boolean; updatedAt: number }[];
}
export type AlwaysOnMemoryChange = { revision: number } & (
  { action: "save"; id?: string; text: string; title?: string; sourceUrl?: string; observedAt?: string } |
  { action: "enable" | "disable" | "lock" | "unlock" | "delete"; id: string } |
  { action: "settings"; useNotes?: boolean; extract?: boolean } |
  { action: "accept" | "reject"; id: string; text?: string } |
  { action: "unblock"; hash: string } |
  { action: "clear" }
);

export interface AlwaysOnDeliverable {
  id: string; summary: string; createdAt: number; sessionId: string | null; messageId: string; artifacts: string[];
}
export interface AlwaysOnDeliverables {
  results: AlwaysOnDeliverable[]; nextOffset: number | null; unreadableCount: number;
}

export interface AlwaysOnDelivery {
 id:string; resultId:string; title:string; text:string; sessionId:string; messageId:string;
 status:"pending"|"sending"|"submitted"|"failed"|"cancelled"|"unconfirmed"|"blocked";
 notBefore?:number; expiresAt?:number;
 createdAt:number; attempts:number; submittedAt?:number; lastAttemptAt?:number; error?:"send_failed"|"preference_off"|"uncertain";
}
export type AlwaysOnDeliveryChange = {action:"claim"} | {action:"retry"|"cancel"|"resolve_sent"|"resolve_cancel";id:string} | {action:"finish";id:string;claim:string;result:"submitted"|"failed"|"blocked"};

/** Engine requests for the active always-on task; question replies use a host-authorized queue. */
export interface AlwaysOnAttention {
  resultReview?: AlwaysOnRun;
  repairingResult?: boolean;
  answerStatus?: "queued" | "sending" | "answered" | "stale" | "unconfirmed" | "cancelled";
  paused: boolean;
  checkedAt: number;
  scope: "active-task";
  items: Array<{
    eventId: string;
    sessionId: string;
    messageId: string;
    requestId: string;
    answerStatus?: "queued" | "sending" | "answered" | "stale" | "unconfirmed" | "cancelled";
    canCancel?: boolean;
    savedAnswers?: string[][];
    createdAt: number;
    request: { kind: "permission"; title: string; detail: string; command?: string }
      | { kind: "question"; questions: Array<{ header: string; question: string; options: Array<{label: string; description: string}>; multiple: boolean; custom: boolean }> };
  }>;
}

export interface AlwaysOnQuestionAnswer {
 id:string;eventId:string;sessionId:string;request:Extract<AlwaysOnAttention["items"][number]["request"],{kind:"question"}> & {requestId:string};answers:string[][];
}

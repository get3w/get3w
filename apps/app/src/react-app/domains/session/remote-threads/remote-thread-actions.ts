import { t } from "@/i18n";
import type { RemoteSessionAnswerInput } from "@openwork/types/automations"

import { DenApiError } from "@/app/lib/den"
import {
  latestUserMessageId,
  parseRemoteRead,
  remoteActionError,
  remoteFollowUpMessageId,
  remotePendingRequestId,
  type RemoteReadOutcome,
} from "@/lib/remote-session-thread"
import { useRemoteThreadStore, type RemoteThreadEntry } from "./remote-thread-store"

/**
 * What a person does with a task from its panel: read it, follow up, stop it.
 * Each is one Den call; a desktop that takes longer than about 20 seconds
 * answers with a requestId, which is read every two seconds until it does.
 */

type Failure = { code: string; message: string; retryable: boolean }

function failure(error: unknown): Failure {
  if (error instanceof DenApiError) {
    return { code: error.code, message: error.message, retryable: error.status >= 500 }
  }
  return { code: "request_failed", message: t("ui.fa86c9d107fe"), retryable: true }
}

/** Where the task's session lives, once its computer has started it. */
export function remoteThreadLocation(entry: RemoteThreadEntry): { sessionId: string; workspaceId?: string } | null {
  const sessionId = entry.status?.sessionId ?? entry.start.sessionId
  if (!sessionId) return null
  const workspaceId = entry.start.target === "desktop" ? entry.status?.workspaceId ?? entry.start.workspaceId : null
  return { sessionId, ...(workspaceId ? { workspaceId } : {}) }
}

async function call(action: "read" | "send" | "stop" | "answer", input: Record<string, unknown>): Promise<unknown> {
  throw new DenApiError(410, "remote_tasks_unavailable", "Remote tasks are unavailable in this edition.")
}

export async function readRemoteThread(entry: RemoteThreadEntry, input: { limit: number; cursor?: string | null }): Promise<RemoteReadOutcome> {
  const location = remoteThreadLocation(entry)
  if (!location) return { kind: "error", code: "not_started", message: t("ui.a911fa420c25"), retryable: true }
  try {
    return parseRemoteRead(await call("read", {
      ...location,
      limit: input.limit,
      ...(input.cursor ? { from: "end", cursor: input.cursor } : {}),
    }))
  } catch (error) {
    return { kind: "error", ...failure(error) }
  }
}

export async function sendRemoteFollowUp(entry: RemoteThreadEntry, prompt: string): Promise<Failure | null> {
  const location = remoteThreadLocation(entry)
  if (!location) return { code: "not_started", message: t("ui.0ad026257c3c"), retryable: true }
  try {
    // One id per follow-up: a retried send is admitted once.
    const payload = await call("send", { ...location, prompt, messageId: remoteFollowUpMessageId() })
    if (remotePendingRequestId(payload)) return { code: "desktop_request_pending", message: t("ui.6063244d3472"), retryable: false }
    const error = remoteActionError(payload)
    if (error) return error
    useRemoteThreadStore.getState().followedUp(entry.start.key)
    return null
  } catch (error) {
    return failure(error)
  }
}

/**
 * The person's own answer to the task's question or permission. The card goes
 * away once the status Den follows says the task moved on; a request that is
 * no longer pending comes back as a refusal to show inline.
 */
export async function answerRemoteThread(entry: RemoteThreadEntry, answer: RemoteSessionAnswerInput): Promise<Failure | null> {
  const location = remoteThreadLocation(entry)
  if (!location) return { code: "not_started", message: t("ui.6c98048577ed"), retryable: true }
  try {
    const payload = await call("answer", { ...location, ...answer })
    if (remotePendingRequestId(payload)) return { code: "desktop_request_pending", message: t("ui.2fb60c16cab7"), retryable: false }
    const error = remoteActionError(payload)
    if (error) return error
    // Look again now: the task runs on, or waits on its next question.
    useRemoteThreadStore.getState().followedUp(entry.start.key)
    return null
  } catch (error) {
    return failure(error)
  }
}

/** Stops the task's current turn; a desktop stop names it, so a newer turn is never stopped. */
export async function stopRemoteThread(entry: RemoteThreadEntry, latestUserId?: string | null): Promise<Failure | null> {
  const location = remoteThreadLocation(entry)
  if (!location) return { code: "not_started", message: t("ui.6c98048577ed"), retryable: true }
  try {
    let messageId = latestUserId ?? null
    if (!messageId) {
      const tail = await readRemoteThread(entry, { limit: 4 })
      messageId = tail.kind === "page" ? latestUserMessageId(tail.page.messages) : null
    }
    // The status the chat already follows shows the task settling; nothing else to ask.
    return remoteActionError(await call("stop", { ...location, ...(messageId ? { messageId } : {}) }))
  } catch (error) {
    return failure(error)
  }
}

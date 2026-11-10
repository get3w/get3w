import { useEffect, useRef } from "react"
import type { DynamicToolUIPart } from "ai"
import { create } from "zustand"
import {
  REMOTE_SESSION_STATUS_THREADS_MAX,
  REMOTE_SESSION_STATUS_WAIT_MAX_MS,
  type RemoteSessionStatusResult,
  type RemoteSessionThreadStatus,
} from "@openwork/types/automations"

import { remoteFollowUpMatches, type RemoteThreadFollowUp, type RemoteThreadStart } from "@/lib/remote-session-thread"
import { remoteThreadFollowUpsInPart } from "@/lib/remote-thread-starts"

/**
 * Tasks the agent started on other computers, followed for the chat.
 *
 * One loop follows every task shown anywhere in the app, whatever number of
 * rows, panels or chats show it, with one Den call at a time:
 *
 * - The first look at a task asks at once; after that each call sends the
 *   versions it holds and waits on Den (up to 20 s) until one changes, so a
 *   quiet task costs about three small calls a minute and none of its data.
 * - A task stops being followed when it finishes or fails, 15 minutes after
 *   nothing on screen shows it, or 6 hours after it last started work.
 * - Nothing is called while the window is hidden or offline, nor when no
 *   task needs following. Failures back off to a minute.
 *
 * Transcripts are not part of this: the open panel reads one only when the
 * status says something changed.
 */

const WAIT_MS = REMOTE_SESSION_STATUS_WAIT_MAX_MS
/** However busy a task is, one status call starts at most every two seconds. */
const MIN_CALL_INTERVAL_MS = 2_000
const BACKOFF_BASE_MS = 2_000
const BACKOFF_MAX_MS = 60_000
const LINGER_MS = 15 * 60_000
export const REMOTE_THREAD_FOLLOW_MAX_MS = 6 * 60 * 60_000
const FOLLOW_MAX_MS = REMOTE_THREAD_FOLLOW_MAX_MS
/** After a follow-up, an idle status is still the previous turn until the task reports work again. */
const FOLLOW_UP_GRACE_MS = 90_000
/** Only a follow-up the agent just sent revives a task; reopening an old chat does not. */
const REVIVE_WINDOW_MS = 2 * 60_000

export type RemoteThreadOwner = { workspaceId: string; sessionId: string }

export type RemoteThreadEntry = {
  start: RemoteThreadStart
  version: string | null
  status: RemoteSessionThreadStatus | null
  /** The last check couldn't confirm the state; the row shows the last known one. */
  stale: boolean
  /** When Den last confirmed the state. */
  checkedAt: number | null
  /** When the task was started, or last sent a follow-up; null when the chat doesn't know. */
  activeSince: number | null
  /** When this window first showed the task. */
  firstSeenAt: number
  followedUpAt: number | null
  /** The status version a follow-up was sent against: a different one is the new turn, even one that already finished. */
  followUpVersion: string | null
  /** When the agent sent the latest follow-up it revived this task for, so each revives it once. */
  revivedAt: number | null
  owners: Record<string, RemoteThreadOwner>
  viewers: number
  lastViewedAt: number
}

type RemoteThreadState = {
  threads: Record<string, RemoteThreadEntry>
  watch: (start: RemoteThreadStart, input: { owner: RemoteThreadOwner; startedAt: number | null }) => () => void
  followedUp: (key: string) => void
  /** The agent sent the task a follow-up itself; reviving for the same follow-up again changes nothing. */
  revive: (followUp: RemoteThreadFollowUp) => void
  apply: (result: RemoteSessionStatusResult, keys: readonly string[], checkedAt: number) => void
  markStale: (keys: readonly string[]) => void
}

function settled(entry: RemoteThreadEntry) {
  return entry.status?.state === "idle" || entry.status?.state === "error"
}

/** A follow-up was accepted and the task hasn't reported the new turn yet. */
export function remoteThreadAwaitingFollowUp(entry: RemoteThreadEntry, now: number): boolean {
  return settled(entry) && entry.followedUpAt !== null && now - entry.followedUpAt < FOLLOW_UP_GRACE_MS
}

export function remoteThreadNeedsStatus(entry: RemoteThreadEntry, now: number): boolean {
  if (entry.viewers === 0 && now - entry.lastViewedAt > LINGER_MS) return false
  if (now - (entry.activeSince ?? entry.firstSeenAt) > FOLLOW_MAX_MS) return false
  if (!entry.status || entry.stale) return true
  if (!settled(entry)) return true
  return entry.followedUpAt !== null && now - entry.followedUpAt < FOLLOW_UP_GRACE_MS
}

export const useRemoteThreadStore = create<RemoteThreadState>()((set, get) => ({
  threads: {},
  watch: (start, input) => {
    const ownerKey = `${input.owner.workspaceId}:${input.owner.sessionId}`
    const now = Date.now()
    set((state) => {
      const current = state.threads[start.key]
      const entry: RemoteThreadEntry = current
        ? { ...current, viewers: current.viewers + 1, lastViewedAt: now, owners: { ...current.owners, [ownerKey]: input.owner } }
        : {
            start,
            version: null,
            status: null,
            stale: false,
            checkedAt: null,
            activeSince: input.startedAt,
            firstSeenAt: now,
            followedUpAt: null,
            followUpVersion: null,
            revivedAt: null,
            owners: { [ownerKey]: input.owner },
            viewers: 1,
            lastViewedAt: now,
          }
      return { threads: { ...state.threads, [start.key]: entry } }
    })
    kick()
    return () => {
      set((state) => {
        const current = state.threads[start.key]
        if (!current) return state
        return { threads: { ...state.threads, [start.key]: { ...current, viewers: Math.max(0, current.viewers - 1), lastViewedAt: Date.now() } } }
      })
    }
  },
  followedUp: (key) => {
    const now = Date.now()
    set((state) => {
      const current = state.threads[key]
      if (!current) return state
      return { threads: { ...state.threads, [key]: { ...current, followedUpAt: now, followUpVersion: current.version, activeSince: now } } }
    })
    kick(true)
  },
  revive: (followUp) => {
    const sentAt = followUp.sentAt
    if (sentAt === null) return
    const entry = Object.values(get().threads).find((candidate) => remoteFollowUpMatches(followUp, candidate.start, candidate.status?.sessionId ?? null))
    if (!entry || (entry.revivedAt !== null && entry.revivedAt >= sentAt)) return
    const key = entry.start.key
    set((state) => {
      const current = state.threads[key]
      return current ? { threads: { ...state.threads, [key]: { ...current, revivedAt: sentAt } } } : state
    })
    get().followedUp(key)
  },
  apply: (result, keys, checkedAt) => {
    set((state) => {
      const threads = { ...state.threads }
      const byRef = new Map(keys.map((key) => [refId(key), key]))
      for (const thread of result.threads) {
        const key = byRef.get(thread.ref)
        const current = key ? threads[key] : undefined
        if (!key || !current) continue
        if (!thread.changed) {
          threads[key] = { ...current, version: thread.version, stale: thread.stale === true, checkedAt: thread.stale ? current.checkedAt : checkedAt }
          continue
        }
        // Work reported after a follow-up, or a newer version than the one it was sent against,
        // ends its grace: the new turn is now visible.
        const newTurn = thread.state !== "idle" && thread.state !== "error"
          || (current.followUpVersion !== null && thread.version !== current.followUpVersion)
        const followedUpAt = current.followedUpAt !== null && newTurn ? null : current.followedUpAt
        threads[key] = { ...current, version: thread.version, status: thread, stale: false, checkedAt, followedUpAt }
      }
      return { threads }
    })
  },
  markStale: (keys) => {
    set((state) => {
      const threads = { ...state.threads }
      for (const key of keys) {
        const current = threads[key]
        if (current) threads[key] = { ...current, stale: true }
      }
      return { threads }
    })
  },
}))

// Historical remote task records are display-only in the personal edition.
function kick(_now = false) {}
function refId(key: string) { return key.slice(key.indexOf(":") + 1); }

export function useRemoteThread(key: string | null): RemoteThreadEntry | null {
  return useRemoteThreadStore((state) => key ? state.threads[key] ?? null : null)
}

/** Follow a task while this component shows it (and for a while after). */
export function useFollowRemoteThread(start: RemoteThreadStart | null, owner: RemoteThreadOwner, startedAt: number | null) {
  // A task is identified by its key; a re-rendered part with the same key is the same task.
  const latest = useRef({ start, startedAt })
  latest.current = { start, startedAt }
  const key = start?.key ?? null
  const { workspaceId, sessionId } = owner
  useEffect(() => {
    const current = latest.current
    if (!key || !current.start) return
    return useRemoteThreadStore.getState().watch(current.start, { owner: { workspaceId, sessionId }, startedAt: current.startedAt })
  }, [key, workspaceId, sessionId])
}

/** Revive the tasks these follow-ups went to, if the agent sent them just now. */
export function reviveRemoteThreads(followUps: readonly RemoteThreadFollowUp[], now = Date.now()) {
  for (const followUp of followUps) {
    if (followUp.sentAt === null || now - followUp.sentAt > REVIVE_WINDOW_MS) continue
    useRemoteThreadStore.getState().revive(followUp)
  }
}

/** The agent's own `remote-session:send`, directly or from a script, to a task the chat shows: follow it again. */
export function useReviveRemoteThread(part: DynamicToolUIPart | null) {
  const followUps = part ? remoteThreadFollowUpsInPart(part) : []
  // A re-rendered step with the same follow-ups is the same send.
  const latest = useRef(followUps)
  latest.current = followUps
  const signature = followUps.map((followUp) => `${followUp.toolCallId}@${followUp.sentAt ?? ""}`).join("\n")
  useEffect(() => {
    if (signature) reviveRemoteThreads(latest.current)
  }, [signature])
}

export type RemoteThreadAttention = { kind: "permission" | "question"; title: string }

/**
 * Chats whose task on another computer waits on the person, as a string that
 * only changes when that set does: status updates that change nothing here
 * never re-render the sidebar.
 */
export function useRemoteThreadAttentionKey(): string {
  return useRemoteThreadStore((state) => {
    const rows: string[][] = []
    for (const entry of Object.values(state.threads)) {
      if (entry.status?.state !== "waiting") continue
      for (const owner of Object.values(entry.owners)) {
        rows.push([owner.sessionId, entry.status.waitingFor ?? "question", entry.status.title ?? entry.start.title])
      }
    }
    return JSON.stringify(rows.sort())
  })
}

export function remoteThreadAttentionBySession(key: string): Map<string, RemoteThreadAttention> {
  const attention = new Map<string, RemoteThreadAttention>()
  const rows: unknown = JSON.parse(key)
  if (!Array.isArray(rows)) return attention
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    const [sessionId, kind, title] = row
    if (typeof sessionId !== "string" || typeof title !== "string" || attention.has(sessionId)) continue
    attention.set(sessionId, { kind: kind === "permission" ? "permission" : "question", title })
  }
  return attention
}

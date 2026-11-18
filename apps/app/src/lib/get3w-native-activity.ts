import type { DynamicToolUIPart } from "ai"
import { t } from "@/i18n"

import { parseRecord, type CapabilityCallSentence } from "./capability-call"

/**
 * Get3W's own app tools (`get3w_context`, `get3w_query`,
 * `get3w_execute`) as sentences a person reads: what was looked at or
 * changed, named by what they see in the sidebar. Affordance ids, session ids
 * and group ids never show.
 */

export const GET3W_NATIVE_TOOL = /^get3w_(context|query|execute)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown, max = 60): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/** Ids such as `grp_8f2k…` or `ses_…` are plumbing; a label like "Done" is not. */
function label(value: unknown): string | null {
  const candidate = text(value)
  return candidate && !/^[a-z]{2,8}_[A-Za-z0-9-]{6,}$/.test(candidate) ? candidate : null
}

function resultRecord(part: DynamicToolUIPart): Record<string, unknown> | null {
  if (part.state !== "output-available") return null
  const output: unknown = part.output
  if (Array.isArray(output)) {
    return parseRecord(output.flatMap((item) => isRecord(item) && typeof item.text === "string" ? [item.text] : []).join(""))
  }
  const record = parseRecord(output)
  if (record && isRecord(record.result)) return record.result
  return record
}

/** A command that returned `{ ok: false, error }` did not happen, whatever the engine state says. */
export function get3wNativeFailure(part: DynamicToolUIPart): string | null {
  const result = resultRecord(part)
  if (["media_prepare", "media_generate", "resource_upload"].includes(part.toolName)) {
    return result?.status === "error" ? (isRecord(result.error) ? text(result.error.message,140) : null) ?? t("activity.native.media_failed") : null
  }
  if (!GET3W_NATIVE_TOOL.test(part.toolName)) return null
  if (result?.ok !== false) return null
  return text(result.error, 140) ?? t("activity.native.failed")
}

function quoted(value: string | null, prefix = " ") {
  return value ? `${prefix}“${value}”` : ""
}

function sentence(present: string, past: string, failure: string): CapabilityCallSentence {
  return { service: null, present, past, failure }
}

export function get3wNativeSentence(part: DynamicToolUIPart): CapabilityCallSentence | null {
  const tool = GET3W_NATIVE_TOOL.exec(part.toolName)?.[1]
  if (!tool) return null
  if (tool === "context") return sentence(t("activity.native.context.present"), t("activity.native.context.past"), t("activity.native.context.failure"))

  const input = parseRecord(part.input)
  const id = text(input?.id) ?? ""
  const args = parseRecord(input?.args) ?? {}
  const result = resultRecord(part)

  if (id === "session.search") {
    const query = quoted(text(args.query))
    return sentence(query ? t("activity.native.search_query.present", { query }) : t("activity.native.search.present"), query ? t("activity.native.search_query.past", { query }) : t("activity.native.search.past"), t("activity.native.search.failure"))
  }
  if (id === "session.read") {
    const title = label(result?.title) ?? (isRecord(result?.session) ? label(result.session.title) : null)
    return sentence(t("activity.native.read.present"), title ? t("activity.native.read_named.past", { title: quoted(title) }) : t("activity.native.read.past"), t("activity.native.read.failure"))
  }
  if (id === "session.group.list") return sentence(t("activity.native.groups.present"), t("activity.native.groups.past"), t("activity.native.groups.failure"))
  if (id === "session.group.create") {
    const name = label(result?.label) ?? label(args.label)
    const found = result?.created === false
    return sentence((name ? t("activity.native.group_create.present", { name: quoted(name) }) : t("activity.native.group_create.present_unnamed")),
      found ? (name ? t("activity.native.group_found.past", { name: quoted(name) }) : t("activity.native.group_found.past_unnamed")) : (name ? t("activity.native.group_create.past", { name: quoted(name) }) : t("activity.native.group_create.past_unnamed")),
      t("activity.native.group_create.failure"))
  }
  if (id === "session.group.move") {
    const title = label(result?.title)
    const target = result ? label(result.label) : label(args.groupId)
    const ungroup = result ? result.label === null : args.groupId === null || args.groupId === undefined
    const chat = title ? `“${title}”` : t("activity.native.chat")
    return ungroup
      ? sentence(t("activity.native.ungroup.present", { chat }), t("activity.native.ungroup.past", { chat }), t("activity.native.move.failure"))
      : sentence(target ? t("activity.native.move.present", { chat, target: quoted(target) }) : t("activity.native.move_other.present", { chat }), target ? t("activity.native.move.past", { chat, target: quoted(target) }) : t("activity.native.move_other.past", { chat }), t("activity.native.move.failure"))
  }
  if (id === "session.group.remove") {
    const name = label(result?.label) ?? label(args.groupId)
    return sentence((name ? t("activity.native.group_remove.present", { name: quoted(name) }) : t("activity.native.group_remove.present_unnamed")), (name ? t("activity.native.group_remove.past", { name: quoted(name) }) : t("activity.native.group_remove.past_unnamed")), t("activity.native.remove.failure"))
  }
  if (id === "session.create") {
    const sessions = Array.isArray(args.sessions) ? args.sessions.filter(isRecord) : []
    const only = sessions.length === 1 ? label(sessions[0]?.title) : null
    const what = only ? `“${only}”` : sessions.length > 1 ? t("activity.native.new_chats", { count: sessions.length }) : t("activity.native.new_chat")
    return sentence(t("activity.native.create.present", { what }), t("activity.native.create.past", { what }), t("activity.native.create.failure"))
  }
  if (id === "session.send") return sentence(t("activity.native.send.present"), t("activity.native.send.past"), t("activity.native.send.failure"))
  if (id === "models.list") return sentence(t("activity.native.models.present"), t("activity.native.models.past"), t("activity.native.models.failure"))
  if (id === "automation.propose") return sentence(t("activity.native.automation.present"), t("activity.native.automation.past"), t("activity.native.automation.failure"))

  // Unknown affordances still read as plain words: "workspace.list" → "workspace list".
  const words = id.split(/[._-]+/).filter(Boolean).join(" ")
  return tool === "query"
    ? sentence(t("activity.native.lookup.present", { target: words || "Get3W" }), t("activity.native.lookup.past", { target: words || "Get3W" }), t("activity.native.lookup.failure", { target: words || "Get3W" }))
    : sentence(t("activity.native.update.present", { target: words || "Get3W" }), t("activity.native.update.past", { target: words || "Get3W" }), t("activity.native.update.failure", { target: words || "Get3W" }))
}

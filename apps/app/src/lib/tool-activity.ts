import { t } from "@/i18n";
import type { DynamicToolUIPart, ToolUIPart } from "ai"
import {
  isApplyPatchToolPart,
  isBashToolPart,
  isEditToolPart,
  isGlobToolPart,
  isGrepToolPart,
  isLspToolPart,
  isQuestionToolPart,
  isReadToolPart,
  isSkillToolPart,
  skillDisplayName,
  isTaskToolPart,
  isTodoWriteToolPart,
  isWebFetchToolPart,
  isWebSearchToolPart,
  isWriteToolPart,
} from "./build-in-tools"
import { parseFilename, truncateText } from "../components/tools/path"

type AnyToolPart = ToolUIPart | DynamicToolUIPart

export function isToolPartInFlight(part: AnyToolPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available"
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * Human-readable "what is this tool doing" label. Safe against partial
 * streamed input (fields may be missing despite the type contract).
 */
export function getToolActivityLabel(part: AnyToolPart): string {
  if (isBashToolPart(part)) {
    const description = part.input?.description?.trim()
    return description ? truncateText(description, 64) : t("desktop.text.1216a55213e6")
  }
  if (isReadToolPart(part)) {
    return `Reading ${parseFilename(part.input?.filePath)}`
  }
  if (isEditToolPart(part)) {
    return `Editing ${parseFilename(part.input?.filePath)}`
  }
  if (isWriteToolPart(part)) {
    return `Writing ${parseFilename(part.input?.filePath)}`
  }
  if (isApplyPatchToolPart(part)) {
    return t("desktop.text.3a962c2d16de")
  }
  if (isGrepToolPart(part) || isGlobToolPart(part)) {
    const pattern = part.input?.pattern?.trim()
    return pattern
      ? `Searching for ${truncateText(pattern, 44)}`
      : t("desktop.text.bc9797766c2d")
  }
  if (isLspToolPart(part)) {
    return `Inspecting ${parseFilename(part.input?.filePath)}`
  }
  if (isSkillToolPart(part)) {
    const name = skillDisplayName(part.input)
    return name ? `Loading ${name} skill` : t("desktop.text.78f840db49e7")
  }
  if (isTodoWriteToolPart(part)) {
    return t("desktop.text.ad15b385c3ae")
  }
  if (isWebFetchToolPart(part)) {
    const host = hostnameOf(part.input?.url)
    return host ? `Reading ${host}` : t("desktop.text.d5b9daf289f7")
  }
  if (isWebSearchToolPart(part)) {
    const query = part.input?.query?.trim()
    return query
      ? `Searching the web for ${truncateText(query, 44)}`
      : t("desktop.text.87d2f3386f90")
  }
  if (isQuestionToolPart(part)) {
    return t("desktop.text.b4c5bd8146de")
  }
  if (isTaskToolPart(part)) {
    const description = part.input?.description?.trim()
    return description
      ? `Agent: ${truncateText(description, 56)}`
      : t("desktop.text.4615b32bec74")
  }
  if (part.type === "dynamic-tool") {
    return `Running ${part.toolName.replace(/[_-]+/g, " ")}`
  }
  return "Working"
}

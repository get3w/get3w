import { t } from "@/i18n";
"use client"

import { Tool } from "@/components/ui/tool"
import type { GlobToolPart } from "@/lib/build-in-tools"
import { parseFilename, toolDisplayTitle, truncateText } from "@/components/tools/path"

interface GlobToolProps {
  part: GlobToolPart
}

function getGlobToolTitle(part: GlobToolPart): string | null {
  const pattern = part.input?.pattern?.trim() ?? ""

  if (part.state === "output-error") {
    return pattern
      ? `Search attempted ${truncateText(pattern, 44)}`
      : t("ui.bdf8820ac063")
  }

  if (part.state !== "output-available") {
    return null
  }

  return pattern ? `Searched ${truncateText(pattern, 44)}` : t("ui.0f88544b00a1")
}

function getGlobToolDetail(part: GlobToolPart): string | undefined {
  const root = part.input?.path?.trim()
  if (!root) {
    return undefined
  }

  return `in ${parseFilename(root)}`
}

export function GlobTool({ part }: GlobToolProps) {
  return (
    <Tool
      toolPart={part}
      title={toolDisplayTitle(getGlobToolTitle(part), getGlobToolDetail(part))}
    />
  )
}

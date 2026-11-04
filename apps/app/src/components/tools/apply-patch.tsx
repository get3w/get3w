import { t } from "@/i18n";
"use client"

import { Tool } from "@/components/ui/tool"
import type { ApplyPatchToolPart } from "@/lib/build-in-tools"

interface ApplyPatchToolProps {
  part: ApplyPatchToolPart
}

function getApplyPatchToolTitle(part: ApplyPatchToolPart): string | null {
  if (part.state === "output-error") {
    return t("ui.7b8b45007559")
  }

  if (part.state !== "output-available") {
    return null
  }

  return t("ui.bd58e05a2433")
}

export function ApplyPatchTool({ part }: ApplyPatchToolProps) {
  return (
    <Tool toolPart={part} title={getApplyPatchToolTitle(part) ?? undefined} />
  )
}

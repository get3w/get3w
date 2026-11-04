import { t } from "@/i18n";
"use client"

import { Tool } from "@/components/ui/tool"
import type { TodoWriteToolPart } from "@/lib/build-in-tools"

interface TodoWriteToolProps {
  part: TodoWriteToolPart
}

function getTodoWriteToolTitle(part: TodoWriteToolPart): string | null {
  // Streamed/interrupted tool calls can surface with partial input despite
  // the type contract; an unguarded read here white-screened the whole app.
  const count = part.input?.todos?.length ?? 0

  if (part.state === "output-error") {
    return t("ui.6cd4ee3f0b39")
  }

  if (part.state !== "output-available") {
    return null
  }

  return count > 0 ? `Update todo list (${count})` : t("ui.bb9ba5e65d79")
}

export function TodoWriteTool({ part }: TodoWriteToolProps) {
  return (
    <Tool toolPart={part} title={getTodoWriteToolTitle(part) ?? undefined} />
  )
}

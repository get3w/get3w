import { t } from "@/i18n";
"use client"

import { Tool } from "@/components/ui/tool"
import { skillDisplayName, type SkillToolPart } from "@/lib/build-in-tools"

interface SkillToolProps {
  part: SkillToolPart
}

function getSkillToolTitle(part: SkillToolPart): string | null {
  const name = skillDisplayName(part.input)

  if (part.state === "output-error") {
    return name ? `Couldn't use your ${name} skill` : t("ui.0bdbbc980bde")
  }

  if (part.state !== "output-available") {
    return null
  }

  return name ? `Using your ${name} skill` : t("ui.b5da17628faf")
}

export function SkillTool({ part }: SkillToolProps) {
  return <Tool toolPart={part} title={getSkillToolTitle(part) ?? undefined} />
}

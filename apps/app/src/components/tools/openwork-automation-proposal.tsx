import { t } from "@/i18n";
import type { DynamicToolUIPart } from "ai";
import { automationProposalSchema, type AutomationProposal } from "@openwork/types/automations";
import { Tool } from "@/components/ui/tool";

function parseOutputValue(output: unknown): unknown {
  if (typeof output !== "string") return output
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

/**
 * Reads an `automation.propose` affordance result out of an openwork_execute
 * tool part. Returns null for every other affordance so the generic capability
 * line keeps rendering them.
 */
export function parseAutomationProposal(output: unknown): AutomationProposal | null {
  const envelope = parseOutputValue(output)
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) return null
  const record = envelope as Record<string, unknown>
  if (record.ok !== true || record.id !== "automation.propose") return null
  const result = record.result
  if (result === null || typeof result !== "object" || Array.isArray(result)) return null
  const parsed = automationProposalSchema.safeParse((result as Record<string, unknown>).proposal)
  return parsed.success ? parsed.data : null
}

export function isAutomationProposalToolPart(part: DynamicToolUIPart): boolean {
  return part.toolName === "openwork_execute"
    && part.state === "output-available"
    && parseAutomationProposal(part.output) !== null
}

/** Keep historical tool output readable without creating a retired cloud job. */
export function OpenWorkAutomationProposalTool({ part }: { part: DynamicToolUIPart }) {
  return <Tool toolPart={part} title={t("automation_ui.personal_unavailable")} />;
}

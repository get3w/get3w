import { currentLocale, useLocale } from "@/i18n";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useGet3wAccount } from "@/react-app/domains/cloud/get3w-account";
import { createPersonalAutomationClient } from "@/react-app/domains/automations/personal-automation-client";
import { formatAutomationSchedule } from "@/react-app/domains/automations/automation-format";
import { automationModelOptions, automationProviderCatalog } from "@/react-app/domains/automations/automation-model-options";
import { useWorkspaceMaybe } from "@/react-app/shell/workspace-provider";
import { getConnectedProviderItems, useProviderListQuery } from "@/react-app/infra/provider-list-query";
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

/** Only an explicit renderer action creates a proposed schedule. */
export function OpenWorkAutomationProposalTool({ part }: { part: DynamicToolUIPart }) {
  useLocale();
  const zh = currentLocale() === "zh";
  const text = (cn: string, en: string) => zh ? cn : en;
  const account = useGet3wAccount();
  const workspace = useWorkspaceMaybe();
  const navigate = useNavigate();
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = useProviderListQuery({client: workspace?.client ?? null, baseUrl: workspace?.opencodeBaseUrl, directory: workspace?.selectedWorkspaceRoot, enabled: Boolean(account.user) && !created});
  const proposal = part.state === "output-available" ? parseAutomationProposal(part.output) : null;
  if (!proposal) return <Tool toolPart={part} title={text("建议创建自动化", "Suggested automation")}/>;
  const models = automationModelOptions([], {includeFreeStarter:false, catalog:automationProviderCatalog(getConnectedProviderItems(providers.data))});
  const exact = proposal.model && models.find(model => model.providerId === proposal.model?.providerId && model.modelId === proposal.model?.modelId);
  const model = exact ? proposal.model : models[0];
  const blocked = proposal.schedule.kind === "calendar" ? text("会议自动化需要云端运行。", "Meeting automations require cloud execution.") : !account.user ? text("请先登录 Get3W。", "Sign in to Get3W first.") : !model ? text("模型尚未就绪，请检查模型连接。", "No model is available. Check model connections.") : null;
  return <div className="space-y-3 border-y py-3" data-openwork-automation-proposal data-automation-created={created ?? undefined}>
    <p className="font-medium">{created ? text("已创建并启用", "Created and active") : proposal.name}</p>
    <p className="text-sm text-muted-foreground">{formatAutomationSchedule(proposal.schedule)}</p>
    <p className="whitespace-pre-wrap text-sm">{proposal.instructions}</p>
    {model && <p className="text-xs text-muted-foreground">{model.providerId} / {model.modelId}</p>}
    {(error || blocked) && <p role={error ? "alert" : undefined} className="text-sm">{error ?? blocked}</p>}
    {created ? <Button variant="outline" onClick={() => navigate("/automations")}>{text("打开自动化", "Open automation")}</Button> : <Button disabled={busy || Boolean(blocked)} onClick={async () => {
      if (!account.user || !model) return;
      setBusy(true); setError(null);
      try {
        const detail = await createPersonalAutomationClient(account.user.id).create({name:proposal.name,instructions:proposal.instructions,schedule:proposal.schedule,model:{providerId:model.providerId,modelId:model.modelId,variant:exact ? proposal.model?.variant ?? null : null},workspaceId:workspace?.workspaceId ?? null});
        setCreated(detail.automation.id);
      } catch (error) {setError(error instanceof Error ? error.message : "Could not create automation. Try again.");}
      finally {setBusy(false);}
    }}>{text("创建并启用", "Create and activate")}</Button>}
  </div>;
}

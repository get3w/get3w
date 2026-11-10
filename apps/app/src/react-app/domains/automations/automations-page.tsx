/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/react-app/design-system/modals/confirm-modal";
import { useLocale, currentLocale } from "@/i18n";
import { useGet3wAccount } from "../cloud/get3w-account";
import { globalSettingsRoute, workspaceSettingsRoute } from "@/react-app/shell/workspace-routes";
import { automationScheduleSchema, type CreateAutomation } from "@openwork/types/automations";
import { AutomationEditor } from "./automation-editor";
import { automationModelOptions, describeAutomationModel, type AutomationProviderCatalog } from "./automation-model-options";
import { automationErrorMessage, formatAutomationSchedule, formatAutomationTime, runStatusLabel } from "./automation-format";
import { createPersonalAutomationClient } from "./personal-automation-client";
import type { AutomationDetail, AutomationRun, AutomationRunReceipt } from "@openwork/types/automations";

function RunReceipt(props: {models: ReturnType<typeof automationModelOptions>; client: ReturnType<typeof createPersonalAutomationClient>; automationId: string; run: AutomationRun; zh: boolean}) {
  const [receipt, setReceipt] = useState<AutomationRunReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void props.client.receipt(props.automationId, props.run.id).then(value => {
      if (active) {setReceipt(value); setError(null);}
    }).catch(error => {if (active) setError(error instanceof Error ? error.message : String(error));});
    return () => {active = false;};
  }, [props.client, props.automationId, props.run.id, props.run.updatedAt, retry]);
  if (error) return <div role="alert" className="text-destructive"><p>{error}</p><Button variant="ghost" onClick={() => {setError(null); setRetry(value => value + 1);}}>{props.zh ? "重试" : "Retry"}</Button></div>;
  if (!receipt) return <Skeleton className="h-12 w-full"/>;
  const labels = {user: props.zh ? "任务指令" : "Instructions", assistant: props.zh ? "结果" : "Result", usage: props.zh ? "用量" : "Usage", terminal: props.zh ? "运行结束" : "Finished", warning: props.zh ? "警告" : "Warning", capability_search: props.zh ? "查找工具" : "Tool search", capability_execution: props.zh ? "执行工具" : "Tool execution"};
  return <div className="space-y-3 text-xs text-muted-foreground">
    <p>{props.zh ? "执行版本" : "Executed revision"}: {receipt.revision.version} · {describeAutomationModel(receipt.revision.model, props.models)}</p>
    <p>{props.zh ? "输入 / 输出 tokens" : "Input / output tokens"}: {receipt.run.usage.inputTokens ?? "—"} / {receipt.run.usage.outputTokens ?? "—"}</p>
    {receipt.run.usage.costMicros !== null && <p>{props.zh ? "费用" : "Cost"}: ${(receipt.run.usage.costMicros / 1000000).toFixed(4)}</p>}
    <ol className="space-y-3">{receipt.events.map(event => <li key={event.id}>
      <p>{labels[event.type]} · {formatAutomationTime(event.createdAt)}</p>
      {typeof event.payload.instructions === "string" && <p className="whitespace-pre-wrap">{event.payload.instructions}</p>}
      {typeof event.payload.text === "string" && <p className="whitespace-pre-wrap">{event.payload.text}</p>}
      {typeof event.payload.message === "string" && <p className="whitespace-pre-wrap">{event.payload.message}</p>}
    </li>)}</ol>
  </div>;
}

export function AutomationsPage(props: { providerCatalog?: AutomationProviderCatalog; workspaceId?: string | null; headerActionsTarget?: HTMLElement | null; onSignIn?: () => void } = {}) {
  useLocale();
  const zh = currentLocale() === "zh";
  const text = (cn: string, en: string) => zh ? cn : en;
  const navigate = useNavigate();
  const account = useGet3wAccount();
  const userId = account.user?.id;
  const client = useMemo(() => userId ? createPersonalAutomationClient(userId) : null, [userId]);
  const models = useMemo(() => automationModelOptions([], {catalog: props.providerCatalog, includeFreeStarter: false}), [props.providerCatalog]);
  const [desktopConnected, setDesktopConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<AutomationDetail[]>([]);
  const [repairingModel, setRepairingModel] = useState(false);
  const [editing, setEditing] = useState<AutomationDetail | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const creating = searchParams.get("create") === "1";
  const setCreating = (value: boolean) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) {next.set("create", "1"); next.delete("automation"); next.delete("run");}
    else {next.delete("create"); next.delete("name"); next.delete("instructions"); next.delete("schedule");}
    return next;
  });
  const prefill = useMemo(() => {
    const name = searchParams.get("name")?.trim() || "";
    const instructions = searchParams.get("instructions")?.trim() || "";
    let scheduleValue: unknown;
    try {scheduleValue = JSON.parse(searchParams.get("schedule") || "null");} catch {scheduleValue = null;}
    const schedule = automationScheduleSchema.safeParse(scheduleValue);
    const model = models[0];
    if (!model || (!name && !instructions && !schedule.success)) return undefined;
    const initial: CreateAutomation = {name, instructions, model: {providerId:model.providerId, modelId:model.modelId, variant:null},
      schedule: schedule.success ? schedule.data : {kind:"daily", timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", hour:9, minute:0}};
    return initial;
  }, [searchParams, models]);
  const selected = searchParams.get("automation")?.trim() || null;
  const selectedRun = searchParams.get("run")?.trim() || null;
  const setSelected = (id: string | null) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("run");
      if (id) next.set("automation", id); else next.delete("automation");
      return next;
    });
  };
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<AutomationRun[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const currentRequest = useRef({ client, selected });
  currentRequest.current = { client, selected };
  const refresh = useCallback(async () => {
    if (!client) return;
    const isCurrent = () => currentRequest.current.client === client && currentRequest.current.selected === selected;
    try {
      const result = await client.list();
      if (!isCurrent()) return;
      if (selected && !result.items.some(item => item.automation.id === selected)) {
        const detail = await client.get(selected);
        if (!isCurrent()) return;
        result.items.push(detail);
      }
      setItems(result.items);
      if (selected) {
        const runs = await client.runs(selected);
        if (!isCurrent()) return;
        setHistory(runs.items); setHistoryLoading(false);
      }
      setRefreshError(null);
    } catch (error) {
      if (isCurrent()) setRefreshError(error instanceof Error ? error.message : (currentLocale() === "zh" ? "无法刷新自动化，请重试。" : "Could not refresh automations. Try again."));
    } finally { if (isCurrent()) {setLoading(false); setHistoryLoading(false);} }
  }, [client, selected]);
  useEffect(() => {
    setDesktopConnected(null);
    if (!client) return;
    let active = true;
    const probe = async () => { const presence = await client.presence(); if (active) setDesktopConnected(presence?.connected ?? null); };
    void probe();
    const timer = setInterval(() => void probe(), 60000);
    return () => {active = false; clearInterval(timer);};
  }, [client]);
  useEffect(() => {
    setItems([]); setHistory([]); setLoading(true);
    setEditing(null); setRepairingModel(false); setArchiving(null); setBusy(false); setError(null); setRefreshError(null);
  }, [userId]);
  useEffect(() => {
    setHistory([]); setHistoryLoading(Boolean(selected));
  }, [selected]);
  useEffect(() => {
    setExpandedRuns(new Set(selectedRun ? [selectedRun] : []));
  }, [selected, selectedRun]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function perform(action: () => Promise<unknown>) {
    if (busy) return;
    const actionClient = client;
    setBusy(true); setError(null);
    try { await action(); if (currentRequest.current.client === actionClient) await refresh(); }
    catch (error) { if (currentRequest.current.client === actionClient) setError(error instanceof Error ? error.message : (currentLocale() === "zh" ? "无法更新自动化，请重试。" : "Could not update automation. Try again.")); }
    finally { if (currentRequest.current.client === actionClient) setBusy(false); }
  }
  async function runNow(id: string) {
    if (!client) return;
    await perform(async () => {
      const run = await client.run(id);
      if (currentRequest.current.client !== client) return;
      setSearchParams(new URLSearchParams({automation: id, run: run.id}));
    });
  }
  if (account.status !== "signed_in" || !client) return <div className="p-6"><Button onClick={props.onSignIn}>{text("登录后创建自动化", "Sign in to create automations")}</Button></div>;
  const selectedItem = items.find(item => item.automation.id === selected);
  const newAction = <Button onClick={() => {setRepairingModel(false); setCreating(true); setError(null);}}><Plus className="size-4"/>{text("新建自动化", "New automation")}</Button>;
  if (creating || editing) return <div className="mx-auto w-full max-w-2xl space-y-5 p-6">
    <Button variant="ghost" onClick={() => {setCreating(false); setEditing(null); setRepairingModel(false); setError(null);}}>{text("返回自动化", "Back to automations")}</Button>
    <h2 className="text-lg font-semibold">{editing ? text("编辑自动化", "Edit automation") : text("新建自动化", "Create automation")}</h2>
    <AutomationEditor key={editing?.automation.id ?? "new"} placement="desktop" onThisComputer
      initial={editing ? {name: editing.automation.name, instructions: editing.revision.instructions, schedule: editing.revision.schedule, model: editing.revision.model, workspaceId: editing.revision.workspaceId} : prefill}
      initialKey={editing?.revision.id ?? (prefill ? "calendar" : undefined)}
      onOpenProviderSettings={() => navigate(props.workspaceId ? workspaceSettingsRoute(props.workspaceId, "ai") : globalSettingsRoute("ai"))}
      openModelPickerOnMount={repairingModel}
      modelOptions={models} providerCatalog={props.providerCatalog} busy={busy}
      submitLabel={editing ? text("保存修改", "Save changes") : text("创建并启用", "Create and activate")}
      onCancel={() => {setCreating(false); setEditing(null); setRepairingModel(false); setError(null);}}
      onSave={async value => {
        await perform(async () => {
          if (editing) await client.update(editing.automation.id, value);
          else {
            const created = await client.create({...value, workspaceId: props.workspaceId});
            if (currentRequest.current.client === client) {
              setSearchParams(new URLSearchParams({automation: created.automation.id}));
              setEditing(null);
            }
            return;
          }
          if (currentRequest.current.client === client) {setCreating(false); setEditing(null); setRepairingModel(false);}
        });
      }}/>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
  const visible = items.filter(item => (item.automation.state === "archived") === showArchived && `${item.automation.name}\n${item.revision.instructions}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
    <ConfirmModal open={archiving !== null} variant="danger" title={text("归档自动化？", "Archive automation?")} message={text("停止后续运行，保留已有运行记录。", "Future runs will stop. Existing run history will be retained.")} confirmLabel={text("归档", "Archive")} cancelLabel={text("取消", "Cancel")} onCancel={() => setArchiving(null)} onConfirm={() => {const id = archiving; setArchiving(null); if (id) void perform(async () => {
      await client.archive(id);
      if (currentRequest.current.client === client && currentRequest.current.selected === id) setSelected(null);
    });}}/>
    {props.headerActionsTarget ? createPortal(newAction, props.headerActionsTarget) : <div className="flex justify-end">{newAction}</div>}
    {(error || refreshError) && <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive"><span>{error || refreshError}</span><Button variant="ghost" onClick={() => {setError(null); void refresh();}}>{text("重试", "Retry")}</Button></div>}
    {selectedItem ? <>
      <Button variant="ghost" onClick={() => setSelected(null)}>{text("返回自动化", "Back to automations")}</Button>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{selectedItem.automation.name}</h2>{selectedItem.automation.state === "archived" ? <span className="text-sm text-muted-foreground">{text("已归档", "Archived")}</span> : <Button variant="outline" onClick={() => {setRepairingModel(false); setEditing(selectedItem);}}>{text("编辑", "Edit")}</Button>}</div>
      <p className="text-sm text-muted-foreground">{formatAutomationSchedule(selectedItem.revision.schedule)}</p>
      {selectedItem.automation.state !== "archived" && <p className="text-sm text-muted-foreground">{selectedItem.automation.state === "active" ? text("已启用", "Active") : selectedItem.automation.state === "needs_attention" ? text("需要处理", "Needs attention") : text("已暂停", "Paused")}</p>}
      {selectedItem.automation.state !== "archived" && <div className="flex gap-2">
        <Button variant="outline" disabled={busy || selectedItem.automation.state === "needs_attention"} onClick={() => void runNow(selectedItem.automation.id)}>{text("立即运行", "Run now")}</Button>
        <Button variant="ghost" disabled={busy || selectedItem.automation.state === "needs_attention"} onClick={() => void perform(() => client.state(selectedItem.automation.id, selectedItem.automation.state !== "active"))}>{selectedItem.automation.state === "active" ? text("暂停", "Pause") : text("启用", "Resume")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setArchiving(selectedItem.automation.id)}>{text("归档", "Archive")}</Button>
      </div>}
      {selectedItem.automation.state === "active" && desktopConnected === false && <p role="status" data-automation-runner-offline className="text-sm text-muted-foreground">{text("没有桌面在线。请打开并登录 Get3W，以便按时运行此自动化。", "No desktop connected. Open Get3W and sign in to run this automation on schedule.")}</p>}
      {selectedItem.automation.needsAttentionReason && <div role="alert" className="space-y-2 text-sm text-muted-foreground">
        <p>{automationErrorMessage(selectedItem.automation.needsAttentionReason)}</p>
        {["model_access_lost", "provider_unavailable"].includes(selectedItem.automation.needsAttentionReason.code) && <Button variant="outline" disabled={busy} onClick={() => {setRepairingModel(true); setEditing(selectedItem);}}>{text("选择可用模型", "Select a supported model")}</Button>}
      </div>}
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">{text("模型", "Model")}</dt><dd>{describeAutomationModel(selectedItem.revision.model, models)}</dd></div><div><dt className="text-muted-foreground">{text("版本", "Revision")}</dt><dd>{selectedItem.revision.version}</dd></div></dl>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">{text("下次运行", "Next run")}</dt><dd>{selectedItem.automation.state === "active" && selectedItem.automation.nextDueAt !== null ? formatAutomationTime(selectedItem.automation.nextDueAt) : text("无后续计划", "No future run scheduled")}</dd></div>
        <div><dt className="text-muted-foreground">{text("运行时限", "Runtime limit")}</dt><dd>{Math.round(selectedItem.revision.maximumRuntimeMs / 60000)} {text("分钟", "minutes")}</dd></div>
      </dl>
      <p className="whitespace-pre-wrap text-sm">{selectedItem.revision.instructions}</p>
      <h3 className="pt-4 font-medium">{text("运行记录", "Run history")}</h3>
      {historyLoading ? <Skeleton className="h-12 w-full"/> : history.length === 0 ? <p className="text-sm text-muted-foreground">{text("尚无运行记录", "No runs yet")}</p> : <div className="divide-y">{history.map(run => <div key={run.id} className="py-3">
        <div className="flex justify-end gap-2">
          {run.executionThread?.workspaceId && <Button variant="outline" size="sm" onClick={() => {if (run.executionThread?.workspaceId) navigate(`/workspace/${encodeURIComponent(run.executionThread.workspaceId)}/session/${encodeURIComponent(run.executionThread.nativeThreadId ?? run.executionThread.id)}`);}}>{text("打开任务", "Open task")}</Button>}
          {["queued", "claimed", "running"].includes(run.status) && <Button variant="outline" size="sm" disabled={busy || Boolean(run.cancelRequestedAt)} onClick={() => void perform(() => client.cancel(selectedItem.automation.id, run.id))}>{run.cancelRequestedAt ? text("正在取消…", "Cancelling…") : text("取消运行", "Cancel run")}</Button>}
        </div>
        <details open={expandedRuns.has(run.id)} className="py-1" onToggle={event => {const open = event.currentTarget.open; if ((open && selectedRun !== run.id) || (!open && selectedRun === run.id)) setSearchParams(previous => {const next = new URLSearchParams(previous); if (open) next.set("run", run.id); else next.delete("run"); return next;}, {replace: true}); setExpandedRuns(previous => {const next = new Set(previous); if (open) next.add(run.id); else next.delete(run.id); return next;});}}>
        <summary className="cursor-pointer text-sm">{runStatusLabel(run)} <span className="text-muted-foreground">{formatAutomationTime(run.startedAt ?? run.createdAt)}</span></summary>
        <div className="space-y-2 pt-3 text-sm"><p>{run.trigger === "manual" ? text("手动运行", "Manual run") : text("定时运行", "Scheduled run")}</p>
          {run.resultSummary && <p className="whitespace-pre-wrap">{run.resultSummary}</p>}
          {run.error && <div><p className="text-destructive">{automationErrorMessage(run.error)}</p>{run.error.code === "connection_action_required" && <Button variant="ghost" onClick={() => navigate(globalSettingsRoute("connect"))}>{text("打开连接设置", "Open connections")}</Button>}</div>}
          {expandedRuns.has(run.id) && <RunReceipt models={models} client={client} automationId={selectedItem.automation.id} run={run} zh={zh}/>}
        </div></details></div>)}</div>}
    </> : <>
      <Input aria-label={text("搜索自动化", "Search automations")} placeholder={text("搜索自动化", "Search automations")} value={query} onChange={event => setQuery(event.currentTarget.value)}/>
      <Button variant="ghost" onClick={() => setShowArchived(value => !value)}>{showArchived ? text("查看当前自动化", "Show current automations") : text("查看已归档", "Show archived")}</Button>
      {loading ? <div className="space-y-3"><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div> : visible.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{query ? text("未找到自动化", "No matching automations") : showArchived ? text("尚无已归档的自动化。", "No archived automations.") : text("尚无自动化，创建一个定时任务。", "No automations yet. Create a scheduled task.")}</p> : <div className="divide-y">{visible.map(item => <div key={item.automation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Button variant="ghost" className="h-auto min-w-0 flex-1 flex-col items-start text-left" onClick={() => {setHistoryLoading(true); setHistory([]); setSelected(item.automation.id);}}><span className="font-medium">{item.automation.name}</span><span className="line-clamp-2 whitespace-normal text-sm text-muted-foreground">{item.revision.instructions}</span><span className="text-xs text-muted-foreground">{text("本机电脑", "Desktop computer")} · {item.automation.state === "active" ? text("已启用", "Active") : item.automation.state === "needs_attention" ? text("需要处理", "Needs attention") : item.automation.state === "archived" ? text("已归档", "Archived") : text("已暂停", "Paused")}</span><span className="text-xs text-muted-foreground">{formatAutomationSchedule(item.revision.schedule)}</span><span className="text-xs text-muted-foreground">{item.automation.state === "active" ? item.automation.nextDueAt === null ? text("计划已结束", "Schedule finished") : `${text("下次运行", "Next run")}: ${formatAutomationTime(item.automation.nextDueAt)}` : item.automation.state === "archived" ? text("已归档", "Archived") : item.automation.state === "needs_attention" ? text("需要处理", "Needs attention") : text("已暂停", "Paused")}{item.latestRun ? ` · ${runStatusLabel(item.latestRun)}` : ""}</span></Button>
        {item.automation.state !== "archived" && <div className="flex gap-1"><Button variant="ghost" disabled={busy || item.automation.state === "needs_attention"} onClick={() => void runNow(item.automation.id)}>{text("立即运行", "Run now")}</Button><Button variant="ghost" disabled={busy || item.automation.state === "needs_attention"} onClick={() => void perform(() => client.state(item.automation.id, item.automation.state !== "active"))}>{item.automation.state === "active" ? text("暂停", "Pause") : text("启用", "Resume")}</Button><Button variant="ghost" disabled={busy} onClick={() => setArchiving(item.automation.id)}>{text("归档", "Archive")}</Button></div>}
      </div>)}</div>}
    </>}
  </div>;
}

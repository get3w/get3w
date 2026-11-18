import { t } from "@/i18n";
import * as React from "react"
import type { UIMessage } from "ai"
import { ArrowUpRight, ChevronRight } from "lucide-react"

import {
  backgroundShellNoticeLabel,
  readBackgroundShellNotice,
  runningBackgroundTasksLabel,
  type BackgroundShellNotice,
} from "@/app/lib/background-shell-tasks"
import { readSubagentNotice, subagentNoticeLabel, type SubagentNotice } from "@/app/lib/subagent-notices"
import { useMessageList } from "@/components/chat/message-list-provider"
import { formatElapsedSeconds } from "@/lib/tool-call-duration"
import { Message } from "@/components/ui/message"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useWorkspaceMaybe } from "@/react-app/shell/workspace-provider"
import { manageBackgroundShell } from "@/react-app/domains/session/sync/session-sync"
import { cn } from "@/lib/utils"
import type { BackgroundShell } from "@/react-app/domains/session/status/background-shell-store"

const COMMAND_PREVIEW_LENGTH = 80

function commandPreview(command: string): string {
  const oneLine = command.replace(/\s+/g, " ").trim()
  return oneLine.length > COMMAND_PREVIEW_LENGTH ? `${oneLine.slice(0, COMMAND_PREVIEW_LENGTH - 1)}…` : oneLine
}

/** The completion notice a transcript message carries, if it is one. */
export function backgroundShellNoticeFromMessage(message: UIMessage): BackgroundShellNotice | null {
  if (message.role !== "system") return null
  for (const part of message.parts) {
    if (part.type !== "text") continue
    const notice = readBackgroundShellNotice(part.providerMetadata?.opencode?.backgroundShell)
    if (notice) return notice
  }
  return null
}

/**
 * Where a background command ended, in the transcript: one quiet row in the
 * step rail's shape (sentence and command), never the engine's
 * raw `<shell>` hand-off text. The text-first rail drops the glyph.
 */
export const BackgroundTaskNotice = React.memo(function BackgroundTaskNotice({ message, notice }: { message: UIMessage; notice: BackgroundShellNotice }) {
  const command = commandPreview(notice.command)
  return (
    <Message
      className="mx-auto flex w-full max-w-3xl flex-col items-start gap-2 px-2 md:px-10"
      data-message-id={message.id}
      data-message-role={message.role}
    >
      <div
        data-background-task-notice={notice.outcome}
        className="flex w-full min-w-0 items-center gap-2 py-1 text-sm text-muted-foreground"
      >
        <span className="shrink-0">{backgroundShellNoticeLabel(notice)}</span>
        {command ? <code className="min-w-0 truncate font-mono text-xs text-slate-9" title={notice.command}>{command}</code> : null}
      </div>
    </Message>
  )
})

/** The background sub-agent completion notice a transcript message carries, if it is one. */
export function subagentNoticeFromMessage(message: UIMessage): SubagentNotice | null {
  if (message.role !== "system") return null
  for (const part of message.parts) {
    if (part.type !== "text") continue
    const notice = readSubagentNotice(part.providerMetadata?.opencode?.subagentNotice)
    if (notice) return notice
  }
  return null
}

/**
 * Where a background sub-agent ended, in the transcript: one quiet row in the
 * same shape as a background command's, never the engine's raw `<subagent>`
 * hand-off text. It opens the sub-agent's chat, like its run line does.
 * The text-first rail reads like every other step, "Sub-agent
 * finished Diagnose stuck conversion", with no glyph.
 */
export const SubagentNoticeRow = React.memo(function SubagentNoticeRow({ message, notice }: { message: UIMessage; notice: SubagentNotice }) {
  const { onOpenSubagentSession } = useMessageList()
  const label = subagentNoticeLabel(notice)
  const content = (
    <>
      <span className="shrink-0">{label}</span>
      {notice.description ? <span className="min-w-0 truncate text-slate-9" title={notice.description}>{notice.description}</span> : null}
    </>
  )
  const rowClassName = "flex w-full min-w-0 items-center gap-2 py-1 text-start text-sm text-muted-foreground"
  return (
    <Message
      className="mx-auto flex w-full max-w-3xl flex-col items-start gap-2 px-2 md:px-10"
      data-message-id={message.id}
      data-message-role={message.role}
    >
      {onOpenSubagentSession ? (
        <button
          type="button"
          data-subagent-notice={notice.outcome}
          className={cn(rowClassName, "group cursor-pointer transition-colors hover:text-foreground")}
          aria-label={`${label}${notice.description ? `: ${notice.description}` : ""}. Open sub-agent chat`}
          onClick={() => onOpenSubagentSession(notice.childSessionId)}
        >
          {content}
          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : (
        <div data-subagent-notice={notice.outcome} className={rowClassName}>{content}</div>
      )}
    </Message>
  )
})

type BackgroundTasksProps = {
  shells: BackgroundShell[]
  /** The connection cannot confirm the count right now: show it without the live shimmer. */
  stale?: boolean
}

type BackgroundTasksLabelProps = BackgroundTasksProps & {
  /** Off when the label sits inside a line whose one shimmer already covers it. */
  shimmer?: boolean
}

/**
 * "2 running background tasks": commands the agent left running. Click to inspect command output or stop an individual task.
 */
export const BackgroundTasksLabel = React.memo(function BackgroundTasksLabel({ shells, stale = false }: BackgroundTasksLabelProps) {
  const [open, setOpen] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [open])
  const workspace = useWorkspaceMaybe()
  const { workspaceId, sessionId, readOnly } = useMessageList()
  const [output, setOutput] = React.useState<{ id: string; text: string } | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState<{ id: string; stop: boolean } | null>(null)
  const run = async (shell: BackgroundShell, stop: boolean) => {
    if (!workspace?.opencodeBaseUrl || busy) return
    setBusy({ id: shell.id, stop })
    setError("")
    try {
      const text = await manageBackgroundShell({ workspaceId, baseUrl: workspace.opencodeBaseUrl, sessionId, shellId: shell.id }, stop, AbortSignal.timeout(15_000))
      if (!stop) setOutput({ id: shell.id, text })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("backgroundTasks.actionFailed"))
    } finally { setBusy(null) }
  }
  return (
    <span data-background-tasks={shells.length}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="ghost" size="sm" />} className="h-8 gap-2 rounded-lg px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
          <span className={cn("size-1.5 shrink-0 rounded-full", stale ? "bg-muted-foreground/40" : "bg-foreground/60")} aria-hidden="true" />
          <span>{runningBackgroundTasksLabel(shells.length)}</span>
          <ChevronRight className="size-3.5 opacity-60" aria-hidden="true" />
        </DialogTrigger>
        <DialogContent className="gap-4 lg:max-w-2xl">
          <DialogTitle>{t("backgroundTasks.title")}</DialogTitle>
          {stale && <p role="status" className="text-sm text-muted-foreground">{t("backgroundTasks.stale")}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-border">
            {shells.length === 0 && <p className="py-3 text-muted-foreground">{t("backgroundTasks.empty")}</p>}
            {shells.map(shell => <div key={shell.id} className="space-y-3 py-4">
              <code className="block whitespace-pre-wrap break-all text-xs">{shell.command || t("ui.713166971d73")}</code>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-xs text-muted-foreground">{t("backgroundTasks.running")} {shell.startedAt > 0 ? formatElapsedSeconds(Math.max(0, Math.floor((now - shell.startedAt) / 1000))) : ""}</span>
                <Button variant="outline" size="sm" disabled={Boolean(busy) || !workspace?.opencodeBaseUrl} onClick={() => void run(shell, false)}>{busy?.id === shell.id && !busy.stop ? t("backgroundTasks.loading") : t("backgroundTasks.output")}</Button>
                <Button variant="destructive" size="sm" disabled={Boolean(busy) || readOnly || !workspace?.opencodeBaseUrl} onClick={() => void run(shell, true)}>{busy?.id === shell.id && busy.stop ? t("backgroundTasks.stopping") : t("backgroundTasks.stop")}</Button>
              </div>
              {output?.id === shell.id && <pre tabIndex={0} aria-label={t("backgroundTasks.outputLabel")} className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{output.text.replace(/\x1b\[[0-9;]*m/g, "") || t("backgroundTasks.noOutput")}</pre>}
            </div>)}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  )
})

/**
 * The count on its own line, once the turn is over. It takes the Working
 * line's place with the same height, so the chat does not move when the
 * turn ends and the count stays.
 */
export const BackgroundTasksMessage = React.memo(function BackgroundTasksMessage(props: BackgroundTasksProps) {
  return (
    <Message className="mx-auto flex w-full max-w-3xl flex-col items-start gap-2 px-2 md:px-10">
      <div role="status" data-background-tasks-line="" className="py-1 text-sm text-muted-foreground">
        <BackgroundTasksLabel {...props} />
      </div>
    </Message>
  )
})

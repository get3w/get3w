import { t } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Blocks, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { formatToolCallDuration } from "@/lib/tool-call-duration";
import { isToolPartInFlight } from "@/lib/tool-activity";
import { useOptionalMessageList } from "./message-list-provider";
import { useCurrentSessionActivityStatus } from "./current-tool-lifecycle-context";
import {
  appCreationProgress,
  appRead,
  isAppGuidePart,
  type AppCreationRun,
} from "@/react-app/domains/apps/app-creation-progress";
import { appBuilderResultFailed } from "@/react-app/domains/apps/built-mcp-app-model";
import { BuiltAppChatPreview } from "@/react-app/domains/apps/built-app-chat-preview";
import { DetailsToggle, TechnicalDetailsPanel } from "./capability-call-line";
import type { DynamicToolUIPart } from "ai";

/**
 * Den's build rejection, shortened to what changed: "MCP App compilation
 * failed. Generated MCP Apps cannot use timers. Use …" → "Can't use timers".
 */
export function appBuildProblem(part: DynamicToolUIPart): string | null {
  if (part.state !== "output-error" || !part.errorText.trim()) return null;
  const sentences = part.errorText.replace(/\s+/g, " ").trim().split(/(?<=\.)\s+/);
  const reason = sentences.find((sentence) => !/compilation failed|^error:/i.test(sentence)) ?? sentences[0] ?? "";
  return reason
    .replace(/^Generated MCP Apps cannot /i, "Can’t ")
    .replace(/\.$/, "")
    .slice(0, 120) || null;
}

type StageState = "done" | "active" | "failed" | "pending";
type Stage = { key: string; label: string; state: StageState; notes?: string[] };

/**
 * The fixed stages of making an App, each labelled from the agent's own
 * calls: the tools it searched and prepare_app checked, the source it is
 * writing, each problem it fixed, and the build. Edits read the App instead
 * of finding and checking tools.
 */
function appCreationStages(
  run: AppCreationRun,
  progress: ReturnType<typeof appCreationProgress>,
  editing: boolean,
  fixedProblems: string[],
  latestProblem: string | null,
): Stage[] {
  const discoveries = run.discoveries ?? [];
  const searches = discoveries.filter((part) => /(?:^|_)search_capabilities$/.test(part.toolName));
  const query = Reflect.get(Object(searches.at(-1)?.input), "query");
  const build = progress.build;
  const built = Boolean(progress.app || progress.builtUnrecorded);
  const building = Boolean(build && build.state !== "input-streaming");
  const writing = progress.stage === "writing" || Boolean(build) || (run.script !== undefined && run.script.kind !== "prepare");
  const checking = Boolean(run.preparation) || run.script?.kind === "prepare"
    || (discoveries.length > 0 && !searches.some(isToolPartInFlight));
  const preparationFailed = Boolean(run.preparation && appBuilderResultFailed(run.preparation) && !progress.preparation);
  // The stage the agent is on; every earlier one is done.
  const current = built ? Infinity : building || progress.failed || progress.unavailable ? 3 : writing ? 2 : checking ? 1 : 0;
  const stateOf = (index: number, failed = false): StageState => index < current
    ? "done"
    : index > current ? "pending" : failed ? "failed" : "active";
  const buildFailed = progress.failed || progress.unavailable;
  const buildStage: Stage = {
    key: "build",
    state: stateOf(3, buildFailed),
    label: buildFailed
      ? progress.unavailable ? t("ui.1695cf392973") : `Couldn’t build${latestProblem ? `: ${latestProblem}` : " it"}`
      : current > 3 ? t("ui.38dca4bc5a49") : current === 3 ? t("ui.b1469cc5a9f5") : t("ui.59ee8c7738fa"),
    ...(fixedProblems.length > 0 ? { notes: fixedProblems.map((problem) => `Fixed: ${problem}`) } : {}),
  };
  const readyStage: Stage = { key: "ready", state: built ? "done" : "pending", label: built ? "Ready" : t("ui.46d3b9c3a9e5") };

  if (editing) {
    const read = discoveries.map(appRead).find(Boolean);
    return [
      { key: "read", state: "done", label: read?.title ? `Read “${read.title}”` : t("ui.8aefc0f7fb56") },
      { key: "write", state: stateOf(2), label: current > 2 ? t("ui.9a81e4b38521") : current === 2 ? t("ui.697ec3912d15") : t("ui.a6ae434ea3cd") },
      buildStage,
      readyStage,
    ];
  }
  const count = progress.preparation?.tools.length;
  return [
    {
      key: "find",
      state: stateOf(0),
      label: current > 0
        ? searches.length === 1 && typeof query === "string" && query
          ? `Searched your connections for “${query}”`
          : searches.length > 1 ? `Searched your connections ${searches.length} times`
            : discoveries.some(isAppGuidePart) ? t("ui.1a4424d47a5c") : t("ui.646be4083e3d")
        : current === 0 ? t("ui.f9fe5c33b2f2") : t("ui.8c15a117757a"),
    },
    {
      key: "check",
      state: stateOf(1, preparationFailed),
      label: preparationFailed
        ? t("ui.d7a14f8475ac")
        : current > 1
          ? count === undefined ? t("ui.97207b5aa9a8") : count === 0 ? t("ui.54b5095df7e1") : `Checked ${count} ${count === 1 ? "tool" : "tools"}`
          : current === 1 ? t("ui.5512879bd2a7") : t("ui.5360fae658c3"),
    },
    { key: "write", state: stateOf(2), label: current > 2 ? t("ui.612368bdf73d") : current === 2 ? t("ui.7b0b17f00dda") : t("ui.5f9b2d577944") },
    buildStage,
    readyStage,
  ];
}

function StageMark({ state, running }: { state: StageState; running: boolean }) {
  if (state === "done") {
    return <CircleCheck className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />;
  }
  if (state === "failed") {
    return <CircleX className="size-4 shrink-0 text-destructive" strokeWidth={1.5} aria-hidden="true" />;
  }
  if (state === "active") {
    return <span className="inline-flex size-4 shrink-0 items-center justify-center gap-0.5 rounded-full border border-current text-foreground" aria-hidden="true">
      {[0, 1, 2].map(dot => <span key={dot} className={`size-0.5 rounded-full bg-current ${running ? "ow-app-progress-dot" : ""}`} style={{ animationDelay: `${dot * 160}ms` }} />)}
    </span>;
  }
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />;
}

export function AppBuilderStep({
  run,
  active,
  activity = null,
  startedAt = null,
  completedAt = null,
}: {
  run: AppCreationRun;
  active: boolean;
  startedAt?: number | null;
  completedAt?: number | null;
  /** While the panel is live: the agent's latest thought or call, shown under the active stage. */
  activity?: string | null;
}) {
  const context = useOptionalMessageList();
  const sessionActivity = useCurrentSessionActivityStatus();
  const waiting = active && sessionActivity === "waiting";
  // The App spans many tools. A finished/superseded tool is not a pause
  // while the parent turn is still active; Stop is reflected by active.
  const progress = appCreationProgress(
    run,
    active &&
      !context?.syncDegraded &&
      !waiting,
  );
  const parts = [...(run.executions ?? []), ...(run.attempts ?? []), ...(run.discoveries ?? []), ...(run.preparation ? [run.preparation] : []), ...run.builds];
  const starts = parts.flatMap((part) =>
    typeof part.callProviderMetadata?.openwork?.toolStartedAt === "number"
      ? [part.callProviderMetadata.openwork.toolStartedAt]
      : [],
  );
  const ends = parts.flatMap((part) =>
    typeof part.callProviderMetadata?.openwork?.toolCompletedAt === "number"
      ? [part.callProviderMetadata.openwork.toolCompletedAt]
      : [],
  );
  // A persisted message timestamp also covers engines without per-tool timing.
  // Keep the optimistic fallback stable for the lifetime of this App card.
  const firstObservedAt = useRef(Date.now());
  const beganAt = run.startedAt ?? (starts.length ? Math.min(...starts) : startedAt ?? firstObservedAt.current);
  const [now, setNow] = useState(Date.now);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Earlier rejected builds are progress on the same app, not new apps.
  const fixedProblems = [...(run.attempts ?? []), ...run.builds.slice(0, -1)].flatMap((part) => {
    const problem = appBuildProblem(part);
    return problem ? [problem] : [];
  });
  const latestProblem = progress.build ? appBuildProblem(progress.build) : null;
  useEffect(() => {
    if (!progress.running) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [progress.running]);
  const terminal = progress.app || progress.builtUnrecorded || progress.failed || progress.unavailable;
  const endedAt = terminal ? (ends.length ? Math.max(...ends) : completedAt) : now;
  const elapsed = endedAt === null ? null : Math.max(0, endedAt - beganAt);
  const editing = Boolean(
    run.intent?.kind === "edit" ||
    run.script?.kind === "update" ||
    (progress.build && /(?:^|_)update_app$/.test(progress.build.toolName)),
  );
  const built = Boolean(progress.app || progress.builtUnrecorded);
  const title = progress.title ? ` “${progress.title}”` : "";
  const state = progress.builtUnrecorded
    ? t("ui.ddbf7ebd9936")
    : progress.unavailable
      ? t("ui.b99fa6c06150")
      : !progress.running && !built && !progress.failed && !progress.unavailable
      ? context?.syncDegraded ? "Reconnecting" : waiting ? t("ui.e4d42bba5c0a") : "Paused"
      : null;
  const shownElapsed = elapsed !== null && (active || terminal || starts.length > 0) ? formatToolCallDuration(elapsed) : null;

  // The stages show while the agent works, or after it failed or paused; a
  // ready App folds them into one row.
  const stages = built ? [] : appCreationStages(run, progress, editing, fixedProblems, latestProblem);
  const details = detailsOpen ? (
    <div className="mt-2 flex flex-col gap-2">
      {parts.map((part) => (
        <TechnicalDetailsPanel key={part.toolCallId} part={part} />
      ))}
    </div>
  ) : null;

  const artifactSentence = built
    ? `${editing ? "Updated" : "Created"} artifact${title}`
    : progress.title ?? (editing ? t("ui.f6d7788e8f83") : "Artifact");
  const currentStage = stages.find((stage) => stage.state === "failed")
    ?? stages.find((stage) => stage.state === "active");
  const failedPart = [progress.build, run.preparation, run.script?.part].find(
    (part) => part && appBuilderResultFailed(part),
  );
  const problem = failedPart ? appBuildProblem(failedPart) : null;
  // A compiled view is not proof that its connected data has been read.
  // Keep the summary factual; the original checklist remains in details.
  const stageLabel = currentStage?.key === "write"
    ? editing ? t("ui.697ec3912d15") : t("ui.7b1cce82150a")
    : currentStage?.key === "build" ? t("ui.9964cf80ec9e")
    : currentStage?.key === "check" ? t("ui.7a8a093ec2e1")
    : t("ui.34982110c00d");
  const subtitle = progress.failed
    ? `${problem ?? (failedPart?.state === "output-denied" ? t("ui.720208dcfd1e") : `Couldn’t ${editing ? "update" : "create"} the artifact`)}. Review details before retrying.`
    : progress.unavailable ? t("ui.b3584dc3e883")
    : progress.builtUnrecorded ? t("ui.ddbf7ebd9936")
    : built ? null
    : state === "Reconnecting" ? t("ui.04c8905e59ae")
    : state === "Waiting for your response" ? t("ui.19c61bf635ce")
    : state === "Paused" ? t("ui.5abac0e9cce9")
    : stageLabel;
  return (
    <section
      className="group/step w-full min-w-0"
      data-app-builder-step
      data-artifact-progress
      data-app-creation-stage={progress.stage}
      aria-label={artifactSentence}
    >
      {/* Both lines and trailing slots stay mounted through tool/thought gaps.
          Completion also keeps the same geometry instead of collapsing chat. */}
      <div className="flex min-h-12 min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0" aria-hidden="true">
          {built ? <Blocks className="size-4 text-muted-foreground" strokeWidth={1.5} />
            : <StageMark state={progress.failed || progress.unavailable ? "failed" : "active"} running={progress.running} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate ${built ? "text-muted-foreground" : "text-foreground"}`}>{artifactSentence}</div>
          <div
            className={`h-4 truncate text-xs ${progress.failed || progress.unavailable ? "text-destructive" : "text-muted-foreground"}`}
            data-app-builder-activity
            title={subtitle ?? undefined}
          >
            {subtitle}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {shownElapsed ? <span className="text-xs tabular-nums text-muted-foreground/70" data-app-builder-elapsed>{shownElapsed}</span> : null}
          {progress.app && progress.build ? <BuiltAppChatPreview part={progress.build} compact /> : null}
          <DetailsToggle open={detailsOpen} onToggle={() => setDetailsOpen(!detailsOpen)} label={artifactSentence} alwaysVisible={!progress.running && !built} />
        </span>
      </div>
      {detailsOpen ? (
        <div className="mt-2 min-w-0">
          <ol className="flex flex-col gap-2 text-sm" aria-label={`Stages of ${artifactSentence}`} data-app-builder-checklist>
            {appCreationStages(run, progress, editing, fixedProblems, latestProblem).map((stage) => (
              <li key={stage.key} className="flex min-w-0 flex-col" data-checklist-state={stage.state}>
                <span className="flex min-w-0 items-center gap-2">
                  <StageMark state={stage.state} running={progress.running} />
                  <span className={stage.state === "failed" ? "text-destructive" : "text-muted-foreground"}>{stage.label}</span>
                </span>
                {stage.notes?.map((note) => <span key={note} className="ml-6 text-muted-foreground">{note}</span>)}
                {stage.state === "active" ? <span className="ml-6 h-4 truncate text-xs text-muted-foreground">{progress.running ? activity : null}</span> : null}
              </li>
            ))}
          </ol>
          {details}
        </div>
      ) : null}
    </section>
  );
}

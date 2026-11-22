import type { AlwaysOnSettings } from "@get3w/types/workspace";
/** @jsxImportSource react */
import {
  FolderPlus,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlwaysOnWorkspaceFields } from "./always-on-workspace-fields";
import { useId } from "react";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import type { WorkspacePreset } from "../../../app/types";
import { t } from "../../../i18n";
import type { CreateWorkspaceOptions } from "./types";
import {
  errorBannerClass,
  modalBodyClass,
  pillGhostClass,
  pillSecondaryClass,
  softCardClass,
  tagClass,
  warningBannerClass,
} from "./modal-styles";

export type CreateWorkspaceProgressStep = {
  key: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string | null;
};

export type CreateWorkspaceProgressSnapshot = {
  runId: string;
  startedAt: number;
  stage: string;
  error: string | null;
  steps: CreateWorkspaceProgressStep[];
  logs: string[];
};

export type CreateWorkspaceLocalPanelProps = {
  workspaceType: "local" | "always-on";
  alwaysOn: AlwaysOnSettings;
  onAlwaysOnChange: (value: AlwaysOnSettings) => void;
  alwaysOnValid: boolean;
  disabled: boolean;
  disabledReason?: string | null;
  selectedFolder: string | null;
  hasSelectedFolder: boolean;
  pickingFolder: boolean;
  onPickFolder: () => void;
  projectLabel: string;
  onProjectLabelInput: (value: string) => void;
  showProjectLabel: boolean;
  submitting: boolean;
  localError: string | null;
  onClose: () => void;
  onSubmit: () => void;
  confirmLabel?: string;
  workerLabel?: string;
  onConfirmWorker?: (preset: WorkspacePreset, folder: string | null, options?: CreateWorkspaceOptions) => void;
  preset: WorkspacePreset;
  workerSubmitting: boolean;
  workerDisabled: boolean;
  workerDisabledReason: string | null;
  workerCtaLabel?: string;
  workerCtaDescription?: string;
  onWorkerCta?: () => void;
  workerRetryLabel?: string;
  onWorkerRetry?: () => void;
  workerDebugLines: string[];
  progress: CreateWorkspaceProgressSnapshot | null;
  elapsedSeconds: number;
  showProgressDetails: boolean;
  onToggleProgressDetails: () => void;
};

function stepIcon(status: CreateWorkspaceProgressStep["status"]) {
  if (status === "done")
    return <XCircle size={16} className="text-emerald-10" />;
  if (status === "active")
    return <Loader2 size={16} className="animate-spin text-dls-accent" />;
  if (status === "error") return <XCircle size={16} className="text-red-10" />;
  return <div className="size-4 rounded-full border-2 border-dls-border" />;
}

function toKeyedLines(lines: string[]) {
  let offset = 0;
  return lines.map((line) => {
    const key = `${offset}:${line}`;
    offset += line.length + 1;
    return { key, line };
  });
}

function stepTextClass(status: CreateWorkspaceProgressStep["status"]) {
  if (status === "done") return "text-dls-text font-medium";
  if (status === "active") return "text-dls-text font-semibold";
  if (status === "error") return "text-red-11 font-medium";
  return "text-dls-secondary";
}

export function CreateWorkspaceLocalPanel(
  props: CreateWorkspaceLocalPanelProps,
) {
  const progress = props.progress;
  const projectId = useId();
  const alwaysOn = props.workspaceType === "always-on";

  return (
    <>
      <div className={`${modalBodyClass} space-y-4 overflow-x-hidden`}>
        <div className={alwaysOn ? "grid gap-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : "space-y-4"}>
        {props.showProjectLabel ? <div className="min-w-0 space-y-2">
          <label htmlFor={projectId} className="block text-sm font-medium">
            {t("ui.25498193b898")} <span className="font-normal text-muted-foreground">{t("ui.0059798b7f70")}</span>
          </label>
          <Input id={projectId} value={props.projectLabel}
            onChange={event=>props.onProjectLabelInput(event.currentTarget.value)}
            placeholder={t("ui.63b0599976b3")} disabled={props.submitting || props.disabled}/>
        </div> : null}
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("welcome.folder_title")}</div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={props.selectedFolder??undefined}>
              {props.hasSelectedFolder ? props.selectedFolder : t("ui.7bb9a22801ee")}
            </span>
            <Button variant="outline" onClick={props.onPickFolder} disabled={props.pickingFolder || props.submitting || props.disabled}>
              {props.pickingFolder ? <Loader2 className="size-4 animate-spin"/> : <FolderPlus className="size-4"/>}
              {props.hasSelectedFolder ? t("dashboard.change") : t("ui.2ed6bf93669d")}
            </Button>
          </div>
          {props.disabled && props.disabledReason ? <p className="text-xs text-muted-foreground">{props.disabledReason}</p> : null}
        </div>
        </div>
        {alwaysOn ? <AlwaysOnWorkspaceFields disabled={props.submitting || props.disabled} value={props.alwaysOn} onChange={props.onAlwaysOnChange} /> : null}
      </div>

    <DialogFooter className={alwaysOn ? "flex-col gap-3 border-t border-border pt-4" : "flex-col gap-3 px-6 py-4"}>
        {props.submitting && progress ? (
          <div className={softCardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-dls-text">
                  {progress.error ? (
                    <XCircle size={14} className="text-red-11" />
                  ) : (
                    <Loader2 size={14} className="animate-spin text-dls-accent" />
                  )}
                  {t("ui.a898b0ef23ef")}
                </div>
                <div className="mt-1 truncate text-[14px] leading-snug text-dls-text">
                  {progress.stage}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-dls-secondary">
                  {props.elapsedSeconds}s
                </div>
              </div>
              <button
                type="button"
                className={pillGhostClass}
                onClick={props.onToggleProgressDetails}
              >
                {props.showProgressDetails ? t("ui.215a7fddc61f") : t("ui.b94c746671f1")}
              </button>
            </div>

            {progress.error ? (
              <div className={`mt-3 ${errorBannerClass}`}>{progress.error}</div>
            ) : null}

            <div className="mt-4 grid gap-2.5">
              {progress.steps.map((step) => (
                <div key={step.key} className="flex items-center gap-3">
                  <div className="flex size-5 shrink-0 items-center justify-center">
                    {stepIcon(step.status)}
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div
                      className={`text-[12px] ${stepTextClass(step.status)} transition-colors duration-200`.trim()}
                    >
                      {step.label}
                    </div>
                    {step.detail?.trim() ? (
                      <div
                        className={`${tagClass} max-w-[120px] truncate font-mono`}
                      >
                        {step.detail}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {props.showProgressDetails && progress.logs.length > 0 ? (
              <div className={`mt-3 ${softCardClass}`}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-dls-secondary">
                  {t("ui.a60eb9b8f87d")}
                </div>
                <div className="max-h-[120px] space-y-0.5 overflow-y-auto">
                  {toKeyedLines(progress.logs.slice(-10)).map(({ key, line }) => (
                    <div
                      key={`${progress.runId}-log-${key}`}
                      className="break-all font-mono text-[10px] leading-tight text-dls-text"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {props.onConfirmWorker &&
        props.workerDisabled &&
        props.workerDisabledReason ? (
          <div className={warningBannerClass}>
            <div className="font-semibold text-amber-12">
              {t("dashboard.sandbox_get_ready_title")}
            </div>
            <div className="mt-1 leading-relaxed">
              {props.workerDisabledReason || props.workerCtaDescription}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {props.onWorkerCta && props.workerCtaLabel?.trim() ? (
                <button
                  type="button"
                  className={pillSecondaryClass}
                  onClick={props.onWorkerCta}
                  disabled={props.submitting}
                >
                  {props.workerCtaLabel}
                </button>
              ) : null}
              {props.onWorkerRetry && props.workerRetryLabel?.trim() ? (
                <button
                  type="button"
                  className={pillGhostClass}
                  onClick={props.onWorkerRetry}
                  disabled={props.submitting}
                >
                  {props.workerRetryLabel}
                </button>
              ) : null}
            </div>
            {props.workerDebugLines.length > 0 ? (
              <details
                className={`mt-3 ${softCardClass} text-[11px] text-dls-text`}
              >
                <summary className="cursor-pointer text-[12px] font-semibold text-dls-text">
                  {t("ui.b2776117a96c")}
                </summary>
                <div className="mt-2 space-y-1 break-words font-mono">
                  {toKeyedLines(props.workerDebugLines).map(({ key, line }) => (
                    <div key={`docker-line-${key}`}>{line}</div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {props.localError ? (
          <div className="mb-3 whitespace-pre-line rounded-[20px] border border-red-7/20 bg-red-1/40 px-4 py-3 text-[13px] text-red-11">
            {props.localError}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <DialogClose
            disabled={props.submitting}
            render={<Button variant="outline" disabled={props.submitting} />}
          >
            {t("common.cancel")}
          </DialogClose>
          {props.onConfirmWorker && !alwaysOn ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                props.onConfirmWorker?.(props.preset, props.selectedFolder, {
                  projectLabel: props.projectLabel.trim() || null,
                })
              }
              disabled={
                !props.selectedFolder ||
                props.submitting ||
                props.workerSubmitting ||
                props.workerDisabled
              }
              title={
                !props.selectedFolder
                  ? t("dashboard.choose_folder_continue")
                  : props.workerDisabledReason || undefined
              }
            >
              {props.workerSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {t("dashboard.sandbox_checking_docker")}
                </span>
              ) : (
                (props.workerLabel ??
                  t("dashboard.create_sandbox_confirm"))
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void props.onSubmit()}
            disabled={(alwaysOn && !props.alwaysOnValid) || !props.selectedFolder || props.submitting || props.disabled}
            title={
              !props.selectedFolder
                ? t("dashboard.choose_folder_continue")
                : undefined
            }
          >
            {props.submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                {t("ui.c79ed9492e3c")}
              </span>
            ) : (
              (alwaysOn ? t("workspace.create_and_run") : props.confirmLabel ??
                t("dashboard.create_workspace_confirm"))
            )}
          </Button>
        </div>
    </DialogFooter>
    </>
  );
}

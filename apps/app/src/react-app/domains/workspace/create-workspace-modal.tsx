import type { AlwaysOnSettings } from "@get3w/types/workspace";
/** @jsxImportSource react */
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type SetStateAction,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "../../../i18n";
import { CreateWorkspaceLocalPanel } from "./create-workspace-local-panel";
import {
  createInitialWorkspaceLocalState,
  createWorkspaceLocalReducer,
  shouldTickWorkspaceElapsedClock,
  type CreateWorkspaceLocalState,
} from "./create-workspace-modal-state";
import { ArrowLeft, Clock, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceOptionCard } from "./option-card";
import type { CreateWorkspaceModalProps } from "./types";

const initialAlwaysOnSettings = (): AlwaysOnSettings => ({ goal: "", criteria: "", behavior: "", fullAccess: false, costAuto: false, costLimit: "7.00", intervalMinutes: 60 });
export function CreateWorkspaceModal(props: CreateWorkspaceModalProps) {
  const [alwaysOn, setAlwaysOn] = useState(initialAlwaysOnSettings);
  const [workspaceType, setWorkspaceType] = useState<"local" | "always-on" | null>(null);
  const [localState, dispatchLocal] = useReducer(
    createWorkspaceLocalReducer,
    undefined,
    () => createInitialWorkspaceLocalState(),
  );
  const {
    selectedFolder,
    pickingFolder,
    showProgressDetails,
    now,
    projectLabel,
  } = localState;
  const setLocal = <K extends keyof CreateWorkspaceLocalState>(
    key: K,
    value: SetStateAction<CreateWorkspaceLocalState[K]>,
  ) => dispatchLocal({ type: "set", key, value });
  const setSelectedFolder = (value: SetStateAction<string | null>) => setLocal("selectedFolder", value);
  const setPickingFolder = (value: SetStateAction<boolean>) => setLocal("pickingFolder", value);
  const setShowProgressDetails = (value: SetStateAction<boolean>) => setLocal("showProgressDetails", value);
  const setNow = (value: SetStateAction<number>) => setLocal("now", value);
  const setProjectLabel = (value: SetStateAction<string>) => setLocal("projectLabel", value);
  const preset = props.defaultPreset ?? "starter";

  const showClose = props.showClose ?? true;
  const submitting = props.submitting ?? false;
  const workerSubmitting = props.workerSubmitting ?? false;
  const progress = props.submittingProgress ?? null;
  const workerDisabled = Boolean(props.workerDisabled);
  const showProjectLabel = props.showProjectLabel ?? true;
  const workerDisabledReason = (props.workerDisabledReason ?? "").trim();
  const workerDebugLines = useMemo(
    () => (props.workerDebugLines ?? []).flatMap((line) => {
      const trimmed = line.trim();
      return trimmed ? [trimmed] : [];
    }),
    [props.workerDebugLines],
  );
  const hasSelectedFolder = Boolean(selectedFolder?.trim());
  const localError = (props.localError ?? "").trim() || null;
  const elapsedSeconds = useMemo(() => {
    if (!progress?.startedAt) return 0;
    return Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  }, [now, progress]);

  // Reset state when the modal opens.
  useEffect(() => {
    if (!props.open) return;
    dispatchLocal({ type: "reset" });
    setWorkspaceType(null);
    setAlwaysOn(initialAlwaysOnSettings());
  }, [props.open]);

  // The modal remains mounted when closed. Only publish elapsed-time updates
  // while its progress UI is both visible and backed by a real start time.
  useEffect(() => {
    if (!submitting) {
      setShowProgressDetails(false);
    }
    if (!shouldTickWorkspaceElapsedClock({
      open: props.open,
      submitting,
      startedAt: progress?.startedAt,
    })) return;

    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [progress?.startedAt, props.open, submitting]);

  const handlePickFolder = async () => {
    if (pickingFolder || submitting || props.localDisabled) return;
    setPickingFolder(true);
    try {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
      const next = await props.onPickFolder();
      if (next) setSelectedFolder(next);
    } catch {
      // Folder picker cancellation or bridge errors should never leave the
      // modal in a busy state.
    } finally {
      setPickingFolder(false);
    }
  };

  const alwaysOnValid = Boolean(alwaysOn.goal.trim()) && Number.isInteger(alwaysOn.intervalMinutes) && alwaysOn.intervalMinutes >= 1 && alwaysOn.intervalMinutes <= 10080 && (!alwaysOn.costAuto || (/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(alwaysOn.costLimit) && Number(alwaysOn.costLimit) > 0));

  const handleLocalSubmit = async () => {
    if (!workspaceType || (workspaceType === "always-on" && !alwaysOnValid) || !hasSelectedFolder || submitting || props.localDisabled) return;
    props.onConfirm(preset, selectedFolder, {
      projectLabel: projectLabel.trim() || null,
      ...(workspaceType === "always-on" ? { workspaceType, alwaysOn } : {}),
    });
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        showCloseButton={showClose}
        aria-describedby={undefined}
        className={`flex gap-5 max-h-[90vh] min-h-0 w-full flex-col overflow-hidden ${workspaceType === "always-on" ? "max-w-4xl sm:max-w-4xl lg:max-w-4xl" : "max-w-xl sm:max-w-xl"}`}
      >
        <DialogHeader className="flex-row items-center gap-2 pr-10">
          {workspaceType ? <Button variant="ghost" size="icon" aria-label={t("workspace.back_types")} disabled={submitting} onClick={() => setWorkspaceType(null)}><ArrowLeft className="size-4" /></Button> : null}
          <DialogTitle>{props.title ?? t("dashboard.create_workspace_title")}</DialogTitle>
        </DialogHeader>

          {workspaceType === null ? <div className="space-y-3">
            <WorkspaceOptionCard title={t("workspace.local")} description={t("workspace.local_description")} icon={FolderPlus} onClick={() => setWorkspaceType("local")} />
            <WorkspaceOptionCard title={t("workspace.always_on")} description={t("workspace.always_on_description")} icon={Clock} onClick={() => setWorkspaceType("always-on")} />
          </div> : <CreateWorkspaceLocalPanel
            workspaceType={workspaceType}
            alwaysOn={alwaysOn}
            onAlwaysOnChange={setAlwaysOn}
            alwaysOnValid={alwaysOnValid}
            disabled={Boolean(props.localDisabled)}
            disabledReason={props.localDisabledReason}
            selectedFolder={selectedFolder}
            hasSelectedFolder={hasSelectedFolder}
            pickingFolder={pickingFolder}
            onPickFolder={() => void handlePickFolder()}
            projectLabel={showProjectLabel ? projectLabel : ""}
            onProjectLabelInput={setProjectLabel}
            showProjectLabel={showProjectLabel}
            submitting={submitting}
            localError={localError}
            onClose={props.onClose}
            onSubmit={() => void handleLocalSubmit()}
            confirmLabel={props.confirmLabel}
            workerLabel={props.workerLabel}
            onConfirmWorker={props.onConfirmWorker}
            preset={preset}
            workerSubmitting={workerSubmitting}
            workerDisabled={workerDisabled}
            workerDisabledReason={workerDisabledReason}
            workerCtaLabel={props.workerCtaLabel}
            workerCtaDescription={props.workerCtaDescription}
            onWorkerCta={props.onWorkerCta}
            workerRetryLabel={props.workerRetryLabel}
            onWorkerRetry={props.onWorkerRetry}
            workerDebugLines={workerDebugLines}
            progress={progress}
            elapsedSeconds={elapsedSeconds}
            showProgressDetails={showProgressDetails}
            onToggleProgressDetails={() =>
              setShowProgressDetails((prev) => !prev)
            }
          />}

      </DialogContent>
    </Dialog>
  );
}

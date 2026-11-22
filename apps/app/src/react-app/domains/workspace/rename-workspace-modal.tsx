/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AlwaysOnSettings } from "@get3w/types/workspace";
import type { Get3wServerClient } from "../../../app/lib/get3w-server";
import { AlwaysOnWorkspaceFields } from "./always-on-workspace-fields";
import { t } from "../../../i18n";

export type RenameWorkspaceModalProps = {
  open: boolean;
  workspace?: { id: string; path: string; workspaceType?: string };
  client?: Pick<Get3wServerClient, "alwaysOnStatus" | "updateAlwaysOnSettings"> | null;
  title: string;
  busy: boolean;
  canSave: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onTitleChange: (value: string) => void;
};

export function RenameWorkspaceModal(props: RenameWorkspaceModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const alwaysOn = props.workspace?.workspaceType === "always-on";
  const [settings, setSettings] = useState<AlwaysOnSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const workspaceId = props.workspace?.id;
  useEffect(() => {
    let current = true;
    setSettings(null); setError(null); setSaving(false);
    setLoading(Boolean(props.open && alwaysOn));
    if (props.open && alwaysOn && workspaceId) {
      const load = async () => {
        try {
          if (!props.client) throw new Error(t("workspace.settings_unavailable"));
          const status = await props.client.alwaysOnStatus(workspaceId);
          if (current) setSettings(status.settings);
        } catch (error) { if (current) setError(error instanceof Error ? error.message : String(error)); }
        finally { if (current) setLoading(false); }
      };
      void load();
    }
    return () => { current = false; };
  }, [props.open, alwaysOn, workspaceId, props.client, retry]);
  const valid = !alwaysOn || Boolean(settings && settings.goal.trim() && Number.isInteger(settings.intervalMinutes) && settings.intervalMinutes >= 1 && settings.intervalMinutes <= 10080 && /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(settings.costLimit) && (!settings.costAuto || Number(settings.costLimit) > 0));
  const busy = props.busy || saving;
  const canSave = props.canSave && valid && !loading && !busy;
  async function save() {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      if (alwaysOn) {
        if (!props.client || !workspaceId || !settings) throw new Error(t("workspace.settings_unavailable"));
        await props.client.updateAlwaysOnSettings(workspaceId, settings);
      }
      await props.onSave();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className={`flex max-h-[90vh] flex-col overflow-hidden ${alwaysOn ? "max-w-4xl sm:max-w-4xl lg:max-w-4xl" : "sm:max-w-lg"}`} initialFocus={inputRef}>
        <DialogHeader>
          <DialogTitle>{t("workspace.modify_settings")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-x-hidden overflow-y-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">{t("workspace.kind")}<span>{t(alwaysOn ? "workspace.always_on" : "workspace.local")}</span></div>
        <div className={alwaysOn ? "grid gap-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : "space-y-5"}>
        <Field>
          <FieldLabel htmlFor="rename-workspace-title">{t("workspace.rename_label")}</FieldLabel>
          <Input
            ref={inputRef}
            id="rename-workspace-title"
            type="text"
            disabled={busy}
            value={props.title}
            onChange={(event) => props.onTitleChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === "Process") {
                return;
              }
              if (event.key !== "Enter") {
                return;
              }
              event.preventDefault();
              if (canSave) void save();
            }}
            placeholder={t("workspace.rename_placeholder")}
          />
        </Field>

        <div className="space-y-2"><span className="text-sm font-medium">{t("welcome.folder_title")}</span><p className="break-all text-sm text-muted-foreground">{props.workspace?.path}</p></div>
        </div>
        {alwaysOn && loading ? <div aria-busy="true" className="h-64 animate-pulse rounded-md bg-muted" /> : null}
        {alwaysOn && settings ? <AlwaysOnWorkspaceFields disabled={busy} value={settings} onChange={setSettings} /> : null}
        {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!settings ? <Button variant="outline" onClick={() => setRetry(value => value + 1)}>{t("common.retry")}</Button> : null}</div> : null}
        </div>
        <DialogFooter>
          <DialogClose
            disabled={busy}
            render={<Button variant="outline" type="button" disabled={busy} />}
          >
            {t("common.cancel")}
          </DialogClose>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

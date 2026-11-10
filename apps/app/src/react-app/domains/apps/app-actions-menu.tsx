import {t,useLocale} from "@/i18n";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Play, Sparkles, Trash2, Minus, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isLiveGeneratedApp } from "./live-generated-app-model";
import { useAppsClient, dashboardManagementReason } from "./use-apps";
import type { SavedAppDetail } from "@openwork/types/workflows";

export function getAppUpdatePrompt(app?: SavedAppDetail): string | undefined {
  if (!app?.canManage || (!isLiveGeneratedApp(app.view) && (!app.previewNotice || (app.html && app.payload && app.revision)))) return undefined;
  return `Update my existing saved app “${app.view.title}” (artifactViewId: ${app.view.id}, configObjectId: ${app.view.configObjectId}). Read its existing source with read_artifact_view before editing. Adapt the app to the latest workflow output for this configObjectId. Preserve the existing artifactViewId and configObjectId when saving the revised draft with save_artifact_view; do not recreate the app or workflow. Show a draft preview for me to review and explicitly choose Save. Do not autoactivate the draft or change the active revision without my explicit Save.`;
}

export function AppActionsMenu({ appId, title, canManage: appCanManage, canDelete, onDeleted, onRun, onEdit, onUpdate, onRemove, busy, onOpen, onRefresh, refreshing, badge }: {
  onOpen?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  badge?: ReactNode;
  appId: string;
  title: string;
  canManage: boolean;
  canDelete: boolean;
  onDeleted?: () => void;
  onRun?: () => void;
  onEdit?: () => void;
  onUpdate?: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const { client, scope, canManage: canAdmin } = useAppsClient();
  const canManage = canAdmin && appCanManage;
  const cache = useQueryClient();
  const deletion = useMutation({
    mutationFn: async () => {
      if (!canManage || !canDelete) throw new Error(dashboardManagementReason);
      if (!client) throw new Error("Sign in to delete this artifact.");
      await client.deleteApp(appId);
    },
    onSuccess: async () => {
      setOpen(false);
      onDeleted?.();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["saved-apps", ...scope] }),
        cache.invalidateQueries({ queryKey: ["app-preview", ...scope, appId] }),
      ]);
    },
  });
  const hasActions = Boolean(onOpen || onRefresh || onRun || (canManage && (onEdit || onUpdate || onRemove)));
  const showDelete = canManage && canDelete;
  if (!hasActions && !showDelete) return null;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cn("shrink-0 text-muted-foreground", onOpen && "bg-background/90")} aria-label={t("personal.artifacts.options_named",{name:title})} disabled={busy}><Ellipsis className="size-4" /></Button>} />
      <DropdownMenuContent align="end" className="w-64 min-w-0 max-w-[calc(100vw-2rem)]">
        {hasActions ? <DropdownMenuGroup>
          {badge ? <DropdownMenuLabel><span className="block">{title}</span>{badge}</DropdownMenuLabel> : null}
          {onOpen ? <DropdownMenuItem onClick={onOpen} aria-label={t("personal.artifacts.open_named",{name:title})}><ExternalLink />{t("personal.artifacts.open_artifact")}</DropdownMenuItem> : null}
          {onRefresh ? <DropdownMenuItem onClick={onRefresh} disabled={refreshing} aria-label={t("personal.artifacts.refresh_named",{name:title})}><RefreshCw />{t("personal.artifacts.refresh")}</DropdownMenuItem> : null}
          {onRun ? <DropdownMenuItem onClick={onRun}><Play />{t("personal.artifacts.run_again")}</DropdownMenuItem> : null}
          {canManage && onEdit ? <DropdownMenuItem onClick={onEdit}><Sparkles />{t("personal.artifacts.ask_for_changes")}</DropdownMenuItem> : null}
          {canManage && onUpdate ? <DropdownMenuItem onClick={onUpdate} disabled={busy}><Sparkles />{t("personal.artifacts.update_artifact")}</DropdownMenuItem> : null}
          {canManage && onRemove ? <DropdownMenuItem onClick={onRemove} aria-label={t("personal.artifacts.remove_named",{name:title})}><Minus />{t("personal.artifacts.remove_from_dashboard")}</DropdownMenuItem> : null}
        </DropdownMenuGroup> : null}
        {hasActions && showDelete ? <DropdownMenuSeparator /> : null}
        {showDelete ? <DropdownMenuGroup><DropdownMenuItem variant="destructive" aria-label={t("personal.artifacts.delete_named",{name:title})} onClick={() => { deletion.reset(); setOpen(true); }}><Trash2 />{t("personal.artifacts.delete_artifact")}</DropdownMenuItem></DropdownMenuGroup> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={showDelete && open} onOpenChange={(next) => { if (!deletion.isPending) setOpen(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("personal.artifacts.delete_named",{name:title})}</DialogTitle>
          <DialogDescription>{t("personal.artifacts.this_removes_the_saved_artifact_from_your_dashboard_and_artifact_list_past_results_stay_av")}</DialogDescription>
        </DialogHeader>
        {deletion.error ? <p role="alert" className="text-sm text-destructive">{deletion.error.message}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={deletion.isPending} onClick={() => setOpen(false)}>{t("personal.artifacts.cancel")}</Button>
          <Button variant="destructive" disabled={deletion.isPending} onClick={() => deletion.mutate()}>{deletion.isPending ? t("personal.artifacts.deleting") : t("personal.artifacts.delete_artifact")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

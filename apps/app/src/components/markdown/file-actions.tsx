import { useState } from "react";
import { ArtifactIcon } from "@/react-app/domains/session/artifacts/artifact-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useOpenTargets } from "@/lib/target-provider";
import { isMacPlatform } from "@/app/utils";
import { openTargetForHref, resolveCollectibleOpenTarget } from "@/react-app/domains/session/artifacts/resolve-open-target";

export function FileActions({ href }: { href: string }) {
  const { client, workspaceId, workspaceRoot, sessionId, openTargets, onOpenTarget, isLocalWorkspace } = useOpenTargets();
  const [downloading, setDownloading] = useState(false);
  const target = openTargetForHref(href, openTargets, workspaceRoot);
  const open = () => { if (target) onOpenTarget?.(target); };
  const download = async () => {
    if (!client || !workspaceId || !target || downloading) return;
    setDownloading(true);
    try {
      const resolved = await resolveCollectibleOpenTarget(client, workspaceId, target, sessionId);
      if (!resolved) throw new Error("File unavailable");
      const result = await client.downloadWorkspaceFile(workspaceId, resolved.value, { sessionId, fileScope: resolved.fileScope });
      const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = resolved.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("chat.file_download_failed"));
    } finally {
      setDownloading(false);
    }
  };
  return <span data-get3w-file-card="" className="my-2 flex w-fit max-w-full flex-col items-start gap-1.5" title={target?.value ?? href}>
    <Button
      size="sm"
      variant="ghost"
      className="h-auto max-w-full justify-start gap-2 whitespace-normal px-0 py-1 text-left"
      disabled={!target || !onOpenTarget}
      onClick={open}
    >
      <ArtifactIcon type={target?.preview ?? "text"} className="size-6" />
      <span className="min-w-0 break-all font-medium text-foreground">{target?.name ?? href}</span>
    </Button>
    <span data-get3w-file-card-actions="" className="flex max-w-full flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" disabled={!target || !onOpenTarget} onClick={open}>{t("session.open")}</Button>
    <Button size="sm" variant="outline" disabled={!client || !workspaceId || !target || downloading} onClick={() => void download()}>{t("chat.file_download")}</Button>
    <Button size="sm" variant="outline" disabled={!isLocalWorkspace || !onOpenTarget || !target} title={!isLocalWorkspace ? t("chat.file_reveal_local_only") : undefined} onClick={() => { if (target) onOpenTarget?.(target, { external: true, reveal: true }); }}>{isMacPlatform() ? t("ui.cc849385646b") : t("ui.da478765741e")}</Button>
    </span>
  </span>;
}

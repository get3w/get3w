import { useState } from "react";
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
  return <span className="inline-flex flex-wrap items-center gap-2 align-middle" title={target?.name}>
    <Button size="sm" variant="outline" disabled={!client || !workspaceId || !target || downloading} onClick={() => void download()}>{t("chat.file_download")}</Button>
    <Button size="sm" variant="outline" disabled={!isLocalWorkspace || !onOpenTarget || !target} title={!isLocalWorkspace ? t("chat.file_reveal_local_only") : undefined} onClick={() => { if (target) onOpenTarget?.(target, { external: true, reveal: true }); }}>{isMacPlatform() ? t("ui.cc849385646b") : t("ui.da478765741e")}</Button>
  </span>;
}

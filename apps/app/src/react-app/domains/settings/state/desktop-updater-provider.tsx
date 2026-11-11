/** @jsxImportSource react */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { t } from "../../../../i18n";
import { useLocal } from "../../../kernel/local-provider";
import { useDesktopConfig } from "../../cloud/desktop-config-provider";
import { notifyAlert } from "../../../shell/notifications";
import { useElectronUpdaterState } from "./electron-updater-state";

function useUpdatePreference(key: string) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(key) !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, enabled ? "1" : "0"); } catch { /* Keep the session preference. */ }
  }, [enabled, key]);
  return [enabled, setEnabled] as const;
}

function useUpdater() {
  const local = useLocal();
  const desktopConfig = useDesktopConfig();
  // This provider mounts above the enterprise activation gate. Before activation
  // no Den is known, and until the desktop config has resolved once (or failed
  // and fallen back to the last known one) the organization's allowed desktop
  // versions cannot be honoured, so no update check (and therefore no
  // download) may run yet.
  const allowedVersionsKnown = !desktopConfig.loading;
  const [updateAutoCheck, setUpdateAutoCheck] = useUpdatePreference("openwork.react.settings.update-auto-check");
  // Older Settings wrote "0" even when the user never touched the old opt-in.
  // Start the automatic-download default once, then retain future opt-outs.
  const [updateAutoDownload, setUpdateAutoDownload] = useUpdatePreference("openwork.react.settings.update-auto-download.v2");
  const onReleaseChannelChange = useCallback((next: "stable" | "alpha") => {
    local.setPrefs((previous) => ({ ...previous, releaseChannel: next }));
  }, [local.setPrefs]);
  const setError = useCallback((message: string | null) => {
    if (message) notifyAlert({
      kind: "update", title: t("notifications.updater_error"), body: message, dedupeKey: "updater-error",
    });
  }, []);
  const updater = useElectronUpdaterState({
    releaseChannel: local.prefs.releaseChannel ?? "stable",
    onReleaseChannelChange,
    updateAutoCheck,
    updateAutoDownload,
    allowedVersionsKnown,
    desktopConfig: desktopConfig.config,
    refreshDesktopConfig: desktopConfig.refreshFresh,
    setError,
  });
  return { ...updater, updateAutoCheck, setUpdateAutoCheck, updateAutoDownload, setUpdateAutoDownload };
}

const DesktopUpdaterContext = createContext<ReturnType<typeof useUpdater> | null>(null);

export function useDesktopUpdater() {
  const updater = useContext(DesktopUpdaterContext);
  if (!updater) throw new Error(t("ui.034606cb2eb1"));
  return updater;
}

export function DesktopUpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  return <DesktopUpdaterContext.Provider value={updater}>{children}</DesktopUpdaterContext.Provider>;
}

export function DesktopUpdateButton() {
  const updater = useContext(DesktopUpdaterContext);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const status = updater?.updateStatus;
  if (!updater || !status || !["available", "downloading", "ready", "error"].includes(status.state)) return null;
  if (updater.updateEnv?.supported === false) return null;
  const downloading = status.state === "downloading";
  const label = downloading
    ? t("settings.update_downloading")
    : status.state === "error" ? t("updates.retry") : t("updates.available");
  const progress = status.totalBytes && status.downloadedBytes != null
    ? ` ${Math.min(100, Math.floor(status.downloadedBytes / status.totalBytes * 100))}%` : "";
  const title = `${label}${downloading ? progress : ""}`;
  const update = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await updater.updateAndRestart(); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Tooltip>
    <TooltipTrigger render={
      <Button
        variant="ghost"
        size="icon-sm"
        data-update-button
        aria-label={title}
        aria-busy={busy || downloading}
        disabled={busy || downloading}
        onClick={() => void update()}
        className="mac:titlebar-no-drag shrink-0 rounded-full bg-blue-9 text-primary-foreground hover:bg-blue-10 hover:text-primary-foreground disabled:opacity-70"
      >
        {busy || downloading
          ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
          : <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />}
      </Button>
    } />
    <TooltipContent side="top">{title}</TooltipContent>
  </Tooltip>;
}

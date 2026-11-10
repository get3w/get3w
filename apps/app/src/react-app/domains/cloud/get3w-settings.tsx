import { t } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocal } from "../../kernel/local-provider";
import { pickSyncedPreferences, validateSettingsDocument, settingsErrorMessage, type SettingsDocument } from "./get3w-settings-policy";

export function Get3wSettings({ userId }: { userId: string }) {
  const { prefs, setPrefs } = useLocal();
  const [document, setDocument] = useState<SettingsDocument | null>(null);
  const [message, setMessage] = useState(t("ui.dc0fdaa402a8"));
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const latestPrefs = useRef(prefs); latestPrefs.current = prefs;
  useEffect(() => {
    generation.current++;
    setDocument(null); setMessage(t("ui.dc0fdaa402a8")); setBusy(false);
    return () => { generation.current++; };
  }, [userId, setPrefs]);
  async function transfer(save: boolean) {
    const bridge = window.__GET3W_ACCOUNT__;
    if (!bridge || (save && !document)) return;
    const epoch = generation.current;
    const captured = latestPrefs.current;
    setBusy(true);
    try {
      const preferences = pickSyncedPreferences(captured);
      const response = await bridge.settings({userId, ...(save && document ? {value:{schema_version:1,revision:document.revision,preferences}} : {})});
      if (generation.current !== epoch) return;
      const next = validateSettingsDocument(response);
      setDocument(next); setMessage(save ? t("ui.32e021ecdf19") : next.preferences ? t("ui.cf48b1389bb1") : t("ui.eafec847034f"));
    } catch (error) {
      if (generation.current === epoch) setMessage(settingsErrorMessage(error));
    } finally { if (generation.current === epoch) setBusy(false); }
  }
  function apply() {
    if (!document?.preferences) return;
    const value = pickSyncedPreferences(document.preferences);
    setPrefs(previous => ({...previous,...value}));
    setMessage(t("ui.f593dabbdda4"));
  }
  return <div className="space-y-3 border-t pt-3">
    <p className="text-sm" role="status">{message}</p>
    <p className="text-xs text-muted-foreground">{t("ui.864bd783f0fa")}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void transfer(false)}>{t("ui.e60bb08f0da8")}</Button>
      {document ? <Button disabled={busy} onClick={() => void transfer(true)}>{t("ui.e8e3f120604f")}</Button> : null}
      {document?.preferences ? <Button variant="outline" disabled={busy} onClick={apply}>{t("ui.5ae997d1a42d")}</Button> : null}
    </div>
  </div>;
}

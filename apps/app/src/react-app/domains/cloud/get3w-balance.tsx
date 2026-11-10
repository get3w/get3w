import { formatMoney } from "@/i18n/money";
import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { settingsErrorMessage } from "./get3w-settings-policy";

export type BalanceSnapshot = { balance: { amount: string; currency: string } | null };

export function Get3wBalance({ userId }: { userId: string }) {
  useLocale();
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function reload() {
    const bridge = window.__GET3W_ACCOUNT__;
    if (!bridge) return;
    setBusy(true); setError(null);
    try {
      const next = await bridge.balance({ userId });
      if (active.current) setSnapshot(next);
    } catch (failure) {
      if (active.current) { setSnapshot(null); setError(settingsErrorMessage(failure)); }
    } finally { if (active.current) setBusy(false); }
  }
  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{t("ui.c79d64ce1d5b")}</span>
      <Button variant="outline" disabled={busy} onClick={() => void reload()}>{t("ui.8ac7e2ead450")}</Button>
    </div>
    <p className="text-sm text-muted-foreground" role="status">
      {error ?? (snapshot ? snapshot.balance ? formatMoney(snapshot.balance.amount,snapshot.balance.currency) : t("ui.a82c86625ac7") : t("ui.b359c4259016"))}
    </p>
  </div>;
}

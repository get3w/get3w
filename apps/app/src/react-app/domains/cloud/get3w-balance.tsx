import { openDesktopUrlWithStatus } from "@/app/lib/desktop";
import { ExternalLink } from "lucide-react";
import { formatAccountBalance } from "@/i18n/money";
import { t, useLocale } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { settingsErrorMessage } from "./get3w-settings-policy";

export type BalanceSnapshot = { balance: { amount: string; currency: string } | null };

export function Get3wBalance({ userId }: { userId: string }) {
  return <AccountBalance key={userId} userId={userId} />;
}

function AccountBalance({ userId }: { userId: string }) {
  useLocale();
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    const bridge = window.__GET3W_ACCOUNT__;
    if (!bridge) { setBusy(false); return; }
    setBusy(true); setError(null);
    try {
      const next = await bridge.balance({ userId });
      if (request === generation.current) setSnapshot(next);
    } catch (failure) {
      if (request === generation.current) { setSnapshot(null); setError(settingsErrorMessage(failure)); }
    } finally { if (request === generation.current) setBusy(false); }
  }, [userId]);
  useEffect(() => {
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      generation.current++;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);
  return <div className="space-y-2 border-t pt-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{t("ui.c79d64ce1d5b")}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void reload()}>{t("ui.8ac7e2ead450")}</Button>
        <Button variant="outline" onClick={() => {
          void openDesktopUrlWithStatus("https://get3w.com/top-up").catch(() => setError(t("ui.4c468a5e8fa3")));
        }}>{t("personal.account.top_up")}<ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-4 text-muted-foreground" /></Button>
      </div>
    </div>
    <div className="min-h-5 text-sm text-muted-foreground" role="status" aria-busy={busy}>
      {busy && !snapshot && !error ? <Skeleton className="h-5 w-24" /> : <span>
      {error ?? (snapshot ? snapshot.balance ? formatAccountBalance(snapshot.balance.amount,snapshot.balance.currency) : t("ui.a82c86625ac7") : t("ui.b359c4259016"))}
      </span>}
    </div>
  </div>;
}

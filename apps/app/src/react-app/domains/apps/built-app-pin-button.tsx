import { t } from "@/i18n";
import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuiltDashboardApps } from "../dashboard/built-dashboard-apps";

export function BuiltAppPinButton({ appId }: { appId: string }) {
  const built = useBuiltDashboardApps();
  const pinned = built.ids.includes(appId);
  const available = built.ready && built.apps.some(app => app.connectionId === appId);
  const reason = !built.identityVerified
    ? t("desktop.text.6a059055e58d")
    : built.query.isError
      ? t("desktop.text.74f018beabb7")
      : !built.query.isSuccess
        ? t("desktop.text.7c0e50b7853d")
        : !available
          ? t("desktop.text.62eaefb09ad9")
          : undefined;
  const Icon = pinned ? PinOff : Pin;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={pinned}
      disabled={!available}
      title={reason}
      onClick={() => {
        if (!available) return;
        built.setAdded(appId, !pinned);
      }}
    >
      <Icon className="size-4" />
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}

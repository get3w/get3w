import { t } from "@/i18n";
import { Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessageList } from "@/components/chat/message-list-provider";
import { useUiStateStore } from "@/react-app/shell/ui-state-store";
import { usePanelTabStore } from "../session/panel/panel-tab-store";
import { type AppReference } from "./app-artifact";

export function AppChatArtifact({ appId, revisionId, receiptId, title }: AppReference & { title: string }) {
  const { sessionId } = useMessageList();
  const open = () => {
    usePanelTabStore.getState().openTab(sessionId, {
      type: "app", id: `app:${appId}:${revisionId}:${receiptId ?? "latest"}`, label: title, appId, revisionId, receiptId,
    });
    useUiStateStore.getState().setSidePanelState(sessionId, "panel");
  };
  return <div className="mt-3 overflow-hidden rounded-xl border">
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2"><span className="flex items-center gap-2 text-sm"><Blocks className="size-4" />{title}</span><Button size="sm" variant="ghost" onClick={open}>{t("ui.f7afe3dde18c")}</Button></div>
    <p className="px-3 py-3 text-sm text-muted-foreground">{t("ui.0fec6d452935")}</p>
  </div>;
}

import { t } from "@/i18n";
import { X } from "lucide-react";
import type { ModelRef } from "@/app/types";
import { Button } from "@/components/ui/button";
import { modelTitle } from "@/react-app/domains/models/model-catalog";
import { modelRecoveryChatKey, useModelRecoveryStore } from "../model-recovery-store";

export function ModelRecoveryNote(props: {
  scope?: string;
  sessionId?: string;
  selectedModel: ModelRef;
  onChange: () => void;
  onSwitchBack: (model: ModelRef) => void;
}) {
  const chatKey = modelRecoveryChatKey(props.scope ?? "", props.sessionId);
  const recovery = useModelRecoveryStore((state) => state.byChat[chatKey]);
  if (!props.scope || !recovery || recovery.dismissed
    || recovery.replacement.providerID !== props.selectedModel.providerID
    || recovery.replacement.modelID !== props.selectedModel.modelID) return null;
  return (
    <div data-testid="model-recovery-note" role="status" className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <span>{modelTitle(recovery.previous)} {recovery.returned ? t("ui.79ac903f9431") : t("ui.8316990f93a3")} {t("ui.2073e5567baf")} {modelTitle(recovery.replacement)} ·</span>
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={props.onChange}>{t("ui.c0bf75bd78bf")}</Button>
      {recovery.returned ? <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => {
        props.onSwitchBack(recovery.previous);
        useModelRecoveryStore.getState().clear(chatKey);
      }}>{t("ui.fe080e0fb7e6")}</Button> : null}
      <Button variant="ghost" size="icon" className="ml-auto size-6" aria-label={t("ui.c0a04c7f28cc")} onClick={() => useModelRecoveryStore.getState().dismiss(chatKey)}>
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

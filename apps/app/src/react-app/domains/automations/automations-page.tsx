/** @jsxImportSource react */
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { t } from "@/i18n";
import type { AutomationProviderCatalog } from "./automation-model-options";

/** Scheduled automation requires a separately implemented personal scheduler. */
export function AutomationsPage(_props: {
  providerCatalog?: AutomationProviderCatalog;
  workspaceId?: string | null;
  headerActionsTarget?: HTMLDivElement | null;
  onSignIn: () => void;
}) {
  return <Empty><EmptyHeader><EmptyTitle>{t("automation_ui.personal_unavailable")}</EmptyTitle></EmptyHeader></Empty>;
}

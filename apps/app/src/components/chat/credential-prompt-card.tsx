import type { DynamicToolUIPart } from "ai";
import { t } from "@/i18n";
/** Historical organization key requests never collect credentials in this edition. */
export function CredentialPromptCard(_props: { part: DynamicToolUIPart; continueToolCallId?: string }) {
 return <p role="status" data-testid="credential-prompt-card">{t("extensions.cloud_unavailable")}</p>;
}

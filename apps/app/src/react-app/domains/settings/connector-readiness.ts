import { t, currentLocale } from "@/i18n";
import type { DenExternalMcpConnection } from "../../../app/lib/den";
import { providerSetupProblem } from "../connections/connection-sign-in-problem";

export type RecordedConnectorState = "Set up" | "Change setting" | "Sign in" | "Checking…" | "Ready" | "Couldn't verify" | "Not checked";

export type RecordedConnectorView = {
  checking?: boolean;
};

type Readiness = NonNullable<DenExternalMcpConnection["readiness"]>;

function signInFailure(readiness: Readiness | null | undefined) {
  return readiness?.status === "could_not_verify" && (readiness.failure === "sign_in_rejected" || readiness.failure === "sign_in_required");
}

/**
 * Mirrors Den web's connector-readiness: never checked is "Not checked", only
 * a recorded check that did not pass is "Couldn't verify", and only a
 * rejected or missing sign-in asks someone to sign in.
 */
export function recordedConnectorState(connection: DenExternalMcpConnection, view: RecordedConnectorView = {}): RecordedConnectorState | null {
  const readiness = connection.readiness;
  if (readiness === undefined) return null;
  if (connection.setupRequired || connection.issuerReviewRequired || (connection.credentialMode === "shared" && !connection.connected)) return "Set up";
  // Signing in again cannot work until the setting changes, so this wins over needsReconnect.
  if (providerSetupProblem(connection)) return "Change setting";
  if (connection.needsReconnect) return "Sign in";
  if (view.checking) return "Checking\u2026";
  if (readiness?.status === "ready") return "Ready";
  if (signInFailure(readiness)) return "Sign in";
  if (connection.credentialMode === "per_member" && !connection.connectedForMe) return "Sign in";
  return readiness ? "Couldn't verify" : "Not checked";
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(currentLocale() === "zh" ? "zh-CN" : "en-US", { dateStyle: "short", timeStyle: "short" });
}

export function recordedConnectorNote(connection: DenExternalMcpConnection, view: RecordedConnectorView = {}) {
  const state = recordedConnectorState(connection, view);
  const readiness = connection.readiness;
  if (state === "Change setting") return providerSetupProblem(connection)?.reason ?? "";
  if (state === "Checking…") return t("connector.checking_note");
  if (state === "Not checked") return t("connector.not_checked_note");
  if (state === "Ready" && readiness) return t("connector.checked_at", { time: formatTime(readiness.checkedAt) });
  if ((state === "Couldn't verify" || (state === "Sign in" && signInFailure(readiness))) && readiness) {
    const reason = readiness.reason ?? "The last check didn't pass.";
    return readiness.lastSuccessfulAt ? t("connector.last_ready", { reason, time: formatTime(readiness.lastSuccessfulAt) }) : reason;
  }
  if (state === "Sign in") return connection.credentialMode === "per_member" ? t("connector.sign_in_note") : t("connector.admin_reconnect_note");
  if (state === "Set up") return t("connector.admin_setup_note");
  return "";
}

/** Localize only the label; RecordedConnectorState remains stable for decisions. */
export function recordedConnectorLabel(state: RecordedConnectorState): string {
  const keys: Record<RecordedConnectorState, string> = {
    "Set up": "ui.4da10f1fbb17", "Change setting": "connector.change_setting", "Sign in": "ui.bfd402b2f6f3",
    "Checking…": "ui.ec963ffc911b", "Ready": "boot.ready", "Couldn't verify": "ui.2377a2b3f288", "Not checked": "ui.d16948e73a68",
  };
  return t(keys[state]);
}

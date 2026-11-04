import type { SessionCloudMcpMaintenanceState } from "./use-session-mcp-maintenance";
import { t } from "@/i18n";

export type OpenWorkConnectStateStatus = "available" | "missing" | "invalid" | "unreadable";

export type OpenWorkConnectStateSummary = {
  status: "ready" | "not_configured" | "disabled" | "unavailable";
  statusLabel: string;
  tone: "ready" | "neutral" | "error";
  stageLabel: string;
  recommendedAction: string;
};

export function resolveOpenWorkConnectStateSummary(
  status: OpenWorkConnectStateStatus,
  connectEnabled: boolean,
): OpenWorkConnectStateSummary {
  if (status === "missing") {
    return {
      status: "not_configured",
      statusLabel: t("connect.state_not_configured_label"),
      tone: "neutral",
      stageLabel: t("connect.state_not_configured_stage"),
      recommendedAction: t("connect.state_not_configured_action"),
    };
  }
  if (status === "invalid" || status === "unreadable") {
    return {
      status: "unavailable",
      statusLabel: t("connect.state_unavailable_label"),
      tone: "error",
      stageLabel: t("connect.state_unavailable_stage"),
      recommendedAction: t("connect.state_unavailable_action"),
    };
  }
  if (!connectEnabled) {
    return {
      status: "disabled",
      statusLabel: t("connect.state_disabled_label"),
      tone: "neutral",
      stageLabel: t("connect.state_disabled_stage"),
      recommendedAction: t("connect.state_disabled_action"),
    };
  }
  return {
    status: "ready",
    statusLabel: t("connect.state_ready_label"),
    tone: "ready",
    stageLabel: t("connect.state_ready_stage"),
    recommendedAction: t("connect.state_ready_action"),
  };
}

export type OpenWorkConnectStatus = {
  state: "checking" | "ready" | "needs_attention";
  label: string;
  description: string;
};

export function openWorkConnectAttentionTitle(description: string): string {
  return `One possible issue: ${description}`;
}

export function resolveOpenWorkConnectStatus(
  signedIn: boolean,
  maintenance: SessionCloudMcpMaintenanceState | undefined,
): OpenWorkConnectStatus | null {
  if (!signedIn) return null;

  // Den authentication is ready, but maintenance itself is workspace-scoped.
  // When there is no active workspace, report the verified Cloud connection
  // without claiming that connected-service delivery was checked.
  if (!maintenance || maintenance.status === "idle") {
    return {
      state: "ready",
      get label() { return t("ui.5fa7aac5375c"); },
      get description() { return t("ui.93911da93543"); },
    };
  }

  if (maintenance.status === "ready") {
    return {
      state: "ready",
      get label() { return t("ui.5fa7aac5375c"); },
      get description() { return t("ui.d012bb3e6303"); },
    };
  }

  if (maintenance.status === "failed" || maintenance.status === "skipped") {
    return {
      state: "needs_attention",
      get label() { return t("ui.c1ebc7817870"); },
      description: maintenance.issue?.message
        ?? "Get3W Connect could not verify connected service tools. Run diagnostics for details.",
    };
  }

  return {
    state: "checking",
    get label() { return t("ui.0dfe1d63c9d8"); },
    description: maintenance.status === "retrying"
      ? `Restoring connected service tools (${maintenance.attempt}/${maintenance.maxAttempts}).`
      : "Checking connected service tools in the background.",
  };
}

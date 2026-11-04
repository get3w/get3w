import { t } from "@/i18n";
export const ADVANCED_SETTINGS_SECTIONS = [
  { id: "organization-server", get title() { return t("settings_ui.73ceb49ce6df"); }, keywords: ["den", "control plane", "server url", "reset server"] },
  { id: "runtime", get title() { return t("settings_ui.109311589787"); }, keywords: ["opencode engine", "openwork server", "connection status"] },
  { id: "agent-access", get title() { return t("settings_ui.b4cbe7cce71d"); }, keywords: ["cloud mcp", "health", "tools", "connections"] },
  { id: "config-sources", get title() { return t("settings_ui.88d5b2e2dbc6"); }, keywords: ["runtime db", "injected config", "project config", "global config"] },
  { id: "experimental-engine", get title() { return t("settings_ui.a6eafffb41d3"); }, keywords: ["engine v2", "chat engine", "preview"] },
  { id: "workspace-run-mode", get title() { return t("settings_ui.43c8dc900465"); }, keywords: ["approvals", "permissions", "keep going", "feature flag"] },
  { id: "developer", get title() { return t("settings_ui.3fb7b39416f1"); }, keywords: ["developer mode", "debug", "deep link"] },
];

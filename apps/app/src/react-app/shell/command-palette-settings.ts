import { t } from "@/i18n";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import type { PlatformCapabilities } from "@/app/lib/platform-capabilities";
import { isSettingsTabAllowed, type DesktopAppRestrictionChecker } from "@/app/cloud/desktop-app-restrictions";
import type { SettingsTab } from "@/app/types";
import {
  CLOUD_SETTINGS_TABS,
  getGlobalSettingsTabs,
  getSettingsTabDescription,
  getSettingsTabLabel,
  getWorkspaceSettingsTabs,
} from "@/react-app/domains/settings/shell/settings-page";

import { ADVANCED_SETTINGS_SECTIONS } from "@/react-app/domains/settings/advanced-sections";

import type { PaletteItem } from "./command-palette-search";

const SETTINGS_KEYWORDS: Partial<Record<SettingsTab, string[]>> = {
  ai: ["provider", "providers", "api key", "anthropic", "openai", "openrouter", "google", "gemini", "claude", "gpt", "connect model", "models"],
  preferences: ["default model", "reasoning", "thinking", "compaction", "effort"],
  permissions: ["authorized folders", "folder access", "file access", "allow", "permission denied", "sandbox", "approvals"],
  extensions: ["library", "skills", "plugins", "mcp", "connections", "tools", "apps"],
  environment: ["env", "environment variables", "secrets", "tokens", "api keys"],
  advanced: ["advanced settings", "runtime", "developer", "connection", "server", "port", "reset", "fix", "repair", "clean up", "troubleshoot", "recovery"],
  shortcuts: ["shortcut", "shortcuts", "keyboard", "keys", "hotkey", "keybinding", "switch model", "fast"],
  appearance: ["theme", "dark mode", "light mode", "color", "font", "look"],
  updates: ["version", "upgrade", "check for updates", "release"],
  debug: ["logs", "diagnostics", "developer mode"],
  usage: ["usage", "limit", "spend", "budget", "quota", "increase"],
  "cloud-account": ["sign in", "log in", "login", "account", "organization", "org", "den", "cloud", "openwork cloud"],
  general: ["settings", "preferences", "options", "configure"],
};

const LIBRARY_SECTIONS = [
  { slug: "skills", get title() { return t("ui.66d0f523a379"); }, get detail() { return t("ui.4ed98f5b0f0b"); }, keywords: ["skill", "instructions", "workflows"] },
  { slug: "mcps", get title() { return t("ui.22a7559f09bf"); }, get detail() { return t("ui.45ee9d23d659"); }, keywords: ["mcp", "servers", "tools"] },
  { slug: "connections", get title() { return t("ui.dc273117482b"); }, get detail() { return t("ui.1cb4eca6be76"); }, keywords: ["apps", "services", "sign in"] },
  { slug: "plugins", get title() { return t("ui.9514b7ff4860"); }, get detail() { return t("ui.c8fd46046586"); }, keywords: ["extensions", "tools", "hooks"] },
  { slug: "agents", get title() { return t("ui.279b44d2ab4b"); }, get detail() { return t("ui.0a8330a295d2"); }, keywords: ["agent", "assistants", "modes"] },
  { slug: "commands", get title() { return t("ui.b269dc4e81a5"); }, get detail() { return t("ui.4a4c177b0aca"); }, keywords: ["command", "slash", "prompts"] },
] satisfies Array<{ slug: string; title: string; detail: string; keywords: string[] }>;

export function buildCommandPaletteSettingsItems(input: {
  developerMode: boolean;
  capabilities: Pick<PlatformCapabilities, "autoUpdate">;
  /** Desktop policy checker; when `allowControlSettings` is blocked only the Cloud tabs remain. */
  checkRestriction?: DesktopAppRestrictionChecker;
  onOpenSettings: (route: string) => void;
  onOpenExtensions: (section?: string) => void;
}): PaletteItem[] {
  const checkRestriction = input.checkRestriction ?? (() => false);
  const tabs = ([
    "general",
    ...getWorkspaceSettingsTabs(),
    ...getGlobalSettingsTabs(input.developerMode, input.capabilities),
    ...CLOUD_SETTINGS_TABS,
  ] satisfies SettingsTab[]).filter((tab) => isSettingsTabAllowed({ tab, checkRestriction }));

  const tabItems = tabs.map((tab): PaletteItem => ({
    id: `settings:${tab}`,
    title: tab === "advanced" ? t("ui.7b0bd218a84e") : getSettingsTabLabel(tab),
    detail: getSettingsTabDescription(tab),
    keywords: SETTINGS_KEYWORDS[tab],
    breadcrumb: t("ui.74a883a037bc"),
    group: "settings",
    action: () => {
      if (tab === "extensions") {
        input.onOpenExtensions();
        return;
      }
      input.onOpenSettings(`/settings/${tab}`);
    },
  }));

  const libraryItems = LIBRARY_SECTIONS.map((section): PaletteItem => ({
    id: `settings:extensions/${section.slug}`,
    title: section.title,
    detail: section.detail,
    keywords: section.keywords,
    breadcrumb: "Settings › Library",
    group: "settings",
    action: () => input.onOpenExtensions(section.slug),
  }));

  const advancedItems: PaletteItem[] = tabs.includes("advanced")
    ? ADVANCED_SETTINGS_SECTIONS.filter((section) => section.id !== "experimental-engine" || isDesktopRuntime()).map((section) => ({
        id: `settings:advanced/${section.id}`,
        title: section.title,
        keywords: section.keywords,
        breadcrumb: "Settings › Advanced",
        group: "settings",
        action: () => input.onOpenSettings(`/settings/advanced/${section.id}`),
      }))
    : [];

  return input.developerMode
    ? [...advancedItems, ...tabItems, ...libraryItems]
    : [...tabItems, ...advancedItems, ...libraryItems];
}

import { t } from "@/i18n";
export type SyncedPreferences = {
  showThinking: boolean;
  desktopNotifications: "off" | "important" | "all";
  linkOpenDestination: "openwork" | "external";
  keepAwake: boolean;
};
export type SettingsDocument = { schema_version: 1; revision: number; preferences: SyncedPreferences | null };
export function pickSyncedPreferences(value: SyncedPreferences): SyncedPreferences {
  return { showThinking: value.showThinking, desktopNotifications: value.desktopNotifications,
    linkOpenDestination: value.linkOpenDestination, keepAwake: value.keepAwake };
}
export function validateSettingsDocument(value: SettingsDocument): SettingsDocument {
  const prefs = value?.preferences;
  if (value?.schema_version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    (prefs !== null && (!prefs || typeof prefs.showThinking !== "boolean" || typeof prefs.keepAwake !== "boolean" ||
      !["off","important","all"].includes(prefs.desktopNotifications) || !["openwork","external"].includes(prefs.linkOpenDestination)))) {
    throw new Error(t("ui.bfdec47e381d"));
  }
  // Never spread remote properties into device settings, even from a newer API.
  return {schema_version:1, revision:value.revision, preferences:prefs ? pickSyncedPreferences(prefs) : null};
}
export function settingsErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : t("ui.82598b92e052");
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

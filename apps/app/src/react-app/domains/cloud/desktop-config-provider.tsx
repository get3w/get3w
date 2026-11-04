import { createContext, use, type ReactNode } from "react";
import { t } from "@/i18n";
import { checkDesktopAppRestriction, type DesktopAppRestrictionChecker } from "@/app/cloud/desktop-app-restrictions";
import type { DenDesktopConfig } from "@/app/lib/den";

export type DesktopConfigStore = {
  config: DenDesktopConfig;
  loading: boolean;
  freshConfigStatus: "pending" | "ready" | "failed";
  refresh: () => Promise<void>;
  refreshFresh: () => Promise<DenDesktopConfig>;
  checkRestriction: DesktopAppRestrictionChecker;
  connectPolicySync: { state: "idle" };
};

// The personal Desktop has no organization policy source. Do not import cached
// Den policy, poll a control plane, or mutate local runtime settings on mount.
const localConfig: DenDesktopConfig = Object.freeze({});
const localStore: DesktopConfigStore = Object.freeze<DesktopConfigStore>({
  config: localConfig,
  loading: false,
  freshConfigStatus: "ready",
  refresh: async () => {},
  refreshFresh: async () => localConfig,
  checkRestriction: ({ restriction }) => checkDesktopAppRestriction({ config: localConfig, restriction }),
  connectPolicySync: { state: "idle" },
});
const DesktopConfigContext = createContext<DesktopConfigStore | undefined>(undefined);

export function DesktopConfigProvider({ children }: { children: ReactNode }) {
  return <DesktopConfigContext.Provider value={localStore}>{children}</DesktopConfigContext.Provider>;
}
export function useDesktopConfig(): DesktopConfigStore {
  const context = use(DesktopConfigContext);
  if (!context) throw new Error(t("ui.d7e750fa9464"));
  return context;
}
export function useOrgRestrictions(): DenDesktopConfig {
  return useDesktopConfig().config;
}
export function useCheckDesktopRestriction(): DesktopAppRestrictionChecker {
  return useDesktopConfig().checkRestriction;
}
export function useDesktopRestriction(restriction: Parameters<DesktopAppRestrictionChecker>[0]["restriction"]): boolean {
  return useDesktopConfig().checkRestriction({ restriction });
}

/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import { isWebDeployment } from "@/app/lib/openwork-deployment";
import { hydrateOpenworkServerSettingsFromEnv } from "@/app/lib/openwork-server";
import { isDesktopRuntime } from "@/app/utils";
import { DenAuthProvider } from "@/react-app/domains/cloud/den-auth-provider";
import { GlobalQueueDrainerBridge } from "@/react-app/domains/session/sync/global-queue-drainer-bridge";
import { BrandThemeProvider } from "@/react-app/domains/cloud/brand-theme";
import { DesktopConfigProvider } from "@/react-app/domains/cloud/desktop-config-provider";
import { RestrictionNoticeProvider } from "@/react-app/domains/cloud/restriction-notice-provider";
import { LocalProvider } from "@/react-app/kernel/local-provider";
import { KeepAwakeBridge } from "@/react-app/domains/session/status/keep-awake-bridge";
import { ServerProvider } from "@/react-app/kernel/server-provider";
import { ArchitectureMismatchGate } from "./architecture-mismatch-gate";
import { BootStateProvider } from "./boot-state";
import { DesktopRuntimeBoot } from "./desktop-runtime-boot";
import { startDebugLogger, stopDebugLogger } from "./debug-logger";
import { resolveOpenworkConnection } from "./openwork-connection";
import { ReloadCoordinatorProvider } from "./reload-coordinator";
import { LinkOpenDialog } from "./link-open-dialog";

export function resolveDefaultServerUrl(): string {
  if (isDesktopRuntime()) return "http://127.0.0.1:4096";

  const openworkUrl =
    typeof import.meta.env?.VITE_GET3W_URL === "string"
      ? import.meta.env.VITE_GET3W_URL.trim()
      : "";
  if (openworkUrl) {
    const baseUrl = openworkUrl === "/api/openwork" && typeof window !== "undefined"
      ? new URL(openworkUrl, window.location.origin).href
      : openworkUrl;
    return `${baseUrl.replace(/\/+$/, "")}/opencode`;
  }

  if (isWebDeployment() && import.meta.env.PROD && typeof window !== "undefined") {
    return `${window.location.origin}/opencode`;
  }

  const envUrl =
    typeof import.meta.env?.VITE_OPENCODE_URL === "string"
      ? import.meta.env.VITE_OPENCODE_URL.trim()
      : "";
  return envUrl || "http://127.0.0.1:4096";
}

type AppProvidersProps = {
  children: ReactNode;
};

// Keep one provider tree while account settings change so local work stays mounted.
export function DesktopAppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <DesktopRuntimeBoot />
        <DesktopConfigProvider>
          <BrandThemeProvider>
            <RestrictionNoticeProvider>
              <LocalProvider>
                <GlobalQueueDrainerBridge />
                <KeepAwakeBridge />
                <ReloadCoordinatorProvider>{children}</ReloadCoordinatorProvider>
                <LinkOpenDialog />
                <Toaster />
              </LocalProvider>
            </RestrictionNoticeProvider>
          </BrandThemeProvider>
        </DesktopConfigProvider>
    </>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  hydrateOpenworkServerSettingsFromEnv();

  useEffect(() => {
    // Start the dev observability forwarder. Reads the current openwork-server
    // URL on every flush so reconnects after port changes still work. In prod
    // builds `startDebugLogger` is a no-op.
    startDebugLogger({
      serverUrl: async () => (await resolveOpenworkConnection()).normalizedBaseUrl,
    });
    return () => {
      stopDebugLogger();
    };
  }, []);

  const defaultUrl = resolveDefaultServerUrl();
  return (
    <BootStateProvider>
      <ServerProvider defaultUrl={defaultUrl}>
        <ArchitectureMismatchGate>
          <DenAuthProvider>
            <DesktopAppProviders>{children}</DesktopAppProviders>
          </DenAuthProvider>
        </ArchitectureMismatchGate>
      </ServerProvider>
    </BootStateProvider>
  );
}

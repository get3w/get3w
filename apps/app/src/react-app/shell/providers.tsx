/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import { isWebDeployment } from "@/app/lib/get3w-deployment";
import { hydrateGet3wServerSettingsFromEnv } from "@/app/lib/get3w-server";
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
import { resolveGet3wConnection } from "./get3w-connection";
import { ReloadCoordinatorProvider } from "./reload-coordinator";
import { LinkOpenDialog } from "./link-open-dialog";

export function resolveDefaultServerUrl(): string {
  if (isDesktopRuntime()) return "http://127.0.0.1:4096";

  const get3wUrl =
    typeof import.meta.env?.VITE_GET3W_URL === "string"
      ? import.meta.env.VITE_GET3W_URL.trim()
      : "";
  if (get3wUrl) {
    const baseUrl = get3wUrl === "/api/get3w" && typeof window !== "undefined"
      ? new URL(get3wUrl, window.location.origin).href
      : get3wUrl;
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
  hydrateGet3wServerSettingsFromEnv();

  useEffect(() => {
    // Start the dev observability forwarder. Reads the current get3w-server
    // URL on every flush so reconnects after port changes still work. In prod
    // builds `startDebugLogger` is a no-op.
    startDebugLogger({
      serverUrl: async () => (await resolveGet3wConnection()).normalizedBaseUrl,
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

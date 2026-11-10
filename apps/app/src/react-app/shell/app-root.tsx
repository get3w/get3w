/** @jsxImportSource react */

import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router";

import { captureAnalyticsEvent, initAnalytics } from "../../app/lib/analytics";
import { evalRelaunchDesktopApp } from "../../app/lib/desktop";
import { isDesktopRuntime, isElectronRuntime } from "../../app/lib/runtime-env";
import { ComputerBridge } from "../domains/session/computer/computer-store";
import { t, useLocale } from "../../i18n";
import { ChatDeepLinkListener } from "./chat-deep-link-listener";
import { NewProvidersListener } from "./new-providers-listener";
import { useDesktopFontZoomBehavior } from "./font-zoom";
import { LoadingOverlay } from "./loading-overlay";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import { DevProfiler, DevProfilerOverlay } from "./dev-profiler";
import { ReactRenderWatchdogOverlay } from "./react-render-watchdog-overlay";
import { EngineMigrationOverlay } from "./engine-migration";
import { useEngineMigrationAnalytics } from "./use-engine-migration-analytics";
import { AppMenuProvider } from "./app-menu";
import {
  OpenworkControlProvider,
  OpenworkRouteControlActions,
  useControlAction,
  type OpenworkControlAction,
} from "./control/control-provider";
import { OpenworkContextPublisher } from "./openwork-context-publisher";
import { SessionRoute } from "./session-route";
import { DesktopUpdaterProvider } from "../domains/settings/state/desktop-updater-provider";
import { SettingsRoute } from "./settings-route";
import { ShellConfigProvider } from "./shell-config";
import { WelcomeRoute } from "./welcome-route";
import { DesktopAccountGate } from "../domains/cloud/get3w-account";


/**
 * Control action for eval automation: inject brand theme (logo, icon, accent color)
 * via the dev-only desktop config bridge. Placed inside OpenworkControlProvider.
 */
function BrandThemeControlActions() {
  const applyAction = useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.brand_theme.apply",
      label: t("ui.28db070b9dbc"),
      description: t("ui.d4006a034a8b"),
      sideEffect: "mutation",
      args: [
        { name: "brandLogoUrl", type: "string", description: t("ui.7ed9aaaedf69") },
        { name: "brandIconUrl", type: "string", description: t("ui.5522df36679f") },
        { name: "brandAccentColor", type: "string", description: t("ui.a08692b9df14") },
      ],
      execute: (args) => {
        const bridge = (window as unknown as Record<string, unknown>).__openworkApplyDesktopConfig;
        if (typeof bridge !== "function") {
          return { ok: false, error: t("ui.03486f41ef65") };
        }
        bridge(args);
        return { applied: args };
      },
    };
  }, []);
  useControlAction(applyAction);

  const relaunchAction = useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.app.relaunch",
      label: t("ui.b44d77ab2ccd"),
      description: t("ui.7989a6ffcba5"),
      sideEffect: "mutation",
      execute: () => evalRelaunchDesktopApp(),
    };
  }, []);
  useControlAction(relaunchAction);

  const [renderThrow, setRenderThrow] = useState<string | null>(null);
  const renderThrowAction = useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.app.render_throw",
      label: t("ui.ad8047eaee18"),
      description: t("ui.368478b83c88"),
      sideEffect: "mutation",
      requiresArgs: true,
      args: [{ name: "message", type: "string", required: true, description: t("ui.71573d6d42af") }],
      execute: (args) => {
        if (typeof args !== "object" || args === null || !("message" in args) || typeof args.message !== "string") {
          return { ok: false, error: t("ui.ce5772254449") };
        }
        setRenderThrow(args.message);
        return undefined;
      },
    };
  }, []);
  useControlAction(renderThrowAction);
  if (renderThrow) throw new Error(renderThrow);

  return null;
}

let appOpenedCaptured = false;

/**
 * Analytics and the Cloud inventory prefetch mount above the activation gate.
 * An activation-required install holds them back until it is activated.
 * Desktop policy readiness is optional while enforcement is suspended.
 */
function useOutboundEgressAllowed() {
  return true;
}

export function AppRoot() {
  useLocale();
  useDesktopFontZoomBehavior();
  useVisualViewportInset();
  const egressAllowed = useOutboundEgressAllowed();
  useEngineMigrationAnalytics(egressAllowed);

  // Module-level dedupe keeps StrictMode double-mounts from double-counting.
  useEffect(() => {
    if (!egressAllowed || appOpenedCaptured) return;
    appOpenedCaptured = true;
    initAnalytics();
    captureAnalyticsEvent("app_opened", {});
  }, [egressAllowed]);


  return (
    <>
      <DevProfiler id="AppRoot">
        <DesktopUpdaterProvider>
        <ShellConfigProvider>
        <AppMenuProvider>
        <OpenworkControlProvider>
          <DesktopAccountGate>
          <OpenworkRouteControlActions />
          <ChatDeepLinkListener />
          <OpenworkContextPublisher />
          <BrandThemeControlActions />

                  {/* Settings unmounts the chat; computer use stays connected on every route. */}
                  {isElectronRuntime() ? <ComputerBridge /> : null}
                  <Routes>
              <Route path="/join-org" element={<Navigate to="/settings/account" replace />} />
              <Route path="/organizations/*" element={<Navigate to="/settings/account" replace />} />
              <Route path="/settings/organizations/*" element={<Navigate to="/settings/account" replace />} />
              <Route path="/workspace/:workspaceId/settings/organizations/*" element={<Navigate to="/settings/account" replace />} />
              <Route path="/signin" element={<Navigate to="/settings/account" replace />} />
              <Route path="/onboarding" element={<Navigate to="/session" replace />} />
              <Route
                path="/welcome"
                element={
                  <DevProfiler id="WelcomeRoute">
                    {isDesktopRuntime() ? <Navigate to="/session" replace /> : <WelcomeRoute />}
                  </DevProfiler>
                }
              />

              <Route
                path="/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/automations"
                element={
                  <DevProfiler id="AutomationsRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route path="/activity" element={<DevProfiler id="ActivityRoute"><SessionRoute /></DevProfiler>} />
              <Route path="/outputs" element={<DevProfiler id="OutputsRoute"><SessionRoute /></DevProfiler>} />
              <Route path="/apps" element={<DevProfiler id="AppsRoute"><SessionRoute /></DevProfiler>} />
              <Route path="/dashboard/apps/:appId" element={<DevProfiler id="DashboardAppRoute"><SessionRoute /></DevProfiler>} />
              <Route path="/apps/:appId" element={<DevProfiler id="AppPreviewRoute"><SessionRoute /></DevProfiler>} />
              <Route
                path="/dashboard"
                element={
                  <DevProfiler id="DashboardRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/extensions/*"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/extensions/*"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              {/* Default + fallback: land on the session view. Users open
                  settings deliberately via the sidebar or command palette. */}
              <Route path="/" element={<Navigate to="/session" replace />} />
              <Route path="*" element={<Navigate to="/session" replace />} />
                  </Routes>
                  <LoadingOverlay />
                  <EngineMigrationOverlay />

          </DesktopAccountGate>
        </OpenworkControlProvider>
        </AppMenuProvider>
        </ShellConfigProvider>
        </DesktopUpdaterProvider>
      </DevProfiler>
      {/*
        DevProfilerOverlay sits OUTSIDE the AppRoot <Profiler> zone on
        purpose. The overlay re-renders on every emit() to refresh its
        table, and any commit inside a <Profiler> is recorded as a
        commit on that zone. Mounting the overlay inside AppRoot would
        inflate AppRoot's commit count by hundreds of overlay
        self-renders for every real user-visible commit, masking the
        true app-level signal.
      */}
      <NewProvidersListener />
      <DevProfilerOverlay />
      <ReactRenderWatchdogOverlay />
    </>
  );
}

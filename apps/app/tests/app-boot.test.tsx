import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { initializeDenBootstrapConfig, readDenSettings } from "../src/app/lib/den";
import { dispatchDenSettingsChanged } from "../src/app/lib/den-session-events";
import { DenAuthProvider } from "../src/react-app/domains/cloud/den-auth-provider";
import { useDesktopConfig } from "../src/react-app/domains/cloud/desktop-config-provider";
import { useRestrictionNotice } from "../src/react-app/domains/cloud/restriction-notice-provider";
import * as globalQueueDrainer from "../src/react-app/domains/session/sync/global-queue-drainer";
import { DesktopUpdaterProvider } from "../src/react-app/domains/settings/state/desktop-updater-provider";
import { useLocal } from "../src/react-app/kernel/local-provider";
import { ServerProvider } from "../src/react-app/kernel/server-provider";
import { BootStateProvider, useBootState } from "../src/react-app/shell/boot-state";
import { DesktopAppProviders } from "../src/react-app/shell/providers";
import { useReloadCoordinator } from "../src/react-app/shell/reload-coordinator";

// Public Desktop starts local work without enterprise activation.
const PUBLIC_DISTRIBUTION = {
  flavor: "public",
  appName: "Get3W",
  appIdentifier: "com.get3w.desktop",
  protocolScheme: "openwork",
  requireSignin: false,
  requireActivation: false,
} as const;

const DEN_BASE_URL = "https://den.example.test";

// The preload snapshot an activated enterprise install boots with.
const ACTIVATED_BOOTSTRAP = {
  baseUrl: DEN_BASE_URL,
  requireSignin: false,
  requireActivation: false,
  enterpriseActivation: { activatedAt: "2026-09-10T00:00:00.000Z", denBaseUrl: DEN_BASE_URL },
};

// Desktop IPC commands only the activation-gated bridges issue: the runtime
// boot (DesktopRuntimeBoot) and the Automation runner registration
// (AutomationRunnerBridge). Everything else in the tree may talk to the shell
// before activation, exactly as it does today.
const GATED_DESKTOP_COMMANDS = new Set([
  "workspaceBootstrap",
  "runtimeBootstrap",
  "openworkServerRestart",
  "engineStart",
  "automationRunnerConfigure",
]);

// Minimal Electron preload stand-in. Every desktop command is recorded and
// resolves to nothing, so effects run against the bridge without a shell. No
// gateway marker is installed, so readDenBootstrapConfig falls back to its
// module default (no enterpriseActivation) — exactly the pre-activation state.
function installElectronBridge() {
  const commands: string[] = [];
  const meta: { distribution: typeof PUBLIC_DISTRIBUTION; desktopBootstrap?: typeof ACTIVATED_BOOTSTRAP } = {
    distribution: PUBLIC_DISTRIBUTION,
  };
  Reflect.set(window, "__OPENWORK_ELECTRON__", {
    meta,
    invokeDesktop: async (command: string) => {
      commands.push(command);
      return undefined;
    },
  });
  return {
    commands,
    // Activation lands the way the desktop shell reports it: an activated
    // bootstrap snapshot, re-read by the renderer, then the Den
    // settings-changed event.
    async activate() {
      meta.desktopBootstrap = ACTIVATED_BOOTSTRAP;
      await initializeDenBootstrapConfig();
      dispatchDenSettingsChanged({ settings: readDenSettings() });
    },
  };
}

function gatedCommands(commands: readonly string[]) {
  return commands.filter((command) => GATED_DESKTOP_COMMANDS.has(command));
}

// The real AppRoot-level consumer that renders before activation completes
// (added in #4482). Its useUpdater() hook pulls in the full context chain the
// provider tree must supply in every activation state.
function UpdaterProbe() {
  return (
    <DesktopUpdaterProvider>
      <div data-testid="updater-probe">updater-context-ok</div>
    </DesktopUpdaterProvider>
  );
}

const probeMounts: string[] = [];

// Reads every context the full tree provides and reports the activation and
// boot state, so the DOM tells which tree is mounted.
function TreeProbe() {
  useLocal();
  useDesktopConfig();
  useRestrictionNotice();
  useReloadCoordinator();
  const activationRequired = false;
  const boot = useBootState();
  useEffect(() => {
    probeMounts.push("mount");
  }, []);
  return (
    <div data-testid="tree-probe">
      tree-contexts-ok activation={activationRequired ? "required" : "complete"} boot={boot.phase}
    </div>
  );
}

// index.react.tsx mounts QueryClientProvider above AppProviders, so providers
// in the tree (such as feature-flag readers) may use TanStack Query.
function QueryRoot({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ProductionTree({ children }: { children: ReactNode }) {
  return (
    <QueryRoot>
      <BootStateProvider>
        <ServerProvider defaultUrl="http://127.0.0.1:4096">
          <DenAuthProvider>
            <DesktopAppProviders>{children}</DesktopAppProviders>
          </DenAuthProvider>
        </ServerProvider>
      </BootStateProvider>
    </QueryRoot>
  );
}

describe("app boot", () => {
  let actEnvironment: unknown;

  beforeEach(() => {
    GlobalRegistrator.register({ url: "http://localhost:5173/" });
    actEnvironment = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    probeMounts.length = 0;
  });

  afterEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", actEnvironment);
    await GlobalRegistrator.unregister();
  });

  test("supports AppRoot-level updater consumers without account activation", () => {
    installElectronBridge();
    let markup = "";
    expect(() => {
      markup = renderToStaticMarkup(
        <ProductionTree>
          <UpdaterProbe />
        </ProductionTree>,
      );
    }).not.toThrow();
    expect(markup).toContain("updater-context-ok");
  });

  test("starts local runtime immediately and preserves providers across account changes", async () => {
    const bridge = installElectronBridge();
    const startDrainer = spyOn(globalQueueDrainer, "startGlobalQueueDrainer").mockImplementation(() => () => {});
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <ProductionTree>
            <UpdaterProbe />
            <TreeProbe />
          </ProductionTree>,
        );
      });

      expect(container.textContent).toContain("updater-context-ok");
      expect(container.textContent).toContain("tree-contexts-ok activation=complete");
      expect(gatedCommands(bridge.commands)).toContain("workspaceBootstrap");
      expect(gatedCommands(bridge.commands)).not.toContain("automationRunnerConfigure");
      expect(startDrainer).toHaveBeenCalledTimes(1);
      expect(probeMounts).toEqual(["mount"]);

      await act(async () => {
        await bridge.activate();
      });

      // Account changes must not remount the local provider tree.
      expect(container.textContent).toContain("tree-contexts-ok activation=complete");
      expect(container.textContent).not.toContain("boot=idle");
      expect(gatedCommands(bridge.commands)).toContain("workspaceBootstrap");
      expect(gatedCommands(bridge.commands)).not.toContain("automationRunnerConfigure");
      expect(startDrainer).toHaveBeenCalledTimes(1);
      // The providers above the children never remounted across activation.
      expect(probeMounts).toEqual(["mount"]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      startDrainer.mockRestore();
    }
  });
});

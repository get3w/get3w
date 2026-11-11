/** @jsxImportSource react */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import type { SettingsUpdateStatus } from "../src/react-app/domains/settings/state/electron-updater-state";

GlobalRegistrator.register({ url: "http://localhost/" });
const { setLocale } = await import("../src/i18n");
setLocale("en");
afterAll(async () => { await GlobalRegistrator.unregister(); });
const { createRoot } = await import("react-dom/client");

let status: SettingsUpdateStatus = null;
let installs = 0;
let downloads = 0;
mock.module("../src/react-app/kernel/local-provider", () => ({
  useLocal: () => ({ prefs: {}, setPrefs: () => {} }),
}));
mock.module("../src/react-app/domains/cloud/desktop-config-provider", () => ({
  useDesktopConfig: () => ({ loading: false, config: {}, refreshFresh: async () => ({}) }),
}));
mock.module("../src/react-app/domains/cloud/brand-theme", () => ({ useBrandAppName: () => "Get3W" }));
mock.module("../src/react-app/shell/notifications", () => ({ notifyAlert: () => {} }));
// An unrelated rollout must not make Restart appear before the build is staged.
mock.module("../src/react-app/domains/session/status/use-desktop-feature", () => ({ useDesktopFeature: () => true }));
mock.module("../src/react-app/domains/settings/state/electron-updater-state", () => ({
  useElectronUpdaterState: () => ({
    appVersion: "0.18.0",
    updateEnv: { supported: true },
    updateStatus: status,
    checkForUpdates: async () => {},
    downloadUpdate: async () => { downloads += 1; },
    updateAndRestart: async () => { installs += 1; },
    setReleaseChannel: async () => {},
  }),
}));
const { DesktopUpdaterProvider, DesktopUpdateButton } = await import("../src/react-app/domains/settings/state/desktop-updater-provider");

describe("titlebar staged-update restart", () => {
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  async function render() {
    await act(async () => { root.render(<DesktopUpdaterProvider><DesktopUpdateButton /></DesktopUpdaterProvider>); });
  }
  async function click(label: string) {
    const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => { button.click(); });
  }
  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    status = null;
    installs = 0;
    downloads = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  });

  test.each(["idle", "checking", "blocked"] satisfies NonNullable<SettingsUpdateStatus>["state"][])("stays hidden while %s", async (state) => {
    status = { state };
    await render();
    expect(host.querySelector("[data-update-button]")).toBeNull();
  });

  test.each(["available", "ready", "error"] satisfies NonNullable<SettingsUpdateStatus>["state"][])("updates directly while %s", async (state) => {
    status = { state, version: "0.18.5" };
    await render();
    const button = host.querySelector<HTMLButtonElement>("[data-update-button]");
    expect(button).not.toBeNull();
    await act(async () => { button?.click(); });
    expect(installs).toBe(1);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("shows download progress and prevents duplicate downloads", async () => {
    status = { state: "downloading", totalBytes: 100, downloadedBytes: 45 };
    await render();
    const button = host.querySelector<HTMLButtonElement>("[data-update-button]");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-label")).toContain("45%");
    await act(async () => { button?.click(); });
    expect(installs).toBe(0);
  });
});

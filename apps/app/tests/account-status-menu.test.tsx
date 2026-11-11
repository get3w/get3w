/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { currentLocale, setLocale } from "../src/i18n";
import { resolveRuntimeStatus } from "../src/react-app/domains/session/sidebar/account-status-menu";

let savedLocale: ReturnType<typeof currentLocale>;
beforeEach(() => { savedLocale = currentLocale(); setLocale("zh"); });
afterEach(() => setLocale(savedLocale));

test("a connected workspace reports its connection instead of promising task availability", () => {
  expect(resolveRuntimeStatus({ clientConnected: true, openworkServerStatus: "connected", initializing: false }))
    .toEqual({ variant: "connected", label: "工作区已连接", detail: null });
});

test("workspace connection startup is not shown as disconnected", () => {
  expect(resolveRuntimeStatus({ clientConnected: false, openworkServerStatus: "disconnected", initializing: true }).label)
    .toBe("正在连接工作区");
});

test("workspace startup remains connecting when the server is available before the workspace", () => {
  expect(resolveRuntimeStatus({ clientConnected: false, openworkServerStatus: "connected", initializing: true }).label)
    .toBe("正在连接工作区");
});

test("a disconnected workspace names the connection and provides recovery", () => {
  const status = resolveRuntimeStatus({ clientConnected: false, openworkServerStatus: "disconnected", initializing: false });
  expect(status.variant).toBe("disconnected");
  expect(status.label).toBe("工作区连接已断开");
  expect(status.detail).toBe("重新打开工作区以重试连接");
});

test("limited service and configuration failures keep their specific statuses", () => {
  expect(resolveRuntimeStatus({ clientConnected: false, openworkServerStatus: "limited", initializing: false }).variant).toBe("partial");
  expect(resolveRuntimeStatus({ clientConnected: true, openworkServerStatus: "connected", initializing: false, reloadBusy: true }).variant).toBe("loading");
  expect(resolveRuntimeStatus({ clientConnected: true, openworkServerStatus: "connected", initializing: false, reloadError: "Reload failed" }).detail).toBe("Reload failed");
});

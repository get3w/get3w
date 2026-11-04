import { expect, mock, test } from "bun:test";
mock.module("../src/app/lib/runtime-env", () => ({ isDesktopRuntime: () => true, isElectronRuntime: () => true }));
const { isAnalyticsEnabled } = await import("../src/app/lib/analytics");
test("Desktop analytics is unavailable independently of inherited user preferences", () => {
  expect(isAnalyticsEnabled()).toBe(false);
});

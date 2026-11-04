import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import { useDesktopFeature } from "../src/react-app/domains/session/status/use-desktop-feature";
import { useNativeDictationFeature } from "../src/react-app/domains/session/surface/composer/use-native-dictation-feature";

test("personal capabilities use local adapters without identity, settings, or network", async () => {
  GlobalRegistrator.register({ url: "http://localhost" });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = Object.assign(async () => { requests++; throw new Error("unexpected network"); }, originalFetch);
  try {
    expect(useDesktopFeature("computerUse")).toBe(false);
    expect(useDesktopFeature("settledSessions")).toBe(false);
    expect(useNativeDictationFeature()).toBe(false);
    Reflect.set(window, "__OPENWORK_ELECTRON__", { computer: {}, dictation: {} });
    localStorage.setItem("openwork.den.authToken", "legacy-fixture");
    expect(useDesktopFeature("computerUse")).toBe(true);
    expect(useDesktopFeature("computerSessionHistory")).toBe(true);
    expect(useDesktopFeature("settledSessions")).toBe(true);
    expect(useDesktopFeature("remoteComputers")).toBe(false);
    expect(useNativeDictationFeature()).toBe(true);
    Reflect.set(window, "__OPENWORK_ELECTRON__", {});
    expect(useDesktopFeature("computerUse")).toBe(false);
    expect(useNativeDictationFeature()).toBe(false);
    expect(localStorage.getItem("openwork.den.authToken")).toBe("legacy-fixture");
    expect(requests).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    await GlobalRegistrator.unregister();
  }
});

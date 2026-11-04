import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DesktopConfigProvider, useDesktopConfig, type DesktopConfigStore } from "../src/react-app/domains/cloud/desktop-config-provider";

test("personal policy context neither loads saved enterprise restrictions nor contacts a control plane", async () => {
  GlobalRegistrator.register({url:"http://localhost"});
  const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = Object.assign(async () => { requests++; throw new Error("unexpected policy request"); }, originalFetch);
  const host = document.createElement("div");
  const root = createRoot(host);
  let store: DesktopConfigStore | undefined;
  function Probe() { store = useDesktopConfig(); return <span>{store.freshConfigStatus}</span>; }
  try {
    localStorage.setItem("openwork.den.desktopConfig:fixture", JSON.stringify({allowControlSettings:false,connectEnabled:false}));
    const before = localStorage.getItem("openwork.den.desktopConfig:fixture");
    await act(async () => root.render(<DesktopConfigProvider><Probe /></DesktopConfigProvider>));
    expect(host.textContent).toBe("ready");
    if (!store) throw new Error("missing context");
    expect(store.config).toEqual({});
    expect(store.loading).toBe(false);
    expect(store.checkRestriction({restriction:"allowControlSettings"})).toBe(false);
    await store.refresh();
    expect(await store.refreshFresh()).toEqual({});
    expect(requests).toBe(0);
    expect(localStorage.getItem("openwork.den.desktopConfig:fixture")).toBe(before);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
    await GlobalRegistrator.unregister();
  }
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DenAuthProvider, useDenAuth, type DenAuthStore } from "../src/react-app/domains/cloud/den-auth-provider";

test("legacy saved identity is not restored or exchanged by the personal Desktop", async () => {
  GlobalRegistrator.register({url:"http://localhost"});
  const previous = Reflect.get(globalThis,"IS_REACT_ACT_ENVIRONMENT");
  Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = Object.assign(async () => {requests++; throw new Error("legacy network request");}, originalFetch);
  const root = createRoot(document.createElement("div"));
  let auth: DenAuthStore | undefined;
  function Probe() {auth = useDenAuth(); return null;}
  try {
    localStorage.setItem("openwork.den.authToken","retired-fixture");
    await act(async () => root.render(<DenAuthProvider><Probe /></DenAuthProvider>));
    if (!auth) throw new Error("missing context");
    expect(auth.status).toBe("signed_out");
    expect(auth.user).toBeNull();
    expect(auth.verifiedIdentity).toBeNull();
    await auth.refresh();
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    expect(requests).toBe(0);
    expect(localStorage.getItem("openwork.den.authToken")).toBe("retired-fixture");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",previous);
    await GlobalRegistrator.unregister();
  }
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "bun:test";
import { useCloudMcpSubmitReadiness } from "../src/react-app/domains/connections/use-cloud-mcp-submit-readiness";

test("chat sends without cloud checks, deduplicates the same callback and preserves split-pane sends", async () => {
  GlobalRegistrator.register({ url: "http://localhost" });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  const originalFetch = globalThis.fetch;
  let network = 0;
  globalThis.fetch = Object.assign(async () => { network++; throw new Error("Unexpected cloud request"); }, originalFetch);
  const container = document.createElement("div"); const root = createRoot(container);
  let current: ReturnType<typeof useCloudMcpSubmitReadiness> | undefined;
  function Probe({ workspace }: { workspace: string }) {
    current = useCloudMcpSubmitReadiness({ cloudAuthStatus: "checking", client: null, workspaceId: workspace });
    return null;
  }
  try {
    localStorage.setItem("openwork.den.authToken", "legacy-fixture");
    await act(async () => root.render(createElement(Probe, { workspace: "one" })));
    if (!current) throw new Error("Hook did not mount");
    let sends = 0; let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const send = async () => { sends++; await pending; };
    await act(async () => {
      const first = current!.submit({ send });
      expect(current!.submit({ send })).toBe(first);
      const second = current!.submit({ send: async () => { sends++; } });
      await second; release?.(); await first;
    });
    expect(sends).toBe(2);
    let cancelled: Promise<unknown> | undefined;
    act(() => {
      cancelled = current!.submit({ send: async () => { sends++; } });
      root.render(createElement(Probe, { workspace: "two" }));
    });
    expect(await cancelled).toEqual({ outcome: "cancelled", reason: "context_changed" });
    expect(sends).toBe(2);
    expect(network).toBe(0);
    expect(localStorage.getItem("openwork.den.authToken")).toBe("legacy-fixture");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    await GlobalRegistrator.unregister();
  }
});

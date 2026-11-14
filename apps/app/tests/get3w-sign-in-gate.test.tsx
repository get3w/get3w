import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Snapshot } from "../src/react-app/domains/cloud/get3w-account";

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost" });
});
afterAll(async () => { await GlobalRegistrator.unregister(); });

test("native sends require a signed-in account and open the existing sign-in dialog", async () => {
  const { requireGet3wSignIn, openworkSignInEvent } = await import("../src/react-app/domains/cloud/get3w-account");
  expect(requireGet3wSignIn()).toBe(true); // Self-hosted web has its own authentication.
  let requests = 0;
  const onSignIn = () => { requests++; };
  window.addEventListener(openworkSignInEvent, onSignIn);
  Reflect.set(window, "__GET3W_ACCOUNT__", { status: async () => ({ status: "signed_out", user: null, pending: false, error: null }) });
  try {
    expect(requireGet3wSignIn()).toBe(false);
    expect(requests).toBe(1);
  } finally {
    window.removeEventListener(openworkSignInEvent, onSignIn);
    delete window.__GET3W_ACCOUNT__;
  }
});

test("desktop shows loading until signed out is confirmed, including unavailable and failed checks", async () => {
  const { MemoryRouter } = await import("react-router");
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { DesktopAccountGate } = await import("../src/react-app/domains/cloud/get3w-account");
  const { setLocale } = await import("../src/i18n");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  let resolveStatus: (snapshot: Snapshot) => void = () => {};
  let rejectStatus: (error: Error) => void = () => {};
  const status = () => new Promise<Snapshot>((resolve, reject) => { resolveStatus = resolve; rejectStatus = reject; });
  Reflect.set(window, "__OPENWORK_ELECTRON__", {});
  Reflect.set(window, "__GET3W_ACCOUNT__", { status });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const expectLoading = () => {
    expect(node.textContent).toContain("载入中...");
    expect(node.textContent).not.toContain("登录 Get3W");
    expect(node.querySelector("button")).toBeNull();
    expect(node.querySelector('[data-testid="operation"]')).toBeNull();
  };
  try {
    setLocale("zh");
    await act(async () => { root.render(<MemoryRouter><DesktopAccountGate><button data-testid="operation">Operation</button></DesktopAccountGate></MemoryRouter>); });
    expectLoading();
    await act(async () => { resolveStatus({ status: "unavailable", user: null, pending: false, error: "Service unavailable" }); });
    expectLoading();
    expect(node.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await act(async () => { rejectStatus(new Error("Service unavailable")); });
    expectLoading();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await act(async () => { resolveStatus({ status: "signed_out", user: null, pending: false, error: null }); });
    expect(node.textContent).not.toContain("载入中...");
    expect(node.querySelector("button")?.textContent).toBe("登录 Get3W");
  } finally {
    await act(async () => { root.unmount(); });
    node.remove();
    Reflect.deleteProperty(window, "__OPENWORK_ELECTRON__");
    delete window.__GET3W_ACCOUNT__;
  }
});

test("desktop login cannot be dismissed and gates operations until authentication succeeds", async () => {
  const { MemoryRouter } = await import("react-router");
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { DesktopAccountGate } = await import("../src/react-app/domains/cloud/get3w-account");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  let signedIn = false;
  const status = async () => ({ status: signedIn ? "signed_in" : "signed_out", user: signedIn ? { id: "test", name: "Test" } : null, error: null, pending: false });
  Reflect.set(window, "__OPENWORK_ELECTRON__", {});
  Reflect.set(window, "__GET3W_ACCOUNT__", { status, begin: async () => { signedIn = true; return status(); } });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(async () => { root.render(<MemoryRouter><DesktopAccountGate><button data-testid="operation">Operation</button></DesktopAccountGate></MemoryRouter>); });
    expect(node.querySelector('[data-testid="operation"]')).toBeNull();
    expect(document.querySelector('[data-testid="desktop-sign-in"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
    await act(async () => { document.querySelector('[data-testid="desktop-sign-in"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector('[data-testid="desktop-sign-in"]')).not.toBeNull();
    expect(node.querySelector('[data-testid="operation"]')).toBeNull();
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-testid="desktop-sign-in"] button')?.click(); });
    expect(node.querySelector('[data-testid="operation"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="desktop-sign-in"]')).toBeNull();
    signedIn = false;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(node.querySelector('[data-testid="operation"]')).toBeNull();
    expect(document.querySelector('[data-testid="desktop-sign-in"]')).not.toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    node.remove();
    Reflect.deleteProperty(window, "__OPENWORK_ELECTRON__");
    delete window.__GET3W_ACCOUNT__;
  }
});

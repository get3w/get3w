import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { QueryObserver } from "@tanstack/react-query";
import type { Snapshot } from "../src/react-app/domains/cloud/get3w-account";

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost" });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterAll(async () => { await GlobalRegistrator.unregister(); });

async function setup() {
  const { MemoryRouter } = await import("react-router");
  const { createRoot } = await import("react-dom/client");
  const { Get3wAccount } = await import("../src/react-app/domains/cloud/get3w-account");
  const { getReactQueryClient } = await import("../src/react-app/infra/query-client");
  const { providerListQueryKey } = await import("../src/react-app/infra/provider-list-query");
  const client = getReactQueryClient();
  client.clear();
  const key = providerListQueryKey({ baseUrl: "http://localhost:8787/opencode", directory: "/fixture" });
  let connected = false;
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: 300_000,
    queryFn: async () => { reads++; return connected ? ["get3w-account"] : []; },
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  const account: Snapshot = {
    status: "signed_in", user: { id: "fixture", name: "Fixture" }, pending: false, error: null,
    managedModels: { enabled: true, state: "connected" },
  };
  let statusCalls = 0;
  let result: Snapshot = account;
  Reflect.set(window, "__GET3W_ACCOUNT__", {
    status: async () => { statusCalls++; return result; },
    taskCatalog: async () => ({ models: [], catalog_version: "fixture", expiresAt: Date.now() + 60_000, offline: false }),
  });
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node);
  return {
    client, key, account,
    setConnected(value: boolean) { connected = value; },
    setResult(value: Snapshot) { result = value; },
    reads: () => reads,
    statusCalls: () => statusCalls,
    mount: () => act(async () => { root.render(<MemoryRouter><Get3wAccount /></MemoryRouter>); }),
    cleanup: async () => {
      await act(async () => root.unmount());
      node.remove(); unsubscribe(); client.clear(); delete window.__GET3W_ACCOUNT__;
    },
  };
}

test("native account reconciliation replaces a fresh empty model cache and refreshes same-account recovery", async () => {
  const fixture = await setup();
  try {
    expect(fixture.client.getQueryData(fixture.key)).toEqual([]);
    const initialReads = fixture.reads();
    fixture.setConnected(true);
    await fixture.mount();
    expect(fixture.reads()).toBeGreaterThan(initialReads);
    expect(fixture.client.getQueryData(fixture.key)).toEqual(["get3w-account"]);
    // A focus-triggered native reconnect can complete after a prior empty read,
    // without a sign-in change or a provider SSE event.
    fixture.client.setQueryData(fixture.key, []);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(fixture.client.getQueryData(fixture.key)).toEqual(["get3w-account"]);
  } finally { await fixture.cleanup(); }
});

test("pending startup reload recovers automatically before refreshing the model catalog", async () => {
  const fixture = await setup();
  try {
    fixture.setResult({ ...fixture.account, managedModels: { enabled: true, state: "pending" } });
    await fixture.mount();
    expect(fixture.client.getQueryData(fixture.key)).toEqual([]);
    fixture.setConnected(true);
    fixture.setResult(fixture.account);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3200)); });
    expect(fixture.statusCalls()).toBe(2);
    expect(fixture.client.getQueryData(fixture.key)).toEqual(["get3w-account"]);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3200)); });
    expect(fixture.statusCalls()).toBe(2);
  } finally { await fixture.cleanup(); }
}, 10_000);

test("account web settings opens the exact URL and reports browser failures", async () => {
  const fixture = await setup();
  const { setLocale, t } = await import("../src/i18n");
  const { openGet3wSignIn } = await import("../src/react-app/domains/cloud/get3w-account");
  const opened: string[] = [];
  let fail = false;
  Reflect.set(window, "__GET3W_ELECTRON__", { shell: { openExternal: async (url: string) => {
    opened.push(url);
    return fail ? { ok: false, error: "Browser unavailable" } : { ok: true };
  } } });
  try {
    setLocale("zh");
    await fixture.mount();
    await act(async () => { openGet3wSignIn(); });
    const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent === t("ui.ed077f3d8125"));
    expect(button).toBeDefined();
    expect(document.body.textContent).not.toContain(t("ui.06faeb0780a2"));
    expect(document.body.textContent).not.toContain(t("ui.3dbaf78b6b8a"));
    expect(document.body.textContent).not.toContain(t("ui.3e2d8350575b"));
    expect(document.body.textContent).not.toContain(t("ui.55ad0e203a01"));
    await act(async () => { button?.click(); });
    expect(opened).toEqual(["https://get3w.com/settings"]);
    fail = true;
    await act(async () => { button?.click(); });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(t("ui.4c468a5e8fa3"));
    fail = false;
    await act(async () => { button?.click(); });
    expect(document.querySelector('[role="alert"]')).toBeNull();
  } finally {
    delete window.__GET3W_ELECTRON__;
    await fixture.cleanup();
  }
});

test("returning from web settings publishes the updated account name and avatar", async () => {
  const fixture = await setup();
  const { readGet3wAccount } = await import("../src/react-app/domains/cloud/get3w-account");
  try {
    await fixture.mount();
    const user = { id: "fixture", name: "Updated name", avatar_url: "https://get3w.com/avatar-new.png" };
    fixture.setResult({ ...fixture.account, user });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(readGet3wAccount().user).toEqual(user);
    fixture.setResult({ ...fixture.account, user: { ...user, name: "Another device" } });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(readGet3wAccount().user?.name).toBe("Another device");
  } finally { await fixture.cleanup(); }
});

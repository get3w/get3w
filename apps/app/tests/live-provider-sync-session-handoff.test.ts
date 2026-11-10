import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { initializeDenBootstrapConfig, setDenBootstrapConfig, writeDenSettings } from "../src/app/lib/den";
import { createOpenworkServerClient } from "../src/app/lib/openwork-server";
import { createClientV2 } from "../src/app/lib/opencode-v2-adapter";
import { createProviderAuthStore } from "../src/react-app/domains/connections/provider-auth/store";
import { getReactQueryClient } from "../src/react-app/infra/query-client";

beforeEach(async () => {
  GlobalRegistrator.register({ url: "http://localhost:5173/" });
  await initializeDenBootstrapConfig();
  await setDenBootstrapConfig({ baseUrl: "https://den.example.test", apiBaseUrl: "https://den.example.test" });
  writeDenSettings({
    baseUrl: "https://den.example.test", apiBaseUrl: "https://den.example.test",
    authToken: "fixture-session",
  }, { persistBootstrap: false });
});
afterEach(async () => {
  getReactQueryClient().clear();
  await GlobalRegistrator.unregister();
});

test("retired Den model sync never delivers saved tokens or mutates workspace config", async () => {
  const requests: string[] = [];
  const savedDenSettings = () => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("openwork.den.")));
  const before = savedDenSettings();
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    requests.push(String(input));
    throw new Error("Unexpected legacy request");
  });
  const store = createLiveProviderStore({ generation: 7 });
  try {
    store.start();
    store.syncFromOptions();
    for (const reason of ["sign_in", "app_launch", "app_resume", "manual", "model_picker_open", "new_chat", "settings_cloud_opened"] as const) {
      await store.runCloudProviderSync(reason);
    }
    expect(await store.refreshImportedCloudProviders({ strict: true })).toEqual({});
    await expect(store.connectCloudProvider("lpr_fixture")).rejects.toThrow();
    await expect(store.removeCloudProvider("lpr_fixture")).rejects.toThrow();
    await expect(store.startGatewayProviderOAuth("ipr_fixture")).rejects.toThrow();
    window.dispatchEvent(new CustomEvent("openwork-den-session-updated", { detail: { status: "success" } }));
    window.dispatchEvent(new Event("openwork-den-settings-changed"));
    await Promise.resolve();
    expect(requests).toEqual([]);
    expect(savedDenSettings()).toEqual(before);
    expect(store.getSnapshot().cloudProviderServerSync).toBeNull();
  } finally { store.dispose(); fetch.mockRestore(); }
});

test("personal provider OAuth still authorizes through the local engine", async () => {
  const requests: string[] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    requests.push(path);
    if (path.endsWith("/provider/auth")) return Response.json({ anthropic: [{ type: "oauth", label: "Sign in" }] });
    if (path.endsWith("/provider/anthropic/oauth/authorize")) return Response.json({ url: "https://accounts.example.test/authorize", method: "auto", instructions: "Continue in browser" });
    if (path.endsWith("/provider")) return Response.json({ all: [], connected: [], default: {} });
    return Response.json({});
  });
  const store = createLiveProviderStore();
  try {
    const result = await store.startProviderAuth("anthropic");
    expect(result.methodIndex).toBe(0);
    expect(result.authorization.url).toBe("https://accounts.example.test/authorize");
    expect(requests.some(path => path.endsWith("/provider/anthropic/oauth/authorize"))).toBe(true);
    expect(requests.every(path => !path.includes("den-session") && !path.includes("cloud-provider-sync"))).toBe(true);
  } finally { store.dispose(); fetch.mockRestore(); }
});

test("ENG-994: disabling OpenCode Zen on mount keeps a provider another route disconnected", async () => {
  // The chat route disables Zen on every mount from its own (stale) copy of
  // the list. Writing that copy back re-enabled a provider Settings had just
  // disconnected, and the write repeated on every mount.
  let runtime = ["remote"];
  const writes: string[][] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/workspace/workspace/runtime-config/disabled-providers") {
      if (request.method === "POST") {
        const body: unknown = await request.json();
        runtime = typeof body === "object" && body !== null && "providers" in body && Array.isArray(body.providers)
          ? body.providers.filter((entry): entry is string => typeof entry === "string") : [];
        writes.push(runtime);
      }
      return Response.json({ ok: true, disabledProviders: runtime });
    }
    return Response.json({});
  });
  const chat = createLiveProviderStore();
  try {
    expect(await chat.ensureProjectProviderDisabledState("opencode", true)).toBe(true);
    expect(writes).toEqual([["remote", "opencode"]]);
    // A later mount finds Zen already disabled and writes nothing.
    expect(await chat.ensureProjectProviderDisabledState("opencode", true)).toBe(false);
    expect(writes).toEqual([["remote", "opencode"]]);
    // Nor when the list holds Zen in another position.
    runtime = ["opencode", "remote"];
    expect(await chat.ensureProjectProviderDisabledState("opencode", true)).toBe(false);
    expect(writes).toEqual([["remote", "opencode"]]);
  } finally {
    chat.dispose();
    fetch.mockRestore();
  }
});

function createLiveProviderStore(view: { generation?: number; baseUrl?: string; token?: string } = {}) {
  const server = createOpenworkServerClient({ baseUrl: view.baseUrl ?? "http://localhost:8787", token: view.token, hostToken: "fixture-host" });
  const client = createClientV2("http://localhost:8787/opencode2", "/workspace", {});
  return createProviderAuthStore({
    client: () => client,
    providers: () => [], providerDefaults: () => ({}), providerConnectedIds: () => [], disabledProviders: () => [],
    checkDesktopAppRestriction: () => false,
    selectedWorkspaceDisplay: () => ({ id: "workspace", name: "Workspace", path: "/workspace", preset: "default", workspaceType: "local" }),
    providerBaseUrl: () => "http://localhost:8787/opencode2", selectedWorkspaceRoot: () => "/workspace",
    runtimeWorkspaceId: () => "workspace",
    openworkServer: { getSnapshot: () => ({
      openworkServerStatus: "connected", openworkServerClient: server,
      openworkServerCapabilities: { providerSync: true }, openworkServerAuth: { token: view.token, hostToken: "fixture-host" },
      ...(view.generation === undefined ? {} : { openworkServerHostInfo: { generation: view.generation } }),
    }) },
    setProviders: () => {}, setProviderDefaults: () => {}, setProviderConnectedIds: () => {}, setDisabledProviders: () => {},
    markOpencodeConfigReloadRequired: () => {},
  });
}

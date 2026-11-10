import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";
import { createExtensionsStore } from "../src/react-app/domains/settings/state/extensions-store";
import { createOpenworkServerClient } from "../src/app/lib/openwork-server";
import type { OpenworkServerStore } from "../src/react-app/domains/connections/openwork-server-store";

test("personal skills and plugins work while legacy organization resources never sync", async () => {
  GlobalRegistrator.register({ url: "http://localhost" });
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const plugins: string[] = [];
  const skills = [{ name: "local-skill", description: "Local", path: ".opencode/skills/local-skill/SKILL.md" }];
  const reloads: string[] = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const method = request.method;
    requests.push(`${method} ${path}`);
    if (path === "/workspace/local/skills" && method === "GET") return Response.json({ items: skills });
    if (path === "/workspace/local/skills/local-skill" && method === "DELETE") { skills.splice(0); return Response.json({}); }
    if (path === "/workspace/local/plugins" && method === "GET") return Response.json({ items: plugins.map(spec => ({ spec, scope: "project", source: "config" })) });
    if (path === "/workspace/local/plugins" && method === "POST") { plugins.push((await request.json()).spec); return Response.json({}); }
    if (path.startsWith("/workspace/local/plugins/") && method === "DELETE") { plugins.splice(0); return Response.json({}); }
    throw new Error(`Unexpected request: ${method} ${request.url}`);
  }, originalFetch);
  const client = createOpenworkServerClient({ baseUrl: "http://127.0.0.1:8787", token: "fixture" });
  // Only the store's subscription/snapshot interface is exercised here.
  const serverStore = { getSnapshot: () => ({ openworkServerClient: client, openworkServerStatus: "connected", openworkServerCapabilities: null }), subscribe: () => () => {} } as unknown as OpenworkServerStore;
  const store = createExtensionsStore({
    checkDesktopAppRestriction: () => false, client: () => null, projectDir: () => "/fixture",
    selectedWorkspaceId: () => "local", selectedWorkspaceRoot: () => "/fixture", workspaceType: () => "local",
    runtimeWorkspaceId: () => "local", openworkServer: serverStore,
    setBusy() {}, setBusyLabel() {}, setBusyStartedAt() {}, setError() {},
    markReloadRequired: reason => reloads.push(reason),
  });
  try {
    localStorage.setItem("openwork.den.authToken", "legacy-fixture");
    expect((await store.removeCloudOrgPlugin("legacy")).ok).toBe(false);
    await expect(store.createLibraryItem("plugin", { name: "fixture", description: "", instructions: "" })).rejects.toThrow();
    expect(requests).toEqual([]);
    await store.refreshSkills({ force: true });
    expect(store.getSnapshot().skills[0]?.name).toBe("local-skill");
    await store.addPlugin("fixture-plugin");
    expect(store.getSnapshot().pluginList.map(item => item.name)).toEqual(["fixture-plugin"]);
    await store.removePlugin("fixture-plugin");
    expect(store.getSnapshot().pluginList).toEqual([]);
    await store.uninstallSkill("local-skill");
    expect(store.getSnapshot().skills).toEqual([]);
    expect(reloads).toContain("plugins");
    expect(localStorage.getItem("openwork.den.authToken")).toBe("legacy-fixture");
    expect(requests.every(path => !/cloud|den|marketplace/.test(path))).toBe(true);
  } finally {
    store.dispose(); globalThis.fetch = originalFetch;
    await GlobalRegistrator.unregister();
  }
});

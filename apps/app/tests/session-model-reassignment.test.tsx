import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { createOpenworkServerClient } from "../src/app/lib/openwork-server";
import type { RouteWorkspace } from "../src/react-app/shell/route-workspaces";
import type { ResolvedWorkspaceEndpoint } from "../src/app/lib/workspace-endpoint";

mock.module("../src/react-app/domains/cloud/desktop-config-provider", () => ({ useCheckDesktopRestriction: () => () => false }));
mock.module("../src/react-app/domains/cloud/den-auth-provider", () => ({ useDenAuth: () => ({ isSignedIn: false }) }));
const nativeHttp = { fetch: globalThis.fetch, Request, Response, Headers, AbortController, AbortSignal };
const NativeResponse = Response;
GlobalRegistrator.register({ url: "http://localhost/" });
for (const [key, value] of Object.entries(nativeHttp)) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
  Object.defineProperty(window, key, { configurable: true, value });
}
const { OpenworkControlProvider } = await import("../src/react-app/shell/control/control-provider");
const { useSessionControlActions } = await import("../src/react-app/domains/session/control/session-control-actions");
const { useSessionModelStore } = await import("../src/react-app/domains/session/surface/session-model-store");
const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
afterAll(async () => { Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct); await GlobalRegistrator.unregister(); });

async function mount(options: { archived?: boolean; busy?: boolean; v1?: boolean; deny?: boolean; wrongReadback?: boolean } = {}) {
  useSessionModelStore.getState().setModel("ses_target", { providerID: "rebind", modelID: "model-a" });
  const writes: unknown[] = [];
  let model = { providerID: "rebind", id: "model-a", variant: "default" };
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/experimental/engine-v2-preview/status") return NativeResponse.json({ enabled: !options.v1, running: !options.v1, chatRouting: !options.v1, mirroredProviderIds: [], skippedProviderIds: [], catalogModelIds: [] });
    if (path.endsWith("/api/model/default")) return NativeResponse.json({ data: {} });
    if (path.endsWith("/api/model")) return NativeResponse.json({ data: [{ id: "model-a", providerID: "rebind", name: "Model A" }, { id: "model-b", providerID: "rebind", name: "Model B" }] });
    if (path.endsWith("/api/provider")) return NativeResponse.json({ data: [{ id: "rebind", name: "Recovery witness" }] });
    if (path.endsWith("/api/session/active")) return NativeResponse.json({ data: options.busy ? { ses_target: { type: "running" } } : {} });
    if (path.endsWith("/api/session/ses_target/model")) {
      const body = await request.json();
      writes.push(body);
      if (options.deny) return NativeResponse.json({ message: "Denied" }, { status: 403 });
      if (!options.wrongReadback && body && typeof body === "object" && "model" in body && body.model
        && typeof body.model === "object" && "id" in body.model && typeof body.model.id === "string") {
        model = { providerID: "rebind", id: body.model.id, variant: "default" };
      }
      return NativeResponse.json({ data: {} });
    }
    if (path.endsWith("/api/session/ses_target")) return NativeResponse.json({ data: {
      id: "ses_target", location: { directory: "/tmp/two" }, model, time: { archived: options.archived ? 123 : 0 },
    } });
    return NativeResponse.json({ message: `Unexpected request: ${path}` }, { status: 404 });
  } });
  cleanups.push(() => server.stop(true));
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const client = createOpenworkServerClient({ baseUrl, token: "fixture" });
  const workspaces: RouteWorkspace[] = ["one", "two"].map(id => ({ id, name: id, displayNameResolved: id, path: `/tmp/${id}`, preset: "starter", workspaceType: "local" }));
  const endpointForWorkspace = (workspace: RouteWorkspace | null | undefined): ResolvedWorkspaceEndpoint | null => workspace ? {
    baseUrl, token: "fixture", workspaceId: workspace.id, isRemote: false, client,
    mountedBaseUrl: `${baseUrl}/workspace/${workspace.id}`, opencodeBaseUrl: `${baseUrl}/workspace/${workspace.id}/opencode`,
  } : null;
  function Register() {
    useSessionControlActions({ workspaces, selectedWorkspaceId: "one", selectedWorkspaceRoot: "/tmp/one", selectedSessionId: null,
      sessionsByWorkspaceId: { two: [{ id: "ses_target" }] }, canCreateTask: false, openworkClient: client, opencodeClient: null, endpointForWorkspace,
      navigateToSession: () => { throw new Error("Must not navigate"); }, navigateToSessionRoot: () => { throw new Error("Must not navigate"); },
      createTaskInWorkspace: () => null, openModelPicker: () => { throw new Error("Must not open picker"); }, refreshRouteState: () => {}, archiveSession: async () => ({ kind: "done" }),
    });
    return null;
  }
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><OpenworkControlProvider><Register /></OpenworkControlProvider></MemoryRouter>));
  cleanups.push(async () => { await act(async () => root.unmount()); host.remove(); });
  const api = window.__openworkControl;
  if (!api) throw new Error("Missing isolated control rail");
  return { writes, run: async (extra: Record<string, unknown> = {}) => {
    let response: Awaited<ReturnType<typeof api.command>> | undefined;
    await act(async () => { response = await api.command({ id: "session.set_model", args: { sessionId: "ses_target", providerId: "rebind", modelId: "model-b", ...extra } }); });
    return response;
  } };
}

test("nonselected v2 workspace routes to its native engine and normalizes the default effort", async () => {
  const fixture = await mount();
  expect(await fixture.run({ variant: null })).toMatchObject({ ok: true, result: { ok: true, workspaceId: "two", model: { providerId: "rebind", modelId: "model-b", variant: null } } });
  expect(fixture.writes).toEqual([{ model: { providerID: "rebind", id: "model-b", variant: "default" } }]);
  expect(useSessionModelStore.getState().bySessionId.ses_target).toEqual({ model: { providerID: "rebind", modelID: "model-b" }, variant: null });
});
for (const [options, message] of [
  [{ archived: true }, "Archived sessions"], [{ busy: true }, "Working sessions"], [{ v1: true }, "requires the OpenCode v2"],
] satisfies Array<[{ archived?: boolean; busy?: boolean; v1?: boolean }, string]>) {
  test(`rejects ${message} before any model mutation`, async () => {
    const fixture = await mount(options);
    expect(await fixture.run()).toMatchObject({ ok: false, error: expect.stringContaining(message) });
    expect(fixture.writes).toEqual([]);
  });
}
test("unavailable models and invalid argument types do not mutate", async () => {
  const fixture = await mount();
  expect(await fixture.run({ modelId: "missing" })).toMatchObject({ ok: false, error: expect.stringContaining("Unavailable model") });
  expect(await fixture.run({ variant: 123 })).toMatchObject({ ok: false });
  expect(await fixture.run({ variant: "x".repeat(61) })).toMatchObject({ ok: false });
  expect(fixture.writes).toEqual([]);
});
test("endpoint denial is not reported as a rebind", async () => {
  const fixture = await mount({ deny: true });
  expect(await fixture.run()).toMatchObject({ ok: false, error: expect.stringContaining("Denied") });
});
test("a successful endpoint response still requires matching persisted readback", async () => {
  const fixture = await mount({ wrongReadback: true });
  expect(await fixture.run()).toMatchObject({ ok: false, error: expect.stringContaining("readback") });
  expect(useSessionModelStore.getState().bySessionId.ses_target?.model.modelID).toBe("model-a");
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "bun:test";
import { useWorkspaceModelProfile } from "../src/react-app/kernel/use-workspace-model-default";
import { useOrgMcpConnections } from "../src/react-app/domains/connections/use-org-mcp-connections";
import { loadSessionConnectCapabilities } from "../src/react-app/domains/connections/cloud-inventory-cache";
import { createDenClient } from "../src/app/lib/den";
import { CredentialPromptCard } from "../src/components/chat/credential-prompt-card";
import { DashboardPage } from "../src/react-app/domains/dashboard/dashboard-page";
import type { DynamicToolUIPart } from "ai";

test("old organization credentials cannot fetch inventory, solicit a key, or prevent local preferences", async () => {
 GlobalRegistrator.register({ url: "http://localhost" });
 Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
 const originalFetch = globalThis.fetch;
 let requests = 0;
 globalThis.fetch = Object.assign(async () => { requests++; throw new Error("Unexpected organization request"); }, originalFetch);
 localStorage.setItem("openwork.den.authToken", "retained-synthetic-token");
 const before = [...Object.keys(localStorage)].map(key => [key, localStorage.getItem(key)]);
 const host = document.createElement("div"); const root = createRoot(host);
 const part: DynamicToolUIPart = { type: "dynamic-tool", toolName: "openwork-cloud_credential_prompt", toolCallId: "old", state: "output-available", input: {}, output: {} };
 function Probe() {
  const profile = useWorkspaceModelProfile(); const connections = useOrgMcpConnections();
  return <><span data-profile>{profile}</span><span data-connections>{connections.connections.length}</span><CredentialPromptCard part={part} /><DashboardPage onCreateApp={async () => { throw new Error("unexpected cloud app"); }} /></>;
 }
 try {
  await act(async () => root.render(<Probe />));
  expect(host.querySelector("[data-profile]")?.textContent).toBe("local");
  expect(host.querySelector("[data-connections]")?.textContent).toBe("0");
  expect(host.querySelector("input")).toBeNull();
  expect(host.querySelector("button")).toBeNull();
  expect((await loadSessionConnectCapabilities()).skills).toEqual([]);
  await expect(createDenClient({ baseUrl: "https://legacy.example", token: "retained-synthetic-token" }).listOrgs()).rejects.toThrow("unavailable");
  expect(requests).toBe(0);
  expect([...Object.keys(localStorage)].map(key => [key, localStorage.getItem(key)])).toEqual(before);
 } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; GlobalRegistrator.unregister(); }
});

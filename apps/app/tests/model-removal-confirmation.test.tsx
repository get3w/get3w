/** @jsxImportSource react */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ModelRef } from "../src/app/types";

const ownedDom = typeof window === "undefined";
if (ownedDom) GlobalRegistrator.register({ url: "http://localhost/" });
const { useModelRemovalConfirmation } = await import("../src/react-app/domains/session/surface/use-model-removal-confirmation");
const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterAll(async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
  if (ownedDom) await GlobalRegistrator.unregister();
});

test("personal accounts have no organization assignments, so a missing model is never confirmed removed", async () => {
  const selected: ModelRef = { providerID: "ipr_assigned", modelID: "gwm_selected" };
  const refresh = mock(async () => true);
  function Probe() {
    const result = useModelRemovalConfirmation({ model: selected, missing: true, ready: true, scope: "account/workspace", chatKey: "chat-a", refreshEngine: refresh });
    return <output data-assigned-models={result.assignedModels.map((model) => model.modelID).join(",")}>{String(result.confirmed)}</output>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<Probe />); });
  expect(host.textContent).toBe("false");
  expect(host.querySelector("output")?.getAttribute("data-assigned-models")).toBe("");
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => { root.unmount(); });
  host.remove();
});

import { expect, test } from "bun:test";
import { get3wProviderId } from "../src/app/lib/get3w-provider-id";
import { parseModelRef } from "../src/app/utils";
import { managesOwnBehavior } from "../src/react-app/domains/models/model-catalog";

test("saved account references migrate without changing other providers", () => {
  expect(parseModelRef("openwork-account/get3w-auto")).toEqual({ providerID: "get3w-account", modelID: "get3w-auto" });
  expect(get3wProviderId("openwork")).toBe("openwork");
  expect(get3wProviderId("anthropic")).toBe("anthropic");
  expect(managesOwnBehavior({ providerID: "get3w-account", modelID: "get3w-auto" })).toBe(true);
});

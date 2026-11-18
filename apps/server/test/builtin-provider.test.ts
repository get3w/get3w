import { expect, test } from "bun:test";
import { validateUserProviderUpdate } from "../src/validators";

test("provider config cannot define the reserved Smart Router provider", () => {
  expect(() => validateUserProviderUpdate({ "get3w-auto": { name: "replacement" } })).toThrow("managed by your organization");
  expect(() => validateUserProviderUpdate({ "get3w-auto": null })).not.toThrow();
});

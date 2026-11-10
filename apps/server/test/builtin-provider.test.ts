import { expect, test } from "bun:test";
import { validateUserProviderUpdate } from "../src/validators";

test("provider config cannot define the reserved Smart Router provider", () => {
  expect(() => validateUserProviderUpdate({ "openwork-auto": { name: "replacement" } })).toThrow("managed by your organization");
  expect(() => validateUserProviderUpdate({ "openwork-auto": null })).not.toThrow();
});

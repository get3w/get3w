import { expect, test } from "bun:test";
import { assertGet3wServiceTarget } from "../src/app/lib/get3w-service-target";
import { providerLogoCandidates } from "../../../packages/ui/src/react/provider-logo-src";
import { resolveOpencodeModelsUrl } from "../../server/src/opencode-models-url";
import { readRelaySettings } from "../../server/src/free-auto/settings";
test("old saved Den endpoints cannot receive Get3W service calls", () => {
  expect(() => assertGet3wServiceTarget("https://api.openworklabs.com/path")).toThrow();
  expect(() => assertGet3wServiceTarget("https://api.openwork.com/path")).toThrow();
  expect(() => assertGet3wServiceTarget("https://api.get3w.com/path")).not.toThrow();
});
test("legacy provider IDs use bundled branding without upstream logo requests", () => {
  for (const providerId of ["openwork", "openwork", "openwork-free", "openwork-auto"]) expect(providerLogoCandidates({providerId})).toEqual([]);
});
test("the default engine catalog uses its actual third-party source", async () => {
  expect(await resolveOpencodeModelsUrl({env:{}})).toBe("https://models.dev");
  expect(await resolveOpencodeModelsUrl({env:{OPENCODE_MODELS_URL:"http://127.0.0.1:8791/models"}})).toBe("http://127.0.0.1:8791/models");
});
test("legacy anonymous inference requires an explicit configured origin", () => {
  expect(readRelaySettings({}).disabledByEnvironment).toBe(true);
  expect(readRelaySettings({OPENWORK_FREE_INFERENCE_ORIGIN:"https://inference.example.test"}).disabledByEnvironment).toBe(false);
});

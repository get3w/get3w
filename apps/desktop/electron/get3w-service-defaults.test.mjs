import { test } from "node:test";
import assert from "node:assert/strict";
import { initOpenworkSentry, setOpenworkSentrySession, captureException } from "./sentry.mjs";
test("Get3W native telemetry stays inactive even with a signed-in session", async () => {
  assert.equal(await initOpenworkSentry({ app: null, distribution: null, packageMetadata: null }), false);
  assert.equal(setOpenworkSentrySession({ userId: "test" }), false);
  assert.equal(captureException(new Error("sensitive test error")), false);
});

test("Get3W authentication defaults use Get3W services and reject legacy credential targets", async () => {
  const { GET3W_SERVICES, validateGet3wOrigin } = await import("./get3w-services.mjs");
  assert.equal(GET3W_SERVICES.cloudBase, "https://cloud.get3w.com");
  assert.equal(GET3W_SERVICES.webBase, "https://get3w.com");
  assert.equal(Object.hasOwn(GET3W_SERVICES, "apiBase"), false);
  for (const origin of ["https://api.openwork.com", "https://app.openworklabs.com", "https://openwork.com."]) {
    assert.throws(() => validateGet3wOrigin(origin), /unavailable in Get3W/);
  }
  assert.equal(validateGet3wOrigin("http://127.0.0.1:6604"), "http://127.0.0.1:6604");
});

test("resolveGet3wOrigins reads only GET3W_CLOUD_ORIGIN in development", async () => {
  const { resolveGet3wOrigins } = await import("./get3w-services.mjs");
  assert.deepEqual(resolveGet3wOrigins({ isPackaged: false, env: {} }), { cloudBase: "https://cloud.get3w.com", webBase: "https://get3w.com" });
  assert.deepEqual(resolveGet3wOrigins({ isPackaged: false, env: {
    GET3W_CLOUD_ORIGIN: " http://127.0.0.1:6605 ", GET3W_AUTH_WEB_ORIGIN: "http://127.0.0.1:7700",
    GET3W_AUTH_API_ORIGIN: "http://127.0.0.1:1", GET3W_GATEWAY_API_ORIGIN: "http://127.0.0.1:2",
  } }), { cloudBase: "http://127.0.0.1:6605", webBase: "http://127.0.0.1:7700" });
});

test("resolveGet3wOrigins ignores env in packaged builds and only trusts local validation metadata", async () => {
  const { resolveGet3wOrigins } = await import("./get3w-services.mjs");
  const env = { GET3W_CLOUD_ORIGIN: "http://127.0.0.1:6605" };
  const packageMetadata = { openworkAuthOrigins: { cloudBase: "http://127.0.0.1:6605", webBase: "http://127.0.0.1:7700", apiBase: "x" } };
  assert.deepEqual(resolveGet3wOrigins({ isPackaged: true, env, packageMetadata }), {});
  assert.deepEqual(resolveGet3wOrigins({ isPackaged: true, env, packageMetadata, localValidation: true }), { cloudBase: "http://127.0.0.1:6605", webBase: "http://127.0.0.1:7700" });
});

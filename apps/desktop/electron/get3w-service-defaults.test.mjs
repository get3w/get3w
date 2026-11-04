import { test } from "node:test";
import assert from "node:assert/strict";
import { initOpenworkSentry, setOpenworkSentrySession, captureException } from "./sentry.mjs";
test("Get3W native telemetry stays inactive even with a signed-in session", async () => {
  assert.equal(await initOpenworkSentry({ app: null, distribution: null, packageMetadata: null }), false);
  assert.equal(setOpenworkSentrySession({ userId: "test", orgId: "test" }), false);
  assert.equal(captureException(new Error("sensitive test error")), false);
});

test("Get3W authentication defaults use Get3W services and reject legacy credential targets", async () => {
  const { GET3W_SERVICES, validateGet3wOrigin } = await import("./get3w-services.mjs");
  assert.equal(GET3W_SERVICES.apiBase, "https://api.get3w.com");
  assert.equal(GET3W_SERVICES.webBase, "https://get3w.com");
  for (const origin of ["https://api.openwork.com", "https://app.openworklabs.com", "https://openwork.com."]) {
    assert.throws(() => validateGet3wOrigin(origin), /unavailable in Get3W/);
  }
  assert.equal(validateGet3wOrigin("http://127.0.0.1:6604"), "http://127.0.0.1:6604");
});

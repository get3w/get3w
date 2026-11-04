import { test } from "node:test";
import assert from "node:assert/strict";
import { assertGet3wServiceTarget } from "./get3w-egress.mjs";
import { fetchFiniteDesktopHttp } from "./finite-http-fetch.mjs";
test("legacy service requests fail before sending saved credentials", async () => {
  let sent = 0;
  for (const host of ["api.openwork.com", "openwork.com.", "api.openworklabs.com", "app.openwork.software", "openworklabs.com."]) {
    await assert.rejects(Promise.resolve().then(() => fetchFiniteDesktopHttp(`https://${host}/api`, {headers:{Authorization:"Bearer fixture"}}, async () => {sent++;})), /unavailable in Get3W/);
  }
  assert.equal(sent, 0);
});
test("Get3W, localhost and user-configured third-party services remain possible", () => {
  for (const url of ["https://api.get3w.com", "http://127.0.0.1:6604", "https://api.openai.com", "https://openworklabs.com.example.test"]) assert.doesNotThrow(() => assertGet3wServiceTarget(url));
});

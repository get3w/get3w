import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { loadStartupUrl } from "./startup-navigation.mjs";

function contents(url = "http://localhost:5173/") {
  const events = new EventEmitter();
  const error = Object.assign(new Error("aborted"), { code: "ERR_ABORTED" });
  return Object.assign(events, {
    loadURL: async () => { throw error; },
    getURL: () => url,
    isDestroyed: () => false,
    isLoadingMainFrame: () => true,
  });
}

test("startup reload waits for its replacement navigation and removes listeners", async () => {
  const web = contents();
  const pending = loadStartupUrl(web, web.getURL());
  await new Promise(resolve => setImmediate(resolve));
  web.emit("did-fail-load", {}, -3, "aborted", web.getURL(), true);
  assert.equal(web.listenerCount("did-finish-load"), 1);
  web.emit("did-finish-load");
  await pending;
  assert.equal(web.eventNames().length, 0);
});

test("replacement load errors and unexpected destinations remain failures", async () => {
  const web = contents();
  const pending = loadStartupUrl(web, web.getURL());
  await new Promise(resolve => setImmediate(resolve));
  web.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", web.getURL(), true);
  await assert.rejects(pending, /NAME_NOT_RESOLVED/);
  assert.equal(web.eventNames().length, 0);
  await assert.rejects(loadStartupUrl(contents("https://example.com"), "http://localhost:5173/"), /aborted/);
});

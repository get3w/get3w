import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBrandAppName } from "./brand-app-name.mjs";

test("local package preserves executable title so macOS can resolve its bundle", () => {
  const runtimeProcess = { title: "/Applications/Get3W Local.app/Contents/MacOS/Get3W Local" };
  const before = runtimeProcess.title;
  const labels = [];
  applyBrandAppName(null, {
    fallbackName: "Get3W Local", platform: "darwin", updateProcessTitle: false,
    updateElectronAppName: true, runtimeProcess,
    app: { setName: (name) => labels.push(name) },
    applicationMenu: { setAppName: (name) => labels.push(name) },
  });
  assert.equal(runtimeProcess.title, before);
  assert.deepEqual(labels, ["Get3W Local", "Get3W Local"]);
});

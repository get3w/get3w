import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { migrateGet3wStorage, migrateStoragePath } from "./get3w-storage-migration.mjs";
import { desktopBootstrapPath, openworkConfigDir, openworkServerDataDir } from "../../../packages/paths/index.mjs";

test("Get3W defaults use branded directories on every platform and honor overrides", () => {
  for (const platform of ["darwin", "linux", "win32"]) {
    const paths = platform === "win32" ? path.win32 : path.posix;
    const homeDir = platform === "win32" ? "C:\\Users\\test" : "/home/test";
    const opts = { platform, homeDir, env: {} };
    assert.equal(openworkConfigDir(opts), paths.join(homeDir, platform === "win32" ? "AppData/Roaming" : ".config", "get3w"));
    assert.equal(openworkServerDataDir(opts), paths.join(homeDir, ".get3w", "get3w-server"));
    assert.equal(desktopBootstrapPath({ ...opts, userDataDir: homeDir, env: { GET3W_DEV_MODE: "1" } }), paths.join(homeDir, "get3w-dev-data", "home", ".config", "get3w", "desktop-bootstrap.json"));
    const explicit = paths.join(homeDir, "custom-openwork-data");
    assert.equal(openworkServerDataDir({ ...opts, env: { GET3W_DATA_DIR: explicit } }), explicit);
  }
});

test("storage migration preserves history and credentials, is repeatable, and keeps conflicts", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "get3w-storage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const userDataDir = path.join(root, "profile");
  const home = path.join(root, "home");
  const files = [
    [path.join(home, ".config/openwork/server.json"), path.join(home, ".config/get3w/server.json")],
    [path.join(home, ".openwork/openwork-server/history.db"), path.join(home, ".get3w/get3w-server/history.db")],
    [path.join(userDataDir, "openwork-dev-data/xdg/config/openwork/env.json"), path.join(userDataDir, "get3w-dev-data/xdg/config/get3w/env.json")],
    [path.join(userDataDir, "openwork-server-tokens.json"), path.join(userDataDir, "get3w-server-tokens.json")],
    [path.join(userDataDir, "local-runtime/openwork/data/history.db"), path.join(userDataDir, "local-runtime/get3w/data/history.db")],
  ];
  for (const [old] of files) { mkdirSync(path.dirname(old), { recursive: true }); writeFileSync(old, "private-state"); }
  const opts = { userDataDir, env: { HOME: home }, platform: "darwin" };
  migrateGet3wStorage(opts);
  migrateGet3wStorage(opts);
  for (const [old, target] of files) { assert.equal(existsSync(old), false); assert.equal(readFileSync(target, "utf8"), "private-state"); }
  const source = path.join(root, "old"); const target = path.join(root, "new");
  mkdirSync(source); mkdirSync(target);
  writeFileSync(path.join(source, "same"), "older"); writeFileSync(path.join(target, "same"), "newer");
  writeFileSync(path.join(source, "missing"), "history");
  migrateStoragePath(source, target);
  assert.equal(readFileSync(path.join(source, "same"), "utf8"), "older");
  assert.equal(readFileSync(path.join(target, "same"), "utf8"), "newer");
  assert.equal(readFileSync(path.join(target, "missing"), "utf8"), "history");
  symlinkSync(target, path.join(root, "link"));
  migrateStoragePath(path.join(root, "link"), path.join(root, "other"));
  assert.equal(existsSync(path.join(root, "other")), false);
});

import { expect, test } from "bun:test";
import { STABLE_UPDATER_ENDPOINT, ALPHA_UPDATER_ENDPOINT } from "../src/app/lib/release-channels";
import { ELECTRON_ALPHA_RELEASE_PAGE_URL, parseElectronLatestMacYml } from "../src/app/lib/electron-alpha";
import { devDenProxy } from "../dev-den-proxy";

test("release metadata and relative artifacts stay on the Get3W release origin", () => {
  for (const value of [STABLE_UPDATER_ENDPOINT, ALPHA_UPDATER_ENDPOINT, ELECTRON_ALPHA_RELEASE_PAGE_URL]) {
    expect(new URL(value).origin).toBe("https://get3w.com");
  }
  const artifact = parseElectronLatestMacYml("version: 1.2.3\npath: get3w-mac-arm64-1.2.3.zip\nsha512: fixture-checksum", "arm64");
  expect(artifact.url).toBe("https://get3w.com/desktop/releases/download/alpha-macos-latest/get3w-mac-arm64-1.2.3.zip");
});

test("development server cannot restore a retired organization proxy from old environment settings", () => {
  expect(devDenProxy({ OPENWORK_DEV_HEADLESS_DEN_TARGET: "https://app.openworklabs.com" })).toEqual({});
});

test("old or external artifact URLs cannot restore upstream update downloads", () => {
  for (const url of ["https://github.com/different-ai/openwork/releases/download/v1.2.3/app.zip", "https://example.test/app.zip", "https://get3w.com/other/app.zip"]) {
    expect(() => parseElectronLatestMacYml(`version: 1.2.3\npath: ${url}\nsha512: fixture-checksum`, "arm64")).toThrow("Get3W release service");
  }
});

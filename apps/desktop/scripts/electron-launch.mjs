import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, renameSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const developmentIcon = path.join(desktopRoot, "resources/icons/dev/icon-dev.icns");

// Notification Center reads the bundle icon, independently of app.dock.setIcon.
export function applyDevelopmentBundleIcon(bundle) {
  const resources = path.join(bundle, "Contents", "Resources");
  mkdirSync(resources, { recursive: true });
  copyFileSync(developmentIcon, path.join(resources, "get3w.icns"));
  // Existing notification registrations may still reference Electron's old
  // resource name. Keep that resource branded too, without resetting consent.
  copyFileSync(developmentIcon, path.join(resources, "electron.icns"));
  const plist = path.join(bundle, "Contents", "Info.plist");
  execFileSync("/usr/bin/plutil", ["-replace", "CFBundleIconFile", "-string", "get3w.icns", plist]);
  // An inherited asset-catalog name can override CFBundleIconFile.
  const namedIcon = spawnSync("/usr/bin/plutil", ["-extract", "CFBundleIconName", "raw", plist], { stdio: "ignore" });
  if (namedIcon.status === 0) execFileSync("/usr/bin/plutil", ["-remove", "CFBundleIconName", plist]);
}

// Match the executable identity to the bundle, not the upstream Electron runtime.
export function applyDevelopmentExecutableIdentity(bundle) {
  const directory = path.join(bundle, "Contents", "MacOS");
  const original = path.join(directory, "Electron");
  const branded = path.join(directory, "Get3W");
  if (existsSync(original)) renameSync(original, branded);
  if (!existsSync(branded)) throw new Error("Get3W development executable is missing");
  execFileSync("/usr/bin/plutil", ["-replace", "CFBundleExecutable", "-string", "Get3W", path.join(bundle, "Contents", "Info.plist")]);
}

// app.setName changes Electron's menus, but macOS Dock reads the bundle name.
// Keep the dependency bundle untouched and launch a separately branded copy.
export function developmentElectronExecutable() {
  const executable = require("electron");
  if (process.platform !== "darwin") return executable;

  const source = realpathSync(path.resolve(executable, "../../.."));
  const cache = path.join(desktopRoot, ".electron-runtime", "dev");
  const bundle = path.join(cache, "Get3W.app");
  const marker = path.join(cache, "bundle-version.json");
  const fingerprint = JSON.stringify({ source, version: require("electron/package.json").version, revision: 4, iconSha256: createHash("sha256").update(readFileSync(developmentIcon)).digest("hex") });
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== fingerprint || !existsSync(bundle)) {
    mkdirSync(cache, { recursive: true });
    execFileSync("/bin/rm", ["-rf", bundle]);
    execFileSync("/usr/bin/ditto", [source, bundle]);
    const plist = path.join(bundle, "Contents", "Info.plist");
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("/usr/bin/plutil", ["-replace", key, "-string", "Get3W", plist]);
    }
    execFileSync("/usr/bin/plutil", ["-replace", "CFBundleIdentifier", "-string", "com.get3w.desktop.dev", plist]);
    applyDevelopmentBundleIcon(bundle);
    applyDevelopmentExecutableIdentity(bundle);
    execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "inherit" });
    writeFileSync(marker, fingerprint);
  }
  // System Settings resolves notification icons through Launch Services, which
  // can retain Electron's registration even after the bundle icon is replaced.
  const registration = spawnSync(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", bundle],
    { encoding: "utf8" },
  );
  if (registration.error || registration.status !== 0) {
    console.warn("[desktop] Could not refresh macOS application registration:", registration.error?.message || registration.stderr?.trim());
  }
  return path.join(bundle, "Contents", "MacOS", "Get3W");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = spawn(developmentElectronExecutable(), process.argv.slice(2), { stdio: "inherit" });
  child.on("error", (error) => { console.error(error); process.exitCode = 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGINT" ? 130 : 143)));
}

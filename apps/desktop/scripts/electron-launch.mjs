import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// app.setName changes Electron's menus, but macOS Dock reads the bundle name.
// Keep the dependency bundle untouched and launch a separately branded copy.
export function developmentElectronExecutable() {
  const executable = require("electron");
  if (process.platform !== "darwin") return executable;

  const source = realpathSync(path.resolve(executable, "../../.."));
  const cache = path.join(desktopRoot, ".electron-runtime", "dev");
  const bundle = path.join(cache, "Get3W.app");
  const marker = path.join(cache, "bundle-version.json");
  const fingerprint = JSON.stringify({ source, version: require("electron/package.json").version, revision: 1 });
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== fingerprint || !existsSync(bundle)) {
    mkdirSync(cache, { recursive: true });
    execFileSync("/bin/rm", ["-rf", bundle]);
    execFileSync("/usr/bin/ditto", [source, bundle]);
    const plist = path.join(bundle, "Contents", "Info.plist");
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("/usr/bin/plutil", ["-replace", key, "-string", "Get3W", plist]);
    }
    execFileSync("/usr/bin/plutil", ["-replace", "CFBundleIdentifier", "-string", "com.get3w.desktop.dev", plist]);
    execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "inherit" });
    writeFileSync(marker, fingerprint);
  }
  return path.join(bundle, "Contents", "MacOS", "Electron");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = spawn(developmentElectronExecutable(), process.argv.slice(2), { stdio: "inherit" });
  child.on("error", (error) => { console.error(error); process.exitCode = 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGINT" ? 130 : 143)));
}

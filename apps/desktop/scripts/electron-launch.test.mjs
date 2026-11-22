import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { applyDevelopmentBundleIcon, applyDevelopmentExecutableIdentity } from "./electron-launch.mjs";

test("macOS notification icon resolves to the Get3W bundle resource", { skip: process.platform !== "darwin" }, () => {
  const bundle = mkdtempSync(path.join(tmpdir(), "get3w-notification-icon-"));
  try {
    mkdirSync(path.join(bundle, "Contents"));
    const plist = path.join(bundle, "Contents/Info.plist");
    writeFileSync(plist, '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIconFile</key><string>electron.icns</string><key>CFBundleIconName</key><string>Electron</string></dict></plist>');
    applyDevelopmentBundleIcon(bundle);
    assert.equal(execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIconFile", "raw", plist], { encoding: "utf8" }).trim(), "get3w.icns");
    assert.deepEqual(readFileSync(path.join(bundle, "Contents/Resources/get3w.icns")), readFileSync(new URL("../resources/icons/dev/icon-dev.icns", import.meta.url)));
    assert.deepEqual(readFileSync(path.join(bundle, "Contents/Resources/electron.icns")), readFileSync(path.join(bundle, "Contents/Resources/get3w.icns")));
    assert.equal(JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" })).CFBundleIconName, undefined);
    applyDevelopmentBundleIcon(bundle); // Also works when the optional key is absent.
  } finally { rmSync(bundle, { recursive: true, force: true }); }
});

test("development executable and plist share the Get3W identity",{skip:process.platform!=="darwin"},()=>{
 const bundle=mkdtempSync(path.join(tmpdir(),"get3w-executable-icon-"));
 try{
  mkdirSync(path.join(bundle,"Contents/MacOS"),{recursive:true});
  writeFileSync(path.join(bundle,"Contents/Info.plist"),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>');
  writeFileSync(path.join(bundle,"Contents/MacOS/Electron"),"fixture");
  applyDevelopmentExecutableIdentity(bundle);applyDevelopmentExecutableIdentity(bundle);
  assert.equal(readFileSync(path.join(bundle,"Contents/MacOS/Get3W"),"utf8"),"fixture");
  assert.equal(execFileSync("/usr/bin/plutil",["-extract","CFBundleExecutable","raw",path.join(bundle,"Contents/Info.plist")],{encoding:"utf8"}).trim(),"Get3W");
 }finally{rmSync(bundle,{recursive:true,force:true});}
});

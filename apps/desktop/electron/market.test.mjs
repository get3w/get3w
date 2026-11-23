import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDesktopMarket, marketUpdateFeed } from "./market.mjs";
import { resolveGet3wOrigins } from "./get3w-services.mjs";
import { assertMarketUpdateInfo, targetedStableUpdaterFeed, registerUpdaterIpc } from "./updater.mjs";
import { selectRecoveryArtifact, cacheVerifiedRecoveryArtifact, readCachedRecoveryArtifact } from "./recovery.mjs";
import { createHash } from "node:crypto";
import { createGet3wAuth } from "./get3w-auth.mjs";

for (const market of ["cn", "global"]) {
  const config = resolveDesktopMarket(market);
  test(`${market}: package fixes language, auth and version feeds`, () => {
    assert.equal(config.defaultLanguage, market === "cn" ? "zh" : "en");
    const origins = resolveGet3wOrigins({isPackaged:true,packageMetadata:{market},env:{GET3W_AUTH_WEB_ORIGIN:"https://evil.invalid"}});
    assert.equal(origins.webBase, config.webOrigin);
    assert.equal(marketUpdateFeed(market), `${config.releaseBase}/latest/download`);
    assert.equal(targetedStableUpdaterFeed("1.0.0","1.1.0",false,market), `${config.releaseBase}/download/v1.1.0`);
  });
  test(`${market}: login opens package website without changing cloud API`, async () => {
    const userData=await mkdtemp(path.join(os.tmpdir(),"market-auth-"));
    const urls=[], calls=[];
    const auth=createGet3wAuth({userData,webBase:config.webOrigin,safeStorage:{isAsyncEncryptionAvailable:async()=>true},openExternal:async url=>urls.push(url),
      fetchImpl:async url=>{calls.push(url);return Response.json(url.endsWith("/requests")?{request_id:"request-handle",expires_in:300}:{contract_version:"personal-account-v1"});}});
    try {
      await auth.begin();
      assert.ok(urls[0].startsWith(`${config.webOrigin}/desktop-connect?`));
      assert.ok(calls.every(url=>url.startsWith("https://cloud.get3w.com/")));
    } finally { await rm(userData,{recursive:true,force:true}); }
  });
  test(`${market}: updater never falls back to the other market`, async () => {
    const handlers=new Map(), feeds=[];
    const app={isPackaged:true,getVersion:()=> "1.0.0",getPath:()=>os.tmpdir()};
    const updater={on(){},setFeedURL:feed=>feeds.push(feed.url),checkForUpdates:async()=>{throw Error("offline")}};
    registerUpdaterIpc({app,market,ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getMainWindow:()=>null,loadAutoUpdater:async()=>({autoUpdater:updater})});
    await handlers.get("get3w:updater:check")({});
    assert.ok(feeds.length>0);
    assert.ok(feeds.every(url=>url.startsWith(config.webOrigin)));
  });
  test(`${market}: recovery rejects opposite packages and cached installers`, async () => {
    const bytes=Buffer.from("signed-fixture"), sha512=createHash("sha512").update(bytes).digest("base64");
    const identity={version:"1.1.0",platform:"darwin",arch:"arm64",distribution:"public",market};
    const file={url:`get3w-${market}-mac-arm64-1.1.0.dmg`,sha512};
    const artifact=selectRecoveryArtifact([file],identity);
    assert.ok(artifact);
    assert.equal(selectRecoveryArtifact([{...file,url:file.url.replace(market,market==="cn"?"global":"cn")}],identity),null);
    assert.equal(selectRecoveryArtifact([{...file,url:`https://${market==="cn"?"get3w.ai":"get3w.com"}/desktop/releases/download/v1.1.0/${file.url}`}],identity),null);
    const userData=await mkdtemp(path.join(os.tmpdir(),"market-recovery-")),app={getPath:()=>userData};
    try {
      await cacheVerifiedRecoveryArtifact({app,artifact,fetchArtifact:async()=>new Response(bytes)});
      assert.ok(await readCachedRecoveryArtifact(app,identity));
      assert.equal(await readCachedRecoveryArtifact(app,{...identity,market:market==="cn"?"global":"cn"}),null);
    } finally {await rm(userData,{recursive:true,force:true});}
  });
}
test("legacy package defaults to China and unknown market fails closed",()=>{
 assert.equal(resolveDesktopMarket().market,"cn");
 assert.throws(()=>resolveDesktopMarket("other"));
});

for (const market of ["cn", "global"]) {
  test(`${market}: regular and targeted updates reject foreign manifests`, () => {
    const config = resolveDesktopMarket(market);
    const good = {version:"1.1.0",files:[{url:`${config.artifactPrefix}mac-arm64-1.1.0.zip`}]};
    assert.doesNotThrow(()=>assertMarketUpdateInfo(good,market));
    assert.throws(()=>assertMarketUpdateInfo({...good,files:[{url:"get3w-mac-arm64-1.1.0.zip"}]},market));
    assert.throws(()=>assertMarketUpdateInfo({...good,files:[{url:`https://evil.invalid/${good.files[0].url}`}]},market));
    assert.throws(()=>assertMarketUpdateInfo({...good,files:[]},market));
  });
}

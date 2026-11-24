
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveDesktopMarket } from "../electron/market.mjs";

const config = resolveDesktopMarket(process.argv[2]);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["--dir", "apps/desktop", "exec", "electron-builder", "--config", "electron-builder.yml",
  `--config.artifactName=get3w-${config.market}-${'${os}'}-${'${arch}'}-${'${version}'}.${'${ext}'}`,
  `--config.extraMetadata.market=${config.market}`, `--config.publish.url=${config.releaseBase}/latest/download`,
  ...process.argv.slice(3)], { cwd: resolve(import.meta.dirname, "../../.."), stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function buildOpencodeV2({ source, outdir, version, target }) {
  if (!source || !outdir || !version) throw new Error("Provide --source, --outdir and --version");
  if (!/^\d+\.\d+\.\d+[-.\w]*$/.test(version)) throw new Error("Invalid build version");
  const native = process.platform === "darwin" ? "apple-darwin" : process.platform === "linux" ? "unknown-linux-gnu" : "pc-windows-msvc";
  const triple = target ?? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-${native}`;
  const platform = triple.includes("apple-darwin") ? "darwin" : triple.includes("windows") ? "windows" : triple.includes("linux") ? "linux" : null;
  if (!platform || !/^(aarch64|x86_64)-/.test(triple)) throw new Error("Unsupported target");
  const buildTarget = `${platform}-${triple.startsWith("aarch64") ? "arm64" : "x64-baseline"}${triple.includes("musl") ? "-musl" : ""}`;
  const root = resolve(source);
  const output = resolve(outdir);
  if (output === root || root.startsWith(output + "/")) throw new Error("Build output must not contain engine source");
  // Install the committed graph through pnpm; the upstream Bun installer is skipped.
  execFileSync("pnpm", ["install", "--frozen-lockfile", "--filter", "@opencode/cli...", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
  execFileSync("pnpm", ["dlx", "bun@1.4.5", "run", "script/build.ts", "--skip-install", "--skip-web-ui", `--outdir=${join(output, "build")}`], {
    cwd: join(root, "packages/cli"), stdio: "inherit",
    env: { ...process.env, OPENCODE_CHANNEL: "get3w", OPENCODE_VERSION: version, OPENCODE_TARGET: buildTarget },
  });
  // Desktop serves its own UI. Only the upstream web archive is omitted; the
  // complete CLI commands, plugins, migrations and native assets are embedded.
  const directory = join(output, triple);
  await mkdir(directory, { recursive: true });
  const name = platform === "windows" ? "opencode.exe" : "opencode";
  await copyFile(join(output, "build", `cli-${buildTarget}`, "bin", name), join(directory, name));
  const bytes = await readFile(join(directory, name));
  await copyFile(join(root, "LICENSE"), join(directory, "LICENSE"));
  const manifest = { schema: 1, target: triple, version, binary: name, sha256: createHash("sha256").update(bytes).digest("hex"), sourceRevision: "anomalyco-opencode-1097e26", entrypoint: "packages/cli/src/index.ts", bun: "1.4.5", webUi: false };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Source-built engine: ${join(directory, "manifest.json")}`);
  return directory;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i=arg.indexOf("="); if(i<3 || !arg.startsWith("--"))throw new Error("Use --name=value arguments"); return [arg.slice(2,i),arg.slice(i+1)]; }));
  await buildOpencodeV2(args);
}

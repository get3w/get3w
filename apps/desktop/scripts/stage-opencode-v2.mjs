import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

// Explicit local build input; default release downloads remain pinned separately.
export async function stageOpencodeV2(manifestPath, sidecarDir, target) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema !== 1 || manifest.target !== target || typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+[-.\w]*$/.test(manifest.version) || typeof manifest.binary !== "string" || basename(manifest.binary) !== manifest.binary || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error("Invalid source-built OpenCode v2 manifest or target");
  const source = resolve(manifestPath, "..", manifest.binary);
  const bytes = await readFile(source);
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) throw new Error("Source-built OpenCode v2 checksum mismatch");
  const name = target.includes("windows") ? "opencode2.exe" : "opencode2";
  await mkdir(sidecarDir, { recursive: true });
  const binary = join(sidecarDir, name);
  await copyFile(source, binary);
  await chmod(binary, 0o755);
  if (process.platform === "darwin" && target.includes("apple-darwin")) execFileSync("codesign", ["--force", "--sign", "-", binary]);
  await writeFile(join(sidecarDir, "opencode2-integrity.json"), JSON.stringify({ source: "get3w-build", version: manifest.version, target, sha256: createHash("sha256").update(await readFile(binary)).digest("hex") }));
  return binary;
}

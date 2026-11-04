import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const RECOVERY_STATE_FILENAME = "app-recovery.v1.json";
const RECOVERY_CACHE_DIRECTORY = "app-recovery-cache";
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

function stableVersion(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^v/i, "");
  return STABLE_VERSION.test(normalized) ? normalized : null;
}

function compareStableVersions(left, right) {
  const a = stableVersion(left);
  const b = stableVersion(right);
  if (!a || !b) return null;
  const leftParts = a.split(".").map(Number);
  const rightParts = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

function statePath(app) {
  return path.join(app.getPath("userData"), RECOVERY_STATE_FILENAME);
}

export async function readRecoveryState(app, distribution) {
  try {
    const parsed = JSON.parse(await readFile(statePath(app), "utf8"));
    if (parsed?.distribution !== distribution) return { currentVersion: null, previousVersion: null };
    return {
      currentVersion: stableVersion(parsed.currentVersion),
      previousVersion: stableVersion(parsed.previousVersion),
    };
  } catch {
    return { currentVersion: null, previousVersion: null };
  }
}

export async function recordHealthyVersion(app, distribution, rawVersion) {
  const version = stableVersion(rawVersion);
  if (!version) throw new Error("Healthy app version must use the stable x.y.z format.");
  const previous = await readRecoveryState(app, distribution);
  const state = {
    distribution,
    currentVersion: version,
    previousVersion: previous.currentVersion && previous.currentVersion !== version
      ? previous.currentVersion
      : previous.previousVersion,
    writtenAt: new Date().toISOString(),
  };
  const outputPath = statePath(app);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return state;
}

export function recoveryManifestName(platform, arch, distribution) {
  const channel = distribution === "public" ? "latest" : distribution;
  if (platform === "darwin") return `${channel}-mac.yml`;
  if (platform === "win32") return `${channel}.yml`;
  return `${channel}-linux${arch === "arm64" ? "-arm64" : ""}.yml`;
}

export function parseRecoveryManifest(raw) {
  const files = [];
  let current = null;
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const start = line.match(/^\s*-\s+url:\s*(.+?)\s*$/);
    if (start) {
      current = { url: start[1].trim().replace(/^['"]|['"]$/g, "") };
      files.push(current);
      continue;
    }
    const property = line.match(/^\s{4}([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (property && current) current[property[1]] = property[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return files;
}

function installerExtension(platform) {
  if (platform === "darwin") return ".dmg";
  if (platform === "win32") return ".exe";
  return ".AppImage";
}

function validRecoveryArtifactIdentity(artifact) {
  const version = stableVersion(artifact?.version);
  if (!version || artifact.version !== version) return false;
  if (!["darwin", "win32", "linux"].includes(artifact.platform)) return false;
  if (!["arm64", "x64"].includes(artifact.arch)) return false;
  if (!["public", "cloud", "enterprise"].includes(artifact.distribution)) return false;
  if (typeof artifact.url !== "string" || typeof artifact.sha512 !== "string" || !artifact.sha512.trim()) return false;
  let url;
  try {
    url = new URL(artifact.url);
  } catch {
    return false;
  }
  const prefix = `/desktop/releases/download/v${version}/`;
  if (url.protocol !== "https:" || url.hostname !== "get3w.com" || !url.pathname.startsWith(prefix)) return false;
  const assetArch = artifact.platform === "linux" && artifact.arch === "x64" ? "x86_64" : artifact.arch;
  const platformSlug = artifact.platform === "darwin" ? "mac" : artifact.platform === "win32" ? "win" : "linux";
  const fileName = path.basename(url.pathname);
  const distributionSlug = artifact.distribution === "public" ? "" : `${artifact.distribution}-`;
  return fileName === `get3w-${distributionSlug}${platformSlug}-${assetArch}-${version}${installerExtension(artifact.platform)}`;
}

export function selectRecoveryArtifact(files, { version, platform, arch, distribution }) {
  const normalizedVersion = stableVersion(version);
  if (!normalizedVersion || !["public", "cloud", "enterprise"].includes(distribution)) return null;
  const assetArch = platform === "linux" && arch === "x64" ? "x86_64" : arch;
  const extension = installerExtension(platform);
  const matching = files.filter((file) =>
    typeof file?.url === "string"
    && file.url.includes(`-${assetArch}-`)
    && file.url.endsWith(extension)
    && typeof file.sha512 === "string"
    && file.sha512.trim(),
  );
  const baseUrl = `https://get3w.com/desktop/releases/download/v${normalizedVersion}/`;
  for (const selected of matching) {
    const url = new URL(selected.url, baseUrl);
    if (url.origin !== "https://get3w.com" || !url.pathname.startsWith(`/desktop/releases/download/v${normalizedVersion}/`)) {
      continue;
    }
    const artifact = {
      version: normalizedVersion,
      platform,
      arch,
      distribution,
      url: url.toString(),
      sha512: selected.sha512.trim(),
    };
    return validRecoveryArtifactIdentity(artifact) ? artifact : null;
  }
  return null;
}

export async function compatibleRecoveryReleases({
  versions,
  currentVersion,
  previousVersion,
  minimumVersion,
  allowedVersions,
  resolveArtifact,
  limit = 5,
}) {
  const current = stableVersion(currentVersion);
  const previous = stableVersion(previousVersion);
  const minimum = stableVersion(minimumVersion);
  const allowed = Array.isArray(allowedVersions)
    ? new Set(allowedVersions.flatMap((value) => stableVersion(value) ?? []))
    : null;
  const filtered = [...new Set(Array.isArray(versions) ? versions.flatMap((value) => stableVersion(value) ?? []) : [])]
    .filter((version) => !minimum || compareStableVersions(version, minimum) >= 0)
    .filter((version) => !allowed || allowed.has(version))
    .sort((left, right) => compareStableVersions(right, left) ?? 0)
    .slice(0, limit);
  const releases = [];
  for (const version of filtered) {
    const artifact = await resolveArtifact(version);
    if (!artifact) continue;
    releases.push({
      id: version,
      version,
      marking: version === current ? "current" : version === previous ? "previous" : null,
      artifact,
      cachedFilePath: artifact.cachedFilePath ?? null,
    });
  }
  return releases;
}

export function recoveryVersionMarkers(installedVersion, persistedState) {
  const currentVersion = stableVersion(installedVersion);
  const persistedCurrent = stableVersion(persistedState?.currentVersion);
  const persistedPrevious = stableVersion(persistedState?.previousVersion);
  return {
    currentVersion,
    previousVersion: persistedCurrent && persistedCurrent !== currentVersion
      ? persistedCurrent
      : persistedPrevious,
  };
}

export async function cacheVerifiedRecoveryArtifact({ app, artifact, fetchArtifact }) {
  const response = await fetchArtifact(artifact.url);
  if (!response.ok) throw new Error(`Recovery download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksum = createHash("sha512").update(bytes).digest("base64");
  if (checksum !== artifact.sha512) throw new Error("Recovery installer checksum did not match its signed manifest.");
  const cacheDirectory = path.join(app.getPath("userData"), RECOVERY_CACHE_DIRECTORY);
  const stagingDirectory = `${cacheDirectory}.staging`;
  const backupDirectory = `${cacheDirectory}.backup`;
  const fileName = path.basename(new URL(artifact.url).pathname);
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  await writeFile(path.join(stagingDirectory, fileName), bytes);
  await writeFile(
    path.join(stagingDirectory, "metadata.json"),
    `${JSON.stringify({ ...artifact, checksum, fileName }, null, 2)}\n`,
    "utf8",
  );
  await rm(backupDirectory, { recursive: true, force: true });
  let previousMoved = false;
  try {
    await rename(cacheDirectory, backupDirectory);
    previousMoved = true;
  } catch {
    // No prior cache is the normal first-run case.
  }
  try {
    await rename(stagingDirectory, cacheDirectory);
  } catch (error) {
    if (previousMoved) await rename(backupDirectory, cacheDirectory).catch(() => undefined);
    throw error;
  }
  await rm(backupDirectory, { recursive: true, force: true });
  return path.join(cacheDirectory, fileName);
}

export async function verifyCachedRecoveryArtifact(filePath, artifact) {
  try {
    if (!validRecoveryArtifactIdentity(artifact)) return false;
    const bytes = await readFile(filePath);
    const metadata = JSON.parse(await readFile(path.join(path.dirname(filePath), "metadata.json"), "utf8"));
    const checksum = createHash("sha512").update(bytes).digest("base64");
    return metadata.version === artifact.version
      && metadata.platform === artifact.platform
      && metadata.arch === artifact.arch
      && metadata.distribution === artifact.distribution
      && metadata.url === artifact.url
      && metadata.sha512 === artifact.sha512
      && metadata.fileName === path.basename(filePath)
      && metadata.fileName === path.basename(new URL(artifact.url).pathname)
      && checksum === artifact.sha512;
  } catch {
    return false;
  }
}

export async function readCachedRecoveryArtifact(app, expected) {
  const directories = [
    path.join(app.getPath("userData"), RECOVERY_CACHE_DIRECTORY),
    path.join(app.getPath("userData"), `${RECOVERY_CACHE_DIRECTORY}.backup`),
  ];
  for (const directory of directories) {
    try {
      const metadata = JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8"));
      const artifact = {
        version: stableVersion(metadata.version),
        platform: typeof metadata.platform === "string" ? metadata.platform : null,
        arch: typeof metadata.arch === "string" ? metadata.arch : null,
        distribution: typeof metadata.distribution === "string" ? metadata.distribution : null,
        url: typeof metadata.url === "string" ? metadata.url : null,
        sha512: typeof metadata.sha512 === "string" ? metadata.sha512 : null,
      };
      if (
        !artifact.version
        || !artifact.url
        || !artifact.sha512
        || artifact.platform !== expected.platform
        || artifact.arch !== expected.arch
        || artifact.distribution !== expected.distribution
        || !validRecoveryArtifactIdentity(artifact)
      ) continue;
      const fileName = typeof metadata.fileName === "string" ? metadata.fileName : "";
      if (!fileName || fileName !== path.basename(fileName)) continue;
      const filePath = path.join(directory, fileName);
      if (!(await verifyCachedRecoveryArtifact(filePath, artifact))) continue;
      return { artifact, filePath };
    } catch {
      // Missing, incomplete, or tampered caches are ignored.
    }
  }
  return null;
}

export { compareStableVersions, stableVersion };

#!/usr/bin/env bash
# Mirror a Desktop GitHub Release to Tencent COS, then mark it Latest.
#
# Usage: scripts/release/mirror-cos.sh <VERSION>   (e.g. 0.1.5 or v0.1.5)
#
# Runs locally with your own coscli (~/.cos.yaml) and tccli credentials, so no
# COS key lives in GitHub. CI leaves the release as a draft; this script copies
# its files unchanged, verifies the mirror, and only then publishes it.
set -euo pipefail

VERSION="${1:-}"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 <X.Y.Z>" >&2; exit 2; }
TAG="v$VERSION"
REPO="${GET3W_RELEASE_REPO:-get3w/get3w}"
BUCKET="${GET3W_COS_BUCKET:-get3w-web-1252164560}"
ZONE_ID="${GET3W_EDGEONE_ZONE_ID:-zone-3o5tb67y8t5u}"
SITE="${GET3W_SITE:-https://get3w.com}"
ROUTINES="${GET3W_COS_ROUTINES:-4}"

for bin in gh coscli tccli curl shasum; do
  command -v "$bin" >/dev/null || { echo "missing required tool: $bin" >&2; exit 1; }
done

WORK="${TMPDIR:-/tmp}/get3w-mirror/$TAG"
SRC="$WORK/src"
rm -rf "$WORK/manual" "$WORK/updater-bin" "$WORK/updater-meta"
mkdir -p "$SRC" "$WORK/manual" "$WORK/updater-bin" "$WORK/updater-meta"

echo "==> Downloading $TAG from $REPO"
gh release download "$TAG" -R "$REPO" --clobber --dir "$SRC" \
  -p 'get3w-mac-*.dmg' -p 'get3w-mac-*.zip' -p 'get3w-win-*.exe' -p '*.blockmap' \
  -p 'latest-mac.yml' -p 'latest.yml' -p SHA256SUMS -p release.json
(cd "$SRC" && shasum -a 256 -c SHA256SUMS --ignore-missing --quiet)
for f in latest-mac.yml latest.yml; do
  grep -qx "version: $VERSION" "$SRC/$f" || { echo "$f is not version $VERSION" >&2; exit 1; }
done

# Hard links keep the staged sets free of extra copies of ~1 GB of installers.
ln "$SRC"/get3w-mac-*.dmg "$SRC"/get3w-win-*.exe "$SRC"/SHA256SUMS "$SRC"/release.json "$WORK/manual/"
ln "$SRC"/get3w-mac-*.zip "$SRC"/get3w-win-*.exe "$SRC"/*.blockmap "$WORK/updater-bin/"
ln "$SRC"/latest-mac.yml "$SRC"/latest.yml "$SRC"/release.json "$WORK/updater-meta/"

sync_dir() {
  echo "==> $1 -> cos://$BUCKET/$2/"
  # coscli writes coscli.log and coscli_output/ into the cwd; keep them in $WORK.
  (cd "$WORK" && coscli sync "$1/" "cos://$BUCKET/$2/" -r --routines "$ROUTINES" \
    --fail-output-path "$WORK/coscli-fail")
}

sync_dir "$WORK/manual" "download/releases/$TAG"
sync_dir "$WORK/updater-bin" "desktop/releases/$TAG"
sync_dir "$WORK/updater-meta" "desktop/releases/$TAG"
# Upload binaries before manifests so /latest never points at a missing file.
sync_dir "$WORK/updater-bin" "desktop/releases/latest/download"
sync_dir "$WORK/updater-meta" "desktop/releases/latest/download"

echo "==> Purging EdgeOne cache for the latest updater feed"
tccli teo CreatePurgeTask --ZoneId "$ZONE_ID" --Type purge_prefix \
  --Targets "[\"$SITE/desktop/releases/latest/download/\"]" >/dev/null

echo "==> Verifying public mirror"
fetch_real() {
  local body
  body=$(curl -fsSL --retry 3 --retry-all-errors "$1") || { echo "not reachable: $1" >&2; return 1; }
  [[ -n "$body" ]] && ! head -c 512 <<<"$body" | grep -Eiq '<!doctype html|<html' \
    || { echo "HTML fallback instead of file: $1" >&2; return 1; }
  printf '%s' "$body"
}
for f in latest-mac.yml latest.yml; do
  for attempt in 1 2 3 4 5 6; do
    fetch_real "$SITE/desktop/releases/latest/download/$f" | grep -qx "version: $VERSION" && break
    [[ $attempt == 6 ]] && { echo "$f on mirror is not $VERSION" >&2; exit 1; }
    sleep 10
  done
done
fetch_real "$SITE/download/releases/$TAG/SHA256SUMS" >/dev/null
for f in "$WORK"/manual/* "$WORK"/updater-bin/*; do
  dir=download/releases/$TAG
  [[ "$f" == */updater-bin/* ]] && dir=desktop/releases/latest/download
  # EdgeOne answers missing paths with 302 -> /index.html, so require a real 200.
  code=$(curl -sI --retry 3 --retry-all-errors -o /dev/null -w '%{http_code}' "$SITE/$dir/$(basename "$f")")
  [[ "$code" == 200 ]] || { echo "missing on mirror ($code): $dir/$(basename "$f")" >&2; exit 1; }
done

echo "==> Marking $TAG as published + Latest"
gh release edit "$TAG" -R "$REPO" --draft=false --latest
echo "Done. Next: update the download page (deploy-desktop.md, 'Update the Download Page')."

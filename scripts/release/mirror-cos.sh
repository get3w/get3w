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
ROUTINES="${GET3W_COS_ROUTINES:-4}"
for bin in gh coscli tccli curl shasum python3; do
  command -v "$bin" >/dev/null || { echo "missing required tool: $bin" >&2; exit 1; }
done
WORK=$(mktemp -d "${TMPDIR:-/tmp}/get3w-markets.XXXXXX")
SRC="$WORK/src"
mkdir -p "$SRC"
gh release download "$TAG" -R "$REPO" --dir "$SRC" \
  -p 'get3w-cn-*' -p 'get3w-global-*' -p 'cn-*' -p 'global-*'
python3 "$(dirname "$0")/stage-markets.py" "$SRC" "$WORK/staged" "$VERSION"

upload() {
  (cd "$WORK" && coscli sync "$1/" "cos://$2/$3/" -r --routines "$ROUTINES" \
    --fail-output-path "$WORK/coscli-fail")
}
# Stage both sets completely before changing either public feed.
for market in cn global; do
  bucket=get3w-web-1252164560
  [[ "$market" == global ]] && bucket=get3w-web-global-1252164560
  source="$WORK/staged/$market"
  mkdir -p "$WORK/$market-bin" "$WORK/$market-meta"
  for file in "$source"/get3w-*; do ln "$file" "$WORK/$market-bin/"; done
  for name in latest-mac.yml latest.yml release.json; do ln "$source/$name" "$WORK/$market-meta/"; done
  upload "$source" "$bucket" "download/releases/$TAG"
  upload "$source" "$bucket" "desktop/releases/download/$TAG"
  upload "$source" "$bucket" "desktop/releases/$TAG"
  upload "$WORK/$market-bin" "$bucket" "desktop/releases/latest/download"
  if [[ "$market" == cn ]]; then
    upload "$WORK/$market-bin" "$bucket" "desktop/releases/cn/latest/download"
    upload "$source" "$bucket" "desktop/releases/cn/download/$TAG"
  fi
done
# Legacy unsuffixed aliases are China packages with identical signed bytes.
upload "$WORK/staged/legacy" get3w-web-1252164560 "download/releases/$TAG"
upload "$WORK/staged/legacy" get3w-web-1252164560 "desktop/releases/download/$TAG"
upload "$WORK/staged/legacy" get3w-web-1252164560 "desktop/releases/$TAG"
for file in "$WORK/staged/legacy"/get3w-*; do ln "$file" "$WORK/cn-bin/"; done
upload "$WORK/cn-bin" get3w-web-1252164560 "desktop/releases/latest/download"
# Verify every uploaded binary against the local checksum before activating feeds.
for market in cn global; do
  site=https://get3w.com
  [[ "$market" == global ]] && site=https://get3w.ai
  for file in "$WORK/staged/$market"/get3w-*; do
    expected=$(shasum -a 256 "$file" | cut -d ' ' -f 1)
    actual=$(curl -fsSL --retry 3 "$site/desktop/releases/download/$TAG/$(basename "$file")" | shasum -a 256 | cut -d ' ' -f 1)
    [[ "$actual" == "$expected" ]] || { echo "Public checksum mismatch: $market/$(basename "$file")" >&2; exit 1; }
  done
done
# China manifest uses legacy aliases so older clients continue to work. New
# China clients require market names, so serve a separate market feed below.
upload "$WORK/cn-meta" get3w-web-1252164560 "desktop/releases/cn/latest/download"
upload "$WORK/staged/cn" get3w-web-1252164560 "desktop/releases/cn/download/$TAG"
upload "$WORK/global-meta" get3w-web-global-1252164560 "desktop/releases/latest/download"
mkdir "$WORK/legacy-meta"
for name in latest-mac.yml latest.yml release.json; do ln "$WORK/staged/legacy/$name" "$WORK/legacy-meta/"; done
upload "$WORK/legacy-meta" get3w-web-1252164560 "desktop/releases/latest/download"
for market in cn global; do
  site=https://get3w.com; zone=zone-3o5tb67y8t5u; feed=desktop/releases/cn/latest/download
  if [[ "$market" == global ]]; then site=https://get3w.ai; zone=zone-3xrpg5402syd; feed=desktop/releases/latest/download; fi
  tccli teo CreatePurgeTask --ZoneId "$zone" --Type purge_prefix --Targets "[\"$site/desktop/releases/\"]" >/dev/null
  for name in latest-mac.yml latest.yml; do
    curl -fsSL --retry 3 "$site/$feed/$name" | grep -qx "version: $VERSION"
  done
done
gh release edit "$TAG" -R "$REPO" --draft=false --latest
echo "Verified both market mirrors. Website download entries may now be enabled. Staging: $WORK"

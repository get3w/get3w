# Desktop installer markets

Official packages embed `market: cn | global` in package.json. Missing metadata retains the China defaults. The renderer receives the immutable identity synchronously through preload; a valid saved zh/en preference wins over its first-run language. Language selection never changes the login website. App ID, userData, account stores and Cloud/API endpoints remain shared.

Build through `node apps/desktop/scripts/package-market.mjs cn|global --mac|--win --arm64|--x64 --publish never`. Release CI builds all eight combinations with one version. Artifacts are named `get3w-<market>-<os>-<arch>-<version>.<ext>`. macOS retains Developer ID signing/notarization. Windows retains unsigned publication (explicitly accepted for this release).

- China login: https://get3w.com/desktop-connect
- Global login: https://get3w.ai/desktop-connect
- New China stable feed: https://get3w.com/desktop/releases/cn/latest/download
- Global stable feed: https://get3w.ai/desktop/releases/latest/download
- Legacy China feed: https://get3w.com/desktop/releases/latest/download

Version/recovery feeds use `<releaseBase>/download/v<version>`. Market clients reject foreign domain or filename metadata and have separate updater caches. They never use the shared GitHub fallback. Old China aliases reuse identical signed installer bytes; no binary is modified after signing.

Publish backend exact Origin compatibility and bilingual approval pages first. Run all public release checks and package metadata checks. Inspect macOS signatures/notarization and package config. Stage both markets with `scripts/release/stage-markets.py`; `mirror-cos.sh` verifies checksums before activating manifests. Only publish website download entries after both markets are reachable and verified. Website stays in CNB; Desktop CI stays in GitHub Actions.

Native acceptance must use an isolated full profile, never the daily installation or data directories. Cover fresh cn/global, both saved language preferences, manual language changes, overwrite installation, login, update, target-version/recovery, offline behavior and rejected foreign manifests. Keep screenshot evidence for UI changes (DESIGN P5/P9/P10).

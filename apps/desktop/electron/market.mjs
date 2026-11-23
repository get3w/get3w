/** Immutable package identity; never inferred from language, hostname or runtime env. */
export function resolveDesktopMarket(value) {
  if (value !== undefined && value !== "cn" && value !== "global") throw new Error("Invalid Desktop market");
  const market = value ?? "cn";
  const webOrigin = market === "global" ? "https://get3w.ai" : "https://get3w.com";
  return Object.freeze({ market, defaultLanguage: market === "global" ? "en" : "zh", webOrigin,
    releaseBase: `${webOrigin}/desktop/releases${value === "cn" ? "/cn" : ""}`, artifactPrefix: `get3w-${market}-` });
}
export function marketUpdateFeed(market, channel = "stable") {
  const config = resolveDesktopMarket(market);
  return `${config.releaseBase}/${channel === "alpha" ? "download/alpha-macos-latest" : "latest/download"}`;
}

/** Values come from the packaged main process before renderer initialization. */
export function desktopWebOrigin(): string {
  return typeof window !== "undefined" && window.__GET3W_MARKET__?.market === "global"
    ? "https://get3w.ai" : "https://get3w.com";
}
export const DESKTOP_RELEASE_BASE = `${desktopWebOrigin()}/desktop/releases${typeof window !== "undefined" && window.__GET3W_MARKET__?.market === "cn" ? "/cn" : ""}`;

// Gateway runtime detection primitives. Leaf module by design: keep it import-free
// so low-level clients can choose same-origin gateway behavior without cycles.
export type Get3wGatewayMarker = {
  version?: number;
  build?: string;
  /** Den web origin set by a self-hosted gateway (DEN_GATEWAY_DEN_WEB_URL). */
  denBaseUrl?: string;
};

declare global {
  interface Window {
    __GET3W_GATEWAY__?: Get3wGatewayMarker;
  }
}

const DEN_AUTH_TOKEN_STORAGE_KEY = "get3w.den.authToken";

export function isGet3wGatewayRuntime() {
  return typeof window !== "undefined" && window.__GET3W_GATEWAY__?.version === 1;
}

export function getGet3wGatewayOrigin() {
  if (!isGet3wGatewayRuntime()) return null;
  const origin = window.location.origin.trim();
  return origin || null;
}

// A self-hosted gateway names its own Den, because the published web build
// bakes in no Den URL and would otherwise sign in against hosted Cloud.
export function readGet3wGatewayDenBaseUrl() {
  if (!isGet3wGatewayRuntime()) return null;
  const value = window.__GET3W_GATEWAY__?.denBaseUrl;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readGet3wGatewayDenToken() {
  if (!isGet3wGatewayRuntime()) return "";
  try {
    return window.localStorage.getItem(DEN_AUTH_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

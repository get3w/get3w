import {
  GATEWAY_USAGE_LIMIT_ERROR_CODE,
  hasGatewayUsageLimitHttpMarker,
} from "@get3w/types/den/gateway-usage-limits";
import {
  GET3W_MODELS_ALLOWANCE_ERROR_CODE,
  GET3W_MODELS_ALLOWANCE_SOURCE,
  hasGet3WModelsAllowanceHttpMarker,
} from "@get3w/types/den/inference";

export const GATEWAY_QUOTA_MESSAGE = "You have reached your AI Gateway usage limit.";
const MAX_ERROR_BYTES = 16_384;
const BODY_TIMEOUT_MS = 5_000;

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function gatewayBase(id: string, baseURL: unknown): URL | undefined {
  if (!/^ipr_[a-z0-9]+$/.test(id) || typeof baseURL !== "string") return;
  try {
    const url = new URL(baseURL);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname.endsWith(`/api/v1/providers/${id}`)) return;
    return url;
  } catch {
    return;
  }
}

/** Get3W Models: the engine's `get3w` provider, served at `<models origin>/api/v1`. */
export function get3wModelsBase(id: string, baseURL: unknown): URL | undefined {
  if (id !== "get3w" || typeof baseURL !== "string") return;
  try {
    const url = new URL(baseURL);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname.endsWith("/api/v1")) return;
    return url;
  } catch {
    return;
  }
}

/**
 * The organization used its Get3W Models allowance (`x-get3w-error-code: get3w_models_allowance_reached`).
 * It lasts until the window resets, so the engine must not retry it as a rate limit.
 */
export async function isGet3WModelsAllowanceResponse(base: URL, url: URL, response: Response): Promise<boolean> {
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)
    || (response.url && new URL(response.url).origin !== base.origin)
    || !hasGet3WModelsAllowanceHttpMarker(response)) return false;
  const body = await readBoundedJson(response);
  return record(body) && record(body.error)
    && body.error.code === GET3W_MODELS_ALLOWANCE_ERROR_CODE
    && body.error.source === GET3W_MODELS_ALLOWANCE_SOURCE;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.clone().body?.getReader();
  if (!reader) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), BODY_TIMEOUT_MS);
  });
  const read = async (): Promise<unknown> => {
    let size = 0;
    let text = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_ERROR_BYTES) return null;
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  };
  try {
    return await Promise.race([read(), expired]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

export async function isGatewayQuotaResponse(base: URL, url: URL, response: Response): Promise<boolean> {
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)
    || (response.url && new URL(response.url).origin !== base.origin)
    || !hasGatewayUsageLimitHttpMarker(response)) return false;
  const reader = response.clone().body?.getReader();
  if (!reader) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), BODY_TIMEOUT_MS);
  });
  const read = async () => {
    let size = 0;
    let text = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_ERROR_BYTES) return false;
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    return record(body) && record(body.error)
      && body.error.code === GATEWAY_USAGE_LIMIT_ERROR_CODE
      && body.error.source === "get3w_gateway"
      && body.error.type === "usage_limit_error"
      && body.error.message === GATEWAY_QUOTA_MESSAGE;
  };
  try {
    return await Promise.race([read(), expired]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

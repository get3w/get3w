export const deepLinkBridgeEvent = "get3w:deep-link";
export const nativeDeepLinkEvent = "get3w:deep-link-native";

export type DeepLinkBridgeDetail = {
  urls: string[];
};

declare global {
  interface Window {
    __GET3W__?: {
      deepLinks?: string[];
    };
  }
}

function normalizeDeepLinks(urls: readonly string[]): string[] {
  return urls.flatMap((url) => {
    const trimmed = url.trim();
    return trimmed ? [trimmed] : [];
  });
}

export function pushPendingDeepLinks(target: Window, urls: readonly string[]): string[] {
  const normalized = normalizeDeepLinks(urls);
  if (normalized.length === 0) {
    return [];
  }

  target.__GET3W__ ??= {};
  const pending = target.__GET3W__.deepLinks ?? [];
  target.__GET3W__.deepLinks = [...pending, ...normalized];
  target.dispatchEvent(
    new CustomEvent<DeepLinkBridgeDetail>(deepLinkBridgeEvent, {
      detail: { urls: normalized },
    }),
  );
  return normalized;
}

/**
 * Remove and return only the pending links a consumer owns, leaving the rest
 * queued for the consumers that parse them.
 */
export function takePendingDeepLinks(target: Window, owns: (url: string) => boolean): string[] {
  const pending = target.__GET3W__?.deepLinks ?? [];
  const taken = pending.filter(owns);
  if (target.__GET3W__ && taken.length > 0) {
    target.__GET3W__.deepLinks = pending.filter((url) => !owns(url));
  }
  return taken;
}

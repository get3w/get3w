export type ParsedInviteLink = { url: string; origin: string; host: string };
export type ParsedServerUrl = { url: string; host: string };

function parseHttpUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * A Den web invite: an http(s) link whose path ends at /join-org carrying an
 * `invite` token (e.g. https://den.example.com/join-org?invite=…). The invite is
 * accepted in the browser, so the desktop app points itself at the link's
 * origin and re-opens the link there.
 */
export function parseInviteLinkInput(value: string): ParsedInviteLink | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if ((segments[segments.length - 1] ?? "").toLowerCase() !== "join-org") return null;
  if (!(url.searchParams.get("invite") ?? "").trim()) return null;
  return { url: url.toString(), origin: url.origin, host: url.host };
}

/**
 * A plain organization server or workspace URL. The explicit http(s) scheme
 * requirement mirrors normalizeDenBaseUrl, so raw sign-in grants and
 * openwork:// deep links never classify as server URLs.
 */
export function parseServerUrlInput(value: string): ParsedServerUrl | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  return { url: url.toString().replace(/\/+$/, ""), host: url.host };
}

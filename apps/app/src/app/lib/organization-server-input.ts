const explicitSchemePattern = /^[a-z][a-z\d+.-]*:\/\//i;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function normalizeOrganizationServerInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s|\\/.test(trimmed)) return null;

  const candidate = explicitSchemePattern.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.trim() || url.username || url.password) return null;
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

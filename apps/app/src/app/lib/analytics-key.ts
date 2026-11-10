export const DEFAULT_POSTHOG_KEY = "";

/**
 * Resolve the PostHog project key. `raw` is VITE_GET3W_POSTHOG_KEY.
 * Unset stays silent in all builds; Get3W does not inherit an upstream project key.
 * Explicit strings are used after trim; an empty string disables analytics in any build.
 */
export function resolvePosthogKey(raw: unknown, isDev: boolean): string {
  if (typeof raw === "string") return raw.trim(); // explicit value wins; "" disables
  return isDev ? "" : DEFAULT_POSTHOG_KEY;
}

import { isDesktopRuntime } from "@/app/lib/runtime-env";

/** Presence of the local adapter exposes dictation; native start still checks
 * OS support/permissions and retains its system-dictation fallback. */
export function useNativeDictationFeature() {
  return isDesktopRuntime() && Boolean(window.__GET3W_ELECTRON__?.dictation);
}

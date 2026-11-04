import { isDesktopRuntime } from "@/app/lib/runtime-env";

type DesktopFeatureKey = "computerUse" | "computerSessionHistory" | "remoteComputers" | "settledSessions";

/** Personal capabilities come from this installation, never a deployment flag.
 * Native handlers retain OS permissions and per-session user approvals. */
export function useDesktopFeature(key: DesktopFeatureKey): boolean {
  if (!isDesktopRuntime() || key === "remoteComputers") return false;
  if (key === "settledSessions") return true;
  return Boolean(window.__OPENWORK_ELECTRON__?.computer);
}

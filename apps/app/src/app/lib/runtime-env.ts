// Runtime detection primitives. Leaf module by design: keep it import-free so
// low-level clients (opencode, get3w-server, den) can use it without
// dragging in the utils barrel (which pulls i18n and app constants).
export function isElectronRuntime() {
  return typeof window !== "undefined" && (window as Window).__GET3W_ELECTRON__ != null;
}

export function isDesktopRuntime() {
  return isElectronRuntime();
}

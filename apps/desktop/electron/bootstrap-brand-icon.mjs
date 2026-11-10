/**
 * @param {Partial<import("@openwork/types/desktop-ipc").DesktopBootstrapConfig>} config
 * @param {(iconUrl: string) => Promise<unknown>} applyBrandIconUrl
 */
export async function applyDesktopBootstrapBrandIcon(config, applyBrandIconUrl) {
  const iconUrl = typeof config.brandIconUrl === "string" ? config.brandIconUrl.trim() : "";
  if (!iconUrl) return null;
  return applyBrandIconUrl(iconUrl);
}

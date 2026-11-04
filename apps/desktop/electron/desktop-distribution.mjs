export const PUBLIC_DESKTOP_DISTRIBUTION = Object.freeze({
  flavor: "public",
  appName: "Get3W",
  appIdentifier: "com.get3w.desktop",
  protocolScheme: "openwork",
  requireSignin: false,
  requireActivation: false,
});

export const CLOUD_DESKTOP_DISTRIBUTION = Object.freeze({
  flavor: "cloud",
  appName: "Get3W Cloud",
  appIdentifier: "com.get3w.desktop",
  protocolScheme: "openwork",
  requireSignin: true,
  requireActivation: false,
});


function normalizeFlavor(value) {
  const flavor = value?.trim().toLowerCase();
  return flavor === "cloud" ? flavor : "public";
}

/**
 * Packaged builds trust only electron-builder's immutable package metadata.
 * The environment override exists solely so development and tests can
 * select a distribution without producing a signed installer.
 */
export function resolveDesktopDistribution({
  isPackaged,
  packageFlavor,
  environmentFlavor,
}) {
  const flavor = normalizeFlavor(
    isPackaged ? packageFlavor : (environmentFlavor || packageFlavor),
  );
  if (flavor === "cloud") return CLOUD_DESKTOP_DISTRIBUTION;
  return PUBLIC_DESKTOP_DISTRIBUTION;
}


export type Get3WDeployment = "desktop" | "web";

function normalizeDeployment(value: string | undefined): Get3WDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";
}

export function getGet3WDeployment(): Get3WDeployment {
  const envValue =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_GET3W_DEPLOYMENT === "string"
      ? import.meta.env.VITE_GET3W_DEPLOYMENT
      : undefined;

  return normalizeDeployment(envValue);
}

export function isWebDeployment(): boolean {
  return getGet3WDeployment() === "web";
}

export function isDesktopDeployment(): boolean {
  return getGet3WDeployment() === "desktop";
}

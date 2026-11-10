
export type OpenWorkDeployment = "desktop" | "web";

function normalizeDeployment(value: string | undefined): OpenWorkDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";
}

export function getOpenWorkDeployment(): OpenWorkDeployment {
  const envValue =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_GET3W_DEPLOYMENT === "string"
      ? import.meta.env.VITE_GET3W_DEPLOYMENT
      : undefined;

  return normalizeDeployment(envValue);
}

export function isWebDeployment(): boolean {
  return getOpenWorkDeployment() === "web";
}

export function isDesktopDeployment(): boolean {
  return getOpenWorkDeployment() === "desktop";
}

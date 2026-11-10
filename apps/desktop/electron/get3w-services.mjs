import { assertGet3wServiceTarget } from "./get3w-egress.mjs";
export const GET3W_SERVICES = Object.freeze({
  // Every native Desktop request (auth, inference, personal, MCP gateway).
  cloudBase: "https://cloud.get3w.com",
  // Browser sign-in approval page.
  webBase: "https://get3w.com",
  // Den control plane (/api/den, /api/runtime-config); unchanged by the cloud split.
  denBase: "https://api.get3w.com",
});
export function validateGet3wOrigin(value) {
  assertGet3wServiceTarget(value);
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
    throw new Error("Invalid Get3W service origin");
  }
  return url.origin;
}

/**
 * Origins passed to createGet3wAuth. Development reads GET3W_CLOUD_ORIGIN and
 * GET3W_AUTH_WEB_ORIGIN; packaged builds use the defaults unless the package is a
 * local validation build that ships its own `openworkAuthOrigins`.
 * @param {{isPackaged:boolean,env?:Record<string,string|undefined>,packageMetadata?:object,localValidation?:boolean}} input
 * @returns {{cloudBase?:string,webBase?:string}}
 */
export function resolveGet3wOrigins({ isPackaged, env = {}, packageMetadata = {}, localValidation = false }) {
  if (!isPackaged) {
    return {
      cloudBase: env.GET3W_CLOUD_ORIGIN?.trim() || GET3W_SERVICES.cloudBase,
      webBase: env.GET3W_AUTH_WEB_ORIGIN?.trim() || GET3W_SERVICES.webBase,
    };
  }
  const shipped = localValidation ? Reflect.get(packageMetadata ?? {}, "openworkAuthOrigins") : null;
  if (!shipped || typeof shipped !== "object") return {};
  const origins = {};
  for (const key of ["cloudBase", "webBase"]) {
    const value = Reflect.get(shipped, key);
    if (typeof value === "string" && value.trim()) origins[key] = value.trim();
  }
  return origins;
}

import { assertGet3wServiceTarget } from "./get3w-egress.mjs";
export const GET3W_SERVICES = Object.freeze({
  apiBase: "https://api.get3w.com",
  webBase: "https://get3w.com",
  cloudBase: "https://app.get3w.com",
  docsBase: "https://get3w.com/docs",
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

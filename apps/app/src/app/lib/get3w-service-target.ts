/** Service requests only: user browser navigation and configured third-party providers are separate. */
export function assertGet3wServiceTarget(value: string): void {
  const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  if (["openwork.com", "openworklabs.com", "openwork.software", "openwork.so"].some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error("This legacy service is unavailable in Get3W. Reconnect your Get3W account.");
  }
}

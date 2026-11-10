/** Read old saved selections without registering or advertising the legacy id. */
export function get3wProviderId(id: string): string {
  return id === "openwork-account" ? "get3w-account" : id;
}

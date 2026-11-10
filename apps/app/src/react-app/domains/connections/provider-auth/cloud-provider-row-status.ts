import type { ProviderCredentialHealth } from "./credential-health";
import type { CloudProviderSyncError } from "./store";

export type CloudProviderRowStatus =
  | "connected"
  | "credential_unverified"
  | "credential_rejected"
  | "syncing"
  | "error"
  | "conflict"
  | "blocked"
  | "needs_credential"
  | "needs_server"
  | "unavailable";

export type CloudProviderRowStateInput = {
  imported: boolean;
  credentialHealth?: ProviderCredentialHealth;
  outOfSync: boolean;
  allowed: boolean;
  importsUnavailable: boolean;
  needsCredential: boolean;
  needsServer: boolean;
  syncError: CloudProviderSyncError | null;
  /**
   * The server-side sync skipped this provider (from
   * /cloud-provider-sync/status skippedProviders, e.g. missing_credentials) —
   * an honest attention state instead of a silent, permanent "Syncing".
   */
  skippedByServer?: boolean;
  /**
   * The server still owes the engine a reload: the provider is materialized
   * on disk but its models are not served yet, so "Connected" would lie.
   */
  reloadPending?: boolean;
};

export function resolveCloudProviderRowStatus(
  input: CloudProviderRowStateInput,
): CloudProviderRowStatus {
  if (input.importsUnavailable) return "unavailable";
  if (!input.allowed) return "blocked";
  if (input.syncError) return input.syncError.kind;
  if (input.needsCredential || input.skippedByServer === true) return "needs_credential";
  if (input.needsServer) return "needs_server";
  if (!input.imported || input.outOfSync || input.reloadPending === true) return "syncing";
  if (input.credentialHealth === "rejected") return "credential_rejected";
  if (input.credentialHealth === "unverified") return "credential_unverified";
  return "connected";
}


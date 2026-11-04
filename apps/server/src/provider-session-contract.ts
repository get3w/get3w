/** Compatibility contract for optional provider bridge adapters. The personal
 * server does not register a legacy organization session provider. */
export type CloudProviderDenSession = { baseUrl: string; token: string; orgId: string };

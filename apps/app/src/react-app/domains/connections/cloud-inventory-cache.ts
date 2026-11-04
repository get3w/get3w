import type { DenExternalMcpConnection } from "@/app/lib/den";
import { EMPTY_CONNECT_CAPABILITY_INVENTORY, type ConnectCapabilityInventory } from "../session/surface/connect-capability-inventory";
export type CloudInventoryScope = { baseUrl: string; organizationId: string };
export const CLOUD_INVENTORY_CHANGED_EVENT = "openwork-cloud-inventory-changed";
export const cloudInventoryScopeKey = (scope: CloudInventoryScope) => `${scope.baseUrl}\n${scope.organizationId}`;
export const readCloudInventoryScope = (): CloudInventoryScope | null => null;
export const readCachedConnectCapabilities = (_scope: CloudInventoryScope) => EMPTY_CONNECT_CAPABILITY_INVENTORY;
export const readCachedOrgMcpConnections = (_scope: CloudInventoryScope): DenExternalMcpConnection[] => [];
export const loadConnectCapabilities = async (_input: unknown): Promise<ConnectCapabilityInventory> => EMPTY_CONNECT_CAPABILITY_INVENTORY;
export const loadOrgMcpConnections = async (_input: unknown): Promise<DenExternalMcpConnection[]> => [];
export const loadSessionConnectCapabilities = async () => EMPTY_CONNECT_CAPABILITY_INVENTORY;
export function clearCloudInventoryCache() {}
export function prefetchCloudInventory() {}
export function storeCloudInventory(..._input: unknown[]) {}

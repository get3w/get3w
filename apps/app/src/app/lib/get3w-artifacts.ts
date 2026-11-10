import { builtMcpAppCatalogSchema, type BuiltMcpAppCatalogEntry } from "./built-mcp-app-catalog";
import { DenApiError } from "./den";
import { generatedArtifactViewSchema, savedAppDetailSchema, savedAppSummarySchema, type SaveApp } from "@openwork/types/workflows";

/** Personal artifacts, owned by the signed-in Get3W user and reached through the desktop bridge. */
export function createArtifactsClient(input: { userId: string }) {
  async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const bridge = window.__GET3W_ACCOUNT__?.artifacts;
    if (!bridge) throw new DenApiError(410, "artifacts_unavailable", "Sign in to Get3W to open cloud artifacts.");
    const response = await bridge({ userId: input.userId, path, method, ...(body === undefined ? {} : { body }) });
    if (response.ok) return response.json;
    const payload: unknown = response.json;
    const record = typeof payload === "object" && payload !== null ? payload : null;
    const code = record && "error" in record && typeof record.error === "string" ? record.error : "request_failed";
    const message = record && "message" in record && typeof record.message === "string" ? record.message : `Request failed with ${response.status}.`;
    throw new DenApiError(response.status, code, message);
  }

  return {
    async listBuiltMcpApps(): Promise<BuiltMcpAppCatalogEntry[]> {
      return builtMcpAppCatalogSchema.parse(await request("/v1/mcp-apps")).apps;
    },
    async deleteBuiltMcpApp(appId: string): Promise<void> {
      await request(`/v1/config-objects/${encodeURIComponent(appId)}/delete`, "POST", {});
    },
    async listSavedApps() {
      const payload = await request("/v1/apps");
      if (typeof payload !== "object" || payload === null || !("items" in payload) || !Array.isArray(payload.items)
        || !("enabled" in payload) || typeof payload.enabled !== "boolean") {
        throw new Error("Your apps could not be loaded.");
      }
      const sharingEnabled = "sharingEnabled" in payload && payload.sharingEnabled === true;
      return { enabled: payload.enabled, sharingEnabled, items: payload.items.map((item) => savedAppSummarySchema.parse(item)) };
    },
    async getSavedApp(appId: string, options: { revisionId?: string; receiptId?: string; timeZone?: string } = {}) {
      const params = new URLSearchParams();
      if (options.revisionId) params.set("revisionId", options.revisionId);
      if (options.receiptId) params.set("receiptId", options.receiptId);
      if (options.timeZone) params.set("timeZone", options.timeZone);
      return savedAppDetailSchema.parse(await request(`/v1/apps/${encodeURIComponent(appId)}?${params}`));
    },
    async saveApp(appId: string, body: SaveApp) {
      return generatedArtifactViewSchema.parse(await request(`/v1/apps/${encodeURIComponent(appId)}/save`, "POST", body));
    },
    async deleteApp(appId: string) {
      await request(`/v1/artifact-views/${encodeURIComponent(appId)}/retire`, "POST");
    },
    async setAppOnDashboard(appId: string, added: boolean) {
      await request(`/v1/apps/${encodeURIComponent(appId)}/dashboard`, "POST", { added });
    },
  };
}

export type ArtifactsClient = ReturnType<typeof createArtifactsClient>;

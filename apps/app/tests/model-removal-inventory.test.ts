import { describe, expect, test } from "bun:test";
import { parseModelRemovalInventory } from "../src/react-app/domains/session/surface/model-removal-inventory";

const emptyLegacy = { llmProviders: [] };
const emptyGateway = { inferenceProviders: [] };
const legacyProvider = {
  id: "lpr_assigned", providerId: "anthropic", name: "Assigned", source: "custom",
  credentialMode: "shared", models: [{ id: "model-a", name: "Model A", config: { apiKey: "not-returned" } }],
  providerConfig: { apiKey: "not-returned" },
};
function gatewayModel(id: string) {
  return {
    id, name: "Gateway model", config: { id, secret: "not-returned" }, upstreamModelId: "upstream-model",
    modelGroupId: "gmg_group", modelGroupName: "Group", credentialSetId: "gcs_set", credentialSetName: "Set",
  };
}
const gatewayProvider = {
  id: "ipr_assigned", providerId: "anthropic", name: "Gateway", source: "openwork_gateway",
  credentialStatus: "ready", modelAssignmentsComplete: true, models: [gatewayModel("gwm_ready")], authorizationRequests: [],
};

describe("authoritative member model inventory", () => {
  test("maps legacy runtime identities without retaining configuration or credentials", () => {
    expect(parseModelRemovalInventory({ llmProviders: [legacyProvider, {
      ...legacyProvider, id: "lpr_openwork", source: "openwork", credentialMode: "per_member", hasMyCredential: false,
    }] }, emptyGateway)).toEqual({
      models: [
        { providerID: "lpr_assigned", modelID: "model-a", title: "Model A" },
        { providerID: "openwork", modelID: "model-a", title: "Model A" },
      ],
      lockedModels: [{ providerID: "openwork", modelID: "model-a" }],
    });
  });

  test("retains all per-member assignments while authorization is missing or unknown", () => {
    for (const hasMyCredential of [undefined, false, true]) {
      const inventory = parseModelRemovalInventory({ llmProviders: [{
        ...legacyProvider, credentialMode: "per_member", hasMyCredential,
      }] }, emptyGateway);
      expect(inventory.models).toHaveLength(1);
      expect(inventory.lockedModels).toHaveLength(hasMyCredential ? 0 : 1);
    }
  });

  test("uses gateway wire aliases, including locked authorization request models", () => {
    const inventory = parseModelRemovalInventory(emptyLegacy, { inferenceProviders: [{
      ...gatewayProvider,
      authorizationRequests: [{ credentialSetId: "gcs_set", name: "Sign in", authUrl: "https://example.test/auth", models: [gatewayModel("gwm_locked")] }],
    }] });
    expect(inventory).toEqual({
      models: [
        { providerID: "ipr_assigned", modelID: "gwm_ready", title: "Gateway model" },
        { providerID: "ipr_assigned", modelID: "gwm_locked", title: "Gateway model" },
      ],
      lockedModels: [{ providerID: "ipr_assigned", modelID: "gwm_locked" }],
    });
  });

  test("a gateway requiring member authorization retains its assigned aliases", () => {
    expect(parseModelRemovalInventory(emptyLegacy, { inferenceProviders: [{
      ...gatewayProvider, credentialStatus: "member_auth_required", models: [],
      authorizationRequests: [{ credentialSetId: "gcs_set", name: "Sign in", authUrl: "https://example.test/auth", models: [gatewayModel("gwm_locked")] }],
    }] })).toEqual({
      models: [{ providerID: "ipr_assigned", modelID: "gwm_locked", title: "Gateway model" }],
      lockedModels: [{ providerID: "ipr_assigned", modelID: "gwm_locked" }],
    });
  });

  test("a complete empty assignment set permits removal regardless of aggregate credential hint", () => {
    expect(parseModelRemovalInventory(emptyLegacy, { inferenceProviders: [{
      ...gatewayProvider, credentialStatus: "org_credential_missing", models: [], modelAssignmentsComplete: true,
    }] })).toEqual({ models: [], lockedModels: [] });
  });

  test("a healthy aggregate cannot disguise incomplete assignments or old servers", () => {
    for (const modelAssignmentsComplete of [false, undefined]) {
      expect(() => parseModelRemovalInventory(emptyLegacy, { inferenceProviders: [{
        ...gatewayProvider, modelAssignmentsComplete,
      }] })).toThrow();
    }
  });

  test("empty complete inventories are valid", () => {
    expect(parseModelRemovalInventory(emptyLegacy, emptyGateway)).toEqual({ models: [], lockedModels: [] });
  });

  test("rejects any malformed provider/model rather than returning partial absence", () => {
    for (const payload of [null, {}, { llmProviders: null }, { llmProviders: [legacyProvider, null] },
      { llmProviders: [{ ...legacyProvider, source: "future" }] },
      { llmProviders: [{ ...legacyProvider, models: undefined }] },
      { llmProviders: [{ ...legacyProvider, models: [legacyProvider.models[0], { id: "bad" }] }] },
      { llmProviders: [{ ...legacyProvider, credentialMode: "future" }] },
    ]) expect(() => parseModelRemovalInventory(payload, emptyGateway)).toThrow();
    for (const payload of [null, {}, { inferenceProviders: [gatewayProvider, null] },
      { inferenceProviders: [{ ...gatewayProvider, source: "future" }] },
      { inferenceProviders: [{ ...gatewayProvider, models: undefined }] },
      { inferenceProviders: [{ ...gatewayProvider, models: [gatewayModel("raw-upstream-id")] }] },
      { inferenceProviders: [{ ...gatewayProvider, models: [{ ...gatewayModel("gwm_bad"), config: { id: "gwm_other" } }] }] },
      { inferenceProviders: [{ ...gatewayProvider, authorizationRequests: undefined }] },
      { inferenceProviders: [{ ...gatewayProvider, authorizationRequests: [{ credentialSetId: "gcs_set", name: "Sign in", authUrl: "https://example.test/auth" }] }] },
      { inferenceProviders: [{ ...gatewayProvider, modelAssignmentsComplete: false }] },
      { inferenceProviders: [{ ...gatewayProvider, modelAssignmentsComplete: undefined }] },
      { inferenceProviders: [{ ...gatewayProvider, modelAssignmentsComplete: "true" }] },
    ]) expect(() => parseModelRemovalInventory(emptyLegacy, payload)).toThrow();
  });
});

import { describe, expect, test } from "bun:test";
import {
  isLiveGatewaySetConnected,
  resolveGatewayProviderIds,
  resolveLiveGatewayConnectProviders,
  resolveLiveGatewayImportedProviders,
  type LiveGatewayProvider,
} from "../src/react-app/domains/connections/provider-auth/cloud-provider-config";

// Crockford-base32 ULID-shaped suffixes, matching Den's id format.
const group = "01m292yddve0pbd5rnb30rk3ap";
const readySet = "01m292ydevejz88xgn8dhsdy22";
const pendingSet = "01m292yde8escv5k6jkfwq8y1n";
const modelSuffix = "01m356j44dec4r73nsa53rmpa9";

const model = (credentialSet: string) => ({
  id: `gwm_${group}_${credentialSet}_${modelSuffix}`,
  name: "Claude",
  config: { id: `gwm_${group}_${credentialSet}_${modelSuffix}` },
  upstreamModelId: "claude-sonnet",
  modelGroupId: `gmg_${group}`,
  modelGroupName: "Default",
  credentialSetId: `gcs_${credentialSet}`,
  credentialSetName: credentialSet === readySet ? "Shared" : "Personal",
});

const ready: LiveGatewayProvider = {
  id: "ipr_ready",
  providerId: "anthropic",
  name: "Anthropic",
  credentialStatus: "ready",
  updatedAt: "2026-10-28T00:00:00.000Z",
  models: [model(readySet)],
  authorizationRequests: [],
};

const memberOnly: LiveGatewayProvider = {
  id: "ipr_member",
  providerId: "openai",
  name: "OpenAI",
  credentialStatus: "member_auth_required",
  updatedAt: "2026-10-28T00:00:00.000Z",
  models: [],
  authorizationRequests: [],
};

const mixed: LiveGatewayProvider = {
  ...ready,
  id: "ipr_mixed",
  name: "Bedrock",
  authorizationRequests: [{ credentialSetId: `gcs_${pendingSet}`, name: "Personal", authUrl: "https://den.example.test/auth", models: [model(pendingSet)] }],
};

const missing: LiveGatewayProvider = { ...memberOnly, id: "ipr_missing", credentialStatus: "org_credential_missing" };

describe("Settings lists Gateway providers under live provider sync", () => {
  test("ready providers become organization rows badged as Get3W Gateway", () => {
    const rows = resolveLiveGatewayImportedProviders([ready, memberOnly, mixed, missing]);
    expect(Object.keys(rows).sort()).toEqual(["ipr_mixed", "ipr_ready"]);
    expect(rows.ipr_ready).toEqual({
      cloudProviderId: "ipr_ready",
      providerId: "ipr_ready",
      sourceProviderId: "anthropic",
      name: "Anthropic",
      source: "openwork_gateway",
      updatedAt: "2026-10-28T00:00:00.000Z",
      modelIds: [model(readySet).id],
      importedAt: null,
    });
    expect([...resolveGatewayProviderIds(rows)].sort()).toEqual(["ipr_mixed", "ipr_ready"]);
  });

  test("pending member sign-ins become Connect rows like the server sync's skips", () => {
    expect(resolveLiveGatewayConnectProviders([ready, memberOnly, mixed, missing])).toEqual([
      { cloudProviderId: "ipr_member", providerId: "ipr_member", name: "OpenAI", authUrl: null },
      {
        cloudProviderId: "ipr_mixed",
        credentialSetId: `gcs_${pendingSet}`,
        models: [model(pendingSet)],
        providerId: "ipr_mixed",
        name: "Bedrock / Personal",
        authUrl: null,
      },
    ]);
  });

  test("a sign-in counts as connected only once Den stops asking for it", () => {
    const [memberRow, setRow] = resolveLiveGatewayConnectProviders([memberOnly, mixed]);
    expect(isLiveGatewaySetConnected(memberRow, [memberOnly])).toBe(false);
    expect(isLiveGatewaySetConnected(memberRow, [{ ...memberOnly, credentialStatus: "ready", models: [model(readySet)] }])).toBe(true);
    expect(isLiveGatewaySetConnected(setRow, [mixed])).toBe(false);
    expect(isLiveGatewaySetConnected(setRow, [{ ...mixed, authorizationRequests: [] }])).toBe(false);
    expect(isLiveGatewaySetConnected(setRow, [{ ...mixed, authorizationRequests: [], models: [model(readySet), model(pendingSet)] }])).toBe(true);
    expect(isLiveGatewaySetConnected(setRow, [])).toBe(false);
  });
});

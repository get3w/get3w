import { randomBytes, timingSafeEqual } from "node:crypto";
import type { DesktopConfig } from "@openwork/types/den/desktop-policies-runtime";
import type { CloudProviderDenSession } from "./provider-session-contract.js";
import type { ServerConfig } from "./types.js";
import type { ManagedPolicyAction } from "./managed-policy-rules.js";
import type { agentPermissionRulesOf } from "./agent-permission-engine.js";

// Compatibility adapter for local engine plugins and older Desktop clients.
// Personal Desktop has no organization policy authority. Request authentication,
// filesystem permissions, approvals and read-only checks remain in their owners.
// No session, policy cache, control-plane request or runtime write is retained here.
const services = new WeakMap<ServerConfig, PersonalDesktopPolicy>();
export function managedDesktopPolicy(config: ServerConfig): PersonalDesktopPolicy {
  let service = services.get(config);
  if (!service) { service = new PersonalDesktopPolicy(); services.set(config, service); }
  return service;
}
class PersonalDesktopPolicy {
  readonly evaluationToken = randomBytes(32).toString("base64url");
  onChange: (() => void) | undefined;
  authenticatesEvaluation(request: Request): boolean {
    const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!supplied) return false;
    const actual = Buffer.from(supplied);
    const expected = Buffer.from(this.evaluationToken);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  async setSession(_session: CloudProviderDenSession): Promise<void> {}
  async clearSession(): Promise<void> {}
  async current(): Promise<DesktopConfig | null> { return null; }
  known(): DesktopConfig | null { return null; }
  async assertRequest(_request: Request, _path: string, _engine = false): Promise<void> {}
  async assertAgentPermission(_action: "skill" | "mcp", _name: string): Promise<void> {}
  async assert(_action: ManagedPolicyAction, _input: Record<string, unknown> = {}): Promise<void> {}
  async remoteComputersEnabled(): Promise<boolean> { return false; }
  async websiteRules(): Promise<ReturnType<typeof agentPermissionRulesOf>> { return []; }
}

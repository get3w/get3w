import { t } from "@/i18n";
import { isJsonSecret, isPlainSecret } from "@openwork/ui/secret-input"
import type { CredentialPromptTarget } from "@openwork/types/den/credential-prompt"

export type PromptField = {
  id: string
  label: string
  /** identifier: not secret (an access key ID); secret: masked; json: a pasted key file, masked. */
  kind: "identifier" | "secret" | "json"
  optional?: boolean
}

/** The fields the host draws for a target. Fixed per kind, never taken from a tool result. */
export function promptFields(target: CredentialPromptTarget): PromptField[] {
  if (target.type !== "gateway_provider_credential") return [{ id: "apiKey", get label() { return t("ui.16f0ee47f993"); }, kind: "secret" }]
  if (target.credentialKind === "aws_keys") {
    return [
      { id: "accessKeyId", get label() { return t("ui.14eb0f962eda"); }, kind: "identifier" },
      { id: "secretAccessKey", get label() { return t("ui.3de6b754f572"); }, kind: "secret" },
      { id: "sessionToken", get label() { return t("ui.0cd7fb3e9b9a"); }, kind: "secret", optional: true },
    ]
  }
  if (target.credentialKind === "gcp_service_account") return [{ id: "serviceAccount", get label() { return t("ui.a67ba73d5cf0"); }, kind: "json" }]
  // One key per variable the provider reads; at least one is needed.
  return (target.envNames ?? []).map((name) => ({ id: name, label: name, kind: "secret", optional: true }))
}

/** Plain, value-free direction when what was entered can't be right. */
export function promptFieldsProblem(target: CredentialPromptTarget, values: Record<string, string>): string | null {
  const fields = promptFields(target)
  if (target.type === "gateway_provider_credential" && target.credentialKind === "api_key_map") {
    const entered = fields.filter((field) => values[field.id])
    if (!entered.length) return t("ui.71f48dca1813")
    return entered.every((field) => isPlainSecret(values[field.id] ?? "")) ? null : "Enter only the keys, without spaces or a prefix."
  }
  for (const field of fields) {
    const value = values[field.id] ?? ""
    if (!value) {
      if (field.optional) continue
      return `Enter the ${field.label.toLowerCase()}.`
    }
    if (field.kind === "json" && !isJsonSecret(value)) return "Paste the whole key file. It starts with { and ends with }."
    if (field.kind !== "json" && !isPlainSecret(value)) return field.kind === "identifier" ? `Check the ${field.label.toLowerCase()}.` : "Enter only the key, without spaces or a prefix."
  }
  return null
}

export type GatewayCredentialBody =
  | { credential: { kind: "aws_keys" | "gcp_service_account"; secret: string } }
  | { apiKeys: Record<string, string> }

/** The credential-set PATCH body for a structured target, in the shape the dashboard sends. */
export function gatewayCredentialBody(target: Extract<CredentialPromptTarget, { type: "gateway_provider_credential" }>, values: Record<string, string>): GatewayCredentialBody {
  if (target.credentialKind === "aws_keys") {
    return { credential: { kind: "aws_keys", secret: JSON.stringify({
      accessKeyId: values.accessKeyId ?? "",
      secretAccessKey: values.secretAccessKey ?? "",
      ...(values.sessionToken ? { sessionToken: values.sessionToken } : {}),
    }) } }
  }
  if (target.credentialKind === "gcp_service_account") return { credential: { kind: "gcp_service_account", secret: values.serviceAccount ?? "" } }
  return { apiKeys: Object.fromEntries((target.envNames ?? []).flatMap((name) => values[name] ? [[name, values[name]]] : [])) }
}

import { t } from "@/i18n";
import type { UIMessage } from "ai";
import { parseGatewayUsageError, gatewayUsageErrorEvidenceSchema, type GatewayUsageErrorEvidence } from "../../cloud/gateway-usage-state";
import { get3wModelsLimitSchema, parseGet3WModelsLimitError, type Get3WModelsLimit } from "../../cloud/usage-limit-state";

import { describeOpencodeConfigError } from "@get3w/types/opencode-config-error";
import { safeStringify } from "../../../../app/utils";
import { normalizeErrorText } from "../../../../lib/error-text";

export type OpencodeSessionErrorKind = "get3w-balance" | "get3w-quota" | "get3w-request-failed" | "model-quote-expired" | "model-insufficient-balance" | "model-schema-invalid" | "model-session-mismatch" | "model-upstream-failed" | "aborted" | "provider-timeout" | "provider-incomplete" | "provider-unavailable" | "provider-access-denied" | "provider-credentials" | "rate-limited" | "conversation-too-long" | "output-invalid" | "output-limit" | "attachment-unsupported" | "network-unavailable" | "provider-unreachable" | "provider-connection-dropped" | "model-unavailable" | "workspace-unavailable" | "free-model-limit" | "disk-full" | "database-error" | "gateway-auth-required" | "gateway-provider-authentication-failed" | "gateway-provider-permission-denied" | "gateway-selection-required" | "session-group-assignment" | "config-invalid" | "generic";

export type OpencodeSessionErrorPresentation = {
  kind: OpencodeSessionErrorKind;
  title: string;
  description: string | null;
  technicalDetails: string;
  recoveryPrompt: string | null;
  /**
   * `gateway-auth-required` only: the Get3W Gateway's OAuth start URL for
   * this member (`error.auth_url` in the 401 body). Null when the body omitted
   * it — the renderer then deep-links to Settings > AI providers. Additive.
   */
  connectUrl?: string | null;
  gatewayUsage?: GatewayUsageErrorEvidence;
  /** The organization used its Get3W Models allowance: a limit until a reset, not a rate limit. Additive. */
  get3wModelsLimit?: Get3WModelsLimit;
  providerId?: string | null;
};

/** Error code the Get3W inference gateway returns when the member's own sign-in is missing or revoked. */
export const GATEWAY_AUTH_REQUIRED_ERROR_CODE = "get3w_auth_required";
export const GATEWAY_AUTH_REQUIRED_TITLE = "Sign in to keep using this model";

export const interruptedTaskRecoveryPrompt = [
  "Continue the interrupted task from the current state.",
  "First inspect the conversation and workspace to verify which actions already completed.",
  "Preserve completed work, do not repeat side effects, and finish only what remains.",
].join(" ");

function recordValue(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function firstStringValue(records: unknown[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = recordValue(record, key);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function firstNumberValue(records: unknown[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = recordValue(record, key);
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return null;
}

function defaultErrorMessage(name: string | null, fallback: string) {
  if (name === "ProviderAuthError") return "Provider authentication failed";
  if (name === "MessageOutputLengthError") return "The model reached its output limit before finishing";
  if (name === "StructuredOutputError") return "The model could not produce valid structured output";
  if (name === "ContextOverflowError") return "The conversation is too large for the model context window";
  if (name === "MessageAbortedError") return "The message was interrupted";
  return fallback;
}

function sessionErrorKind(
  name: string | null,
  message: string | null,
  code: string | null,
  responseBody: string | null,
  status: number | null,
): OpencodeSessionErrorKind {
  if (name === "SessionGroupAssignmentError") return "session-group-assignment";
  if (name === "ConfigInvalidError" || name === "ConfigJsonError" || code === "opencode_config_invalid") return "config-invalid";
  const searchable = [name, message, code, responseBody].filter(Boolean).join(" ");
  if (searchable.includes("balance_exhausted")) return "get3w-balance";
  if (searchable.includes("quota_exhausted")) return "get3w-quota";
  if (searchable.includes("quote_expired")) return "model-quote-expired";
  if (searchable.includes("insufficient_balance")) return "model-insufficient-balance";
  if (searchable.includes("invalid_inputs") || searchable.includes("schema_mismatch")) return "model-schema-invalid";
  if (searchable.includes("session_mismatch")) return "model-session-mismatch";
  if (searchable.includes("upstream_failed") || searchable.includes("provider_unavailable")) return "model-upstream-failed";
  if (/Get3W (?:request failed|inference unavailable|stream interrupted)/.test(searchable)) return "get3w-request-failed";
  if (searchable.includes("gateway_selection_required")) return "gateway-selection-required";
  if (searchable.includes("get3w:desktop") && /\bECONNREFUSED\b/.test(searchable)
    && /127\.0\.0\.1|localhost|\[::1\]/.test(searchable)) return "workspace-unavailable";
  if (name === "APIError" && status === 403) return "provider-access-denied";
  if (/\b(?:ENOSPC|EDQUOT|SQLITE_FULL)\b|no space left on device|database or disk is full|disk quota exceeded/i.test(searchable)) {
    return "disk-full";
  }
  if (/\bSqlError\b|\bSQLITE_(?:IOERR|CANTOPEN|CORRUPT)\b/i.test(searchable)) {
    return "database-error";
  }
  // Explicit user cancellation wins. A timeout may contain the word "aborted"
  // too, but it must not be presented as a deliberate Stop.
  if (name === "MessageAbortedError") return "aborted";
  if (name === "TimeoutError" || code === "ETIMEDOUT" || /aborted due to timeout/i.test(searchable)) return "provider-timeout";
  if (name === "ContextOverflowError") return "conversation-too-long";
  if (name === "StructuredOutputError") return "output-invalid";
  if (name === "MessageOutputLengthError") return "output-limit";
  if (/file part media type.*not supported/i.test(searchable)) return "attachment-unsupported";
  if (name === "ProviderAuthError" || (name === "APIError" && status === 401)) return "provider-credentials";
  const transport = [code, message].filter(Boolean).join(" ");
  // OpenCode v2 names a missing or retired model with its internal ids.
  if (/^Model unavailable:/i.test(message ?? "")) return "model-unavailable";
  // v2 also reports provider HTTP failures as text, not as an APIError status.
  const httpStatus = Number(/Provider request failed with HTTP (\d{3})\b/i.exec(message ?? "")?.[1] ?? NaN);
  if (Number.isFinite(httpStatus)) {
    if (httpStatus === 429) return "rate-limited";
    if (httpStatus === 401) return "provider-credentials";
    if (httpStatus === 403) return "provider-access-denied";
    if (httpStatus >= 500 && httpStatus < 600) return "provider-unavailable";
  }
  if (name === "APIError" && /\bENOTFOUND\b|\bEAI_AGAIN\b|^fetch failed$/i.test(transport)) return "network-unavailable";
  // OpenCode v2 reports provider transport failures as plain messages (an
  // UnknownError carrying Bun's fetch text), not as APIError codes.
  if (/\bgetaddrinfo\s+(?:ENOTFOUND|EAI_AGAIN|ETIMEOUT)\b/i.test(transport)) return "network-unavailable";
  if (/\bConnectionRefused\b|\bECONNREFUSED\b|Unable to connect\. Is the computer able to access the url/i.test(transport)
    && !/127\.0\.0\.1|localhost|\[::1\]/.test(transport)) return "provider-unreachable";
  if (/\bECONNRESET\b|socket connection was closed unexpectedly|\bsocket hang up\b/i.test(transport)) return "provider-connection-dropped";
  if (
    name === "MessageAbortedError" ||
    code === "ABORT_ERR" ||
    /\b(?:message\s+)?abort(?:ed)?\b/i.test(searchable)
  ) {
    return "aborted";
  }
  if (
    name === "ProviderHeaderTimeoutError" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    /(?:response\s+)?headers?.{0,20}(?:timed?\s*out|timeout)/i.test(searchable)
  ) {
    return "provider-timeout";
  }
  if (/upstream_(?:incomplete|interrupted|malformed_stream|malformed_response|timeout)|connection reset by server/i.test(searchable)) return "provider-incomplete";
  // v2 reports a provider reply it could not parse as "Decode error (200 POST <url>)".
  if (/^Decode error \(\d{3} [A-Z]+ /i.test(message ?? "")) return "provider-incomplete";
  if (responseBody?.includes("FreeUsageLimitError") || message?.includes("FreeUsageLimitError")) {
    return "free-model-limit";
  }
  if (name === "APIError" && (status === 429 || /^(?:too many requests|rate limit(?:ed| exceeded)?)[.!]?$/i.test(message ?? ""))) return "rate-limited";
  if (name === "APIError" && ((status !== null && status >= 500 && status < 600)
    || /^(?:internal server error|bad gateway|service unavailable|provider is overloaded)[.!]?$/i.test(message ?? ""))) return "provider-unavailable";
  return "generic";
}

function errorTitle(kind: OpencodeSessionErrorKind, fallback: string) {
  if (kind === "session-group-assignment") return t("session.error.865ba6b148b6");
  if (kind === "config-invalid") return t("session.error.bac582aaafc3");
  if (kind === "disk-full") return t("session.error.7e4675fe6282");
  if (kind === "database-error") return t("session.error.344cb880c462");
  if (kind === "aborted") return t("session.error.37221ea7cd50");
  if (kind === "provider-timeout") return t("session.error.22b7fb1a1202");
  if (kind === "provider-incomplete") return t("session.error.d06f33b1ad21");
  if (kind === "provider-unavailable") return t("session.error.32b8dd885457");
  if (kind === "provider-access-denied") return t("session.error.caeef3e307dd");
  if (kind === "workspace-unavailable") return t("session.error.d1157ab61183");
  if (kind === "provider-credentials") return t("session.error.34a8862c4e64");
  if (kind === "rate-limited") return t("session.error.6a190e2ad115");
  if (kind === "conversation-too-long") return t("session.error.e0050cfd449b");
  if (kind === "output-invalid") return t("session.error.8977adb23231");
  if (kind === "output-limit") return t("session.error.44e6e5b76b9b");
  if (kind === "attachment-unsupported") return t("session.error.214b89fce4ca");
  if (kind === "network-unavailable") return t("session.error.fc30733502d6");
  if (kind === "provider-unreachable") return t("session.error.a97fcf9a0742");
  if (kind === "provider-connection-dropped") return t("session.error.52088eaed7d6");
  if (kind === "get3w-balance") return t("session.error.1e7608ef8916");
  if (kind === "get3w-quota") return t("session.error.61996fb7bdeb");
  if (kind === "get3w-request-failed") return t("session.error.91a1c9c77d91");
  if (kind === "model-quote-expired") return t("session.error.475ba3503e2d");
  if (kind === "model-insufficient-balance") return t("session.error.989af12e89ce");
  if (kind === "model-schema-invalid") return t("session.error.3d3d084e3e29");
  if (kind === "model-session-mismatch") return t("session.error.9846f2ce955f");
  if (kind === "model-upstream-failed") return t("session.error.9d5e217af124");
  if (kind === "model-unavailable") return t("session.error.68b174cc748d");
  if (kind === "free-model-limit") return t("session.error.932589391f8a");
  if (kind === "gateway-auth-required") return t("session.error.0ab75f92963d");
  if (kind === "gateway-provider-authentication-failed") return t("session.error.805e6349069a");
  if (kind === "gateway-provider-permission-denied") return t("session.error.597a69408b20");
  if (kind === "gateway-selection-required") return t("session.error.d2eac28d4779");
  return fallback;
}

function errorDescription(kind: OpencodeSessionErrorKind, gatewayAuth: GatewayAuthRequired | null) {
  if (kind === "get3w-balance") return t("session.error.a2c7c5cd1e43");
  if (kind === "get3w-quota") return t("session.error.51d9e8c15d59");
  if (kind === "get3w-request-failed") return t("session.error.f60420a8d3f4");
  if (kind === "model-quote-expired") return t("session.error.55fe50f1bb41");
  if (kind === "model-insufficient-balance") return t("session.error.6d94523608a2");
  if (kind === "model-schema-invalid") return t("session.error.19e44454276c");
  if (kind === "model-session-mismatch") return t("session.error.0a80f797d1da");
  if (kind === "model-upstream-failed") return t("session.error.cb90dab58e2d");
  if (kind === "session-group-assignment") return t("session.error.350c783cab76");
  if (kind === "gateway-selection-required") return t("session.error.1260f2793cba");
  if (kind === "disk-full") {
    return t("session.error.73fbdbeb637f");
  }
  if (kind === "database-error") {
    return t("session.error.8c3277b38243");
  }
  if (kind === "aborted") {
    return t("session.error.bced9e7c858f");
  }
  if (kind === "provider-timeout") {
    return t("session.error.32e734e5faea");
  }
  if (kind === "provider-incomplete") return t("session.error.e47d34b3db90");
  if (kind === "provider-unavailable") return t("session.error.794c46eb154d");
  if (kind === "provider-access-denied") return t("session.error.d0985d6e27c2");
  if (kind === "workspace-unavailable") return t("session.error.ebb4b987190f");
  if (kind === "provider-credentials") return t("session.error.c9082627bc96");
  if (kind === "rate-limited") return t("session.error.2ad6f6295380");
  if (kind === "conversation-too-long") return t("session.error.d3070635574d");
  if (kind === "output-invalid") return t("session.error.cdb76e29c113");
  if (kind === "output-limit") return t("session.error.fed7504357a0");
  if (kind === "attachment-unsupported") return t("session.error.1102034bd889");
  if (kind === "network-unavailable") return t("session.error.f8744edbb537");
  if (kind === "provider-unreachable") return t("session.error.794c46eb154d");
  if (kind === "provider-connection-dropped") return t("session.error.cdb76e29c113");
  if (kind === "model-unavailable") return t("session.error.33832d1d0d80");
  if (kind === "free-model-limit") {
    return t("session.error.452f33acc37d");
  }
  if (kind === "gateway-auth-required") {
    return gatewayAuth?.message ?? t("session.error.0d9755d959d5");
  }
  return null;
}

type GatewayAuthRequired = { connectUrl: string | null; message: string | null };

/**
 * Detects the gateway's in-band `401 { error: { code: "get3w_auth_required",
 * message, auth_url?, provider_id } }`. The body reaches us as a string on
 * whichever field the SDK error exposes (message / responseBody / cause), so
 * match the code and message tolerantly. URLs from upstream errors are never
 * authorization targets; the Connect action navigates to provider Settings.
 */
function detectGatewayAuthRequired(error: unknown, fields: { message: string | null; code: string | null; responseBody: string | null }): GatewayAuthRequired | null {
  const haystack = [fields.message, fields.responseBody, safeStringify(error)].filter(Boolean).join("\n");
  if (!haystack.includes(GATEWAY_AUTH_REQUIRED_ERROR_CODE)) return null;
  for (const candidate of [fields.responseBody, fields.message]) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    if (start < 0) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start));
      const body = recordValue(parsed, "error");
      if (recordValue(body, "code") !== GATEWAY_AUTH_REQUIRED_ERROR_CODE) continue;
      return {
        connectUrl: null,
        message: firstStringValue([body], ["message"]),
      };
    } catch {
      // Not a clean JSON body: retain only the error classification below.
    }
  }
  return {
    connectUrl: null,
    message: fields.code === GATEWAY_AUTH_REQUIRED_ERROR_CODE ? fields.message : null,
  };
}

type GatewayProviderAuthFailure = {
  kind: "gateway-provider-authentication-failed" | "gateway-provider-permission-denied";
  message: string | null;
};

function detectGatewayProviderAuthFailure(fields: ReturnType<typeof sessionErrorFields>): GatewayProviderAuthFailure | null {
  for (const candidate of [fields.responseBody, fields.message]) {
    if (!candidate || candidate.length > 16_384) continue;
    const start = candidate.indexOf("{");
    if (start < 0) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start));
      const body = recordValue(parsed, "error");
      if (recordValue(body, "source") !== "get3w_gateway") continue;
      const code = recordValue(body, "code");
      if (code !== "provider_authentication_failed" && code !== "provider_permission_denied") continue;
      return {
        kind: code === "provider_authentication_failed" ? "gateway-provider-authentication-failed" : "gateway-provider-permission-denied",
        message: firstStringValue([body], ["message"]),
      };
    } catch { /* Ignore malformed or non-gateway error bodies. */ }
  }
  return null;
}

function errorRecoveryPrompt(kind: OpencodeSessionErrorKind) {
  return kind === "aborted" || kind === "provider-timeout" || kind === "provider-incomplete" || kind === "provider-unavailable" || kind === "network-unavailable" || kind === "provider-unreachable" || kind === "provider-connection-dropped" || kind === "model-unavailable" || kind === "rate-limited" || kind === "output-invalid"
    ? interruptedTaskRecoveryPrompt
    : null;
}

function withAttachmentRecoveryHint(text: string) {
  if (!text.includes("file part media type") || !text.includes("not supported")) return text;
  return `${text}\nAn attached file in this conversation uses a format the model can't read. Revert the conversation to before the attachment was sent, or start a new session.`;
}

function withOpenAiTokenRefreshHint(text: string) {
  if (!/Token refresh failed:\s*401/i.test(text)) return text;
  return "OpenAI couldn’t renew the ChatGPT sign-in for this worker. Retry once. If it happens again, reconnect OpenAI under Connect providers → OpenAI → ChatGPT Pro/Plus.";
}

function normalizeSessionError(text: string) {
  return normalizeErrorText(withOpenAiTokenRefreshHint(withAttachmentRecoveryHint(text)), { cap: 500 }).display;
}

function safeRequestId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function firstGatewayRequestId(records: unknown[]) {
  for (const record of records) {
    const body = firstStringValue([record], ["responseBody", "message", "body"]);
    if (typeof body === "string" && body.length <= 16_384) {
      try {
        const parsed: unknown = JSON.parse(body);
        const error = recordValue(parsed, "error");
        const requestId = safeRequestId(recordValue(error, "request_id"));
        if (requestId) return requestId;
      } catch { /* The response body is not JSON. */ }
    }
    const headers = recordValue(record, "responseHeaders");
    if (headers instanceof Headers) {
      const requestId = safeRequestId(headers.get("x-get3w-request-id"));
      if (requestId) return requestId;
    } else if (headers && typeof headers === "object") {
      for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() !== "x-get3w-request-id") continue;
        const requestId = safeRequestId(value);
        if (requestId) return requestId;
      }
    }
  }
  return null;
}

function sessionErrorFields(error: unknown, fallback: string) {
  if (typeof error === "string") {
    return {
      name: null,
      message: error.trim() || fallback,
      status: null,
      provider: null,
      code: null,
      retries: null,
      responseBody: null,
      requestId: null,
    };
  }
  if (!error || typeof error !== "object") {
    return {
      name: null,
      message: fallback,
      status: null,
      provider: null,
      code: null,
      retries: null,
      responseBody: null,
      requestId: null,
    };
  }

  const data = recordValue(error, "data");
  const cause = recordValue(error, "cause");
  const causeData = recordValue(cause, "data");
  const records = [error, data, cause, causeData].filter(Boolean);
  return {
    name: firstStringValue(records, ["name", "type"]),
    message: firstStringValue(records, ["message", "detail", "reason", "error"]),
    status: firstNumberValue(records, ["statusCode", "status"]),
    provider: firstStringValue(records, ["providerID", "providerId", "provider"]),
    code: firstStringValue(records, ["code", "errorCode"]),
    retries: firstNumberValue(records, ["retries", "retryCount"]),
    responseBody: firstStringValue(records, ["responseBody", "body", "response"]),
    requestId: firstGatewayRequestId(records),
  };
}

function providerCredentialCopy(fields: ReturnType<typeof sessionErrorFields>) {
  const evidence: unknown[] = [fields.message, fields.code];
  // Inspect only known fields in a bounded JSON body, never arbitrary nested text.
  if (fields.responseBody && fields.responseBody.length <= 16_384) {
    try {
      const body: unknown = JSON.parse(fields.responseBody);
      for (const record of [body, recordValue(body, "error")]) {
        for (const key of ["message", "error_description", "code"]) {
          evidence.push(recordValue(record, key));
        }
      }
    } catch {
      // Malformed or non-JSON responses provide no credential-specific evidence.
    }
  }
  const signals = evidence.filter((value): value is string => typeof value === "string" && value.length <= 256)
    .map((value) => value.trim().toLowerCase().replace(/[.!]$/, ""));
  if (signals.some((value) => ["token refresh failed: 401", "oauth token refresh failed", "oauth refresh failed"].includes(value))) {
    return { get title() { return t("ui.be4b12b37a23"); }, get description() { return t("ui.6218dd076aa9"); } };
  }
  if (signals.some((value) => ["api key expired", "api key has expired", "api_key_expired", "expired_api_key"].includes(value))) {
    return { get title() { return t("ui.4540941a993d"); }, get description() { return t("ui.09067fbfbd7f"); } };
  }
  if (signals.some((value) => ["invalid api key", "invalid_api_key", "api key is invalid"].includes(value))) {
    return { get title() { return t("ui.6958e06b57f0"); }, get description() { return t("ui.ba026b3251e8"); } };
  }
  return null;
}

/** Inference authentication evidence only; access policy, quotas and Gateway
 * member sign-in failures must not poison an upstream provider's key status. */
export function isProviderCredentialRejection(error: unknown): boolean {
  const fields = sessionErrorFields(error, "");
  const presentation = presentOpencodeSessionError(error);
  const credentialSignal = providerCredentialCopy(fields) !== null;
  if (presentation.kind !== "provider-credentials" && presentation.kind !== "generic" && !(presentation.kind === "provider-access-denied" && credentialSignal)) return false;
  if (presentation.gatewayUsage || presentation.get3wModelsLimit) return false;
  // Gateway authentication is a client/session problem, not evidence that
  // the organization's upstream provider rejected its credential.
  if (/\bGet3W (?:Gateway|Models) (?:API )?key\b/i.test([fields.message, fields.responseBody].filter(Boolean).join(" "))) return false;
  if (fields.status === 429 || (fields.status !== null && fields.status >= 500)) return false;
  return (fields.name === "APIError" && fields.status === 401)
    || /Provider request failed with HTTP 401\b/i.test(fields.message ?? "")
    || credentialSignal;
}

function technicalErrorDetails(error: unknown, fallback: string, fields: ReturnType<typeof sessionErrorFields>) {
  const lines: string[] = [];
  if (fields.name) lines.push(`Error type: ${fields.name}`);
  if (fields.message) lines.push(`Message: ${fields.message}`);
  if (fields.status !== null) lines.push(`Status: ${fields.status}`);
  if (fields.provider) lines.push(`Provider: ${fields.provider}`);
  if (fields.code) lines.push(`Code: ${fields.code}`);
  if (fields.retries !== null) lines.push(`Retries: ${fields.retries}`);
  if (fields.responseBody && fields.responseBody !== fields.message) {
    lines.push(`Response: ${normalizeErrorText(fields.responseBody, { cap: 500 }).display}`);
  }
  if (fields.requestId) lines.push(`Request ID: ${fields.requestId}`);
  if (lines.length > 0) {
    return normalizeErrorText(lines.join("\n"), { cap: 1_500 }).display;
  }

  const serialized = safeStringify(error);
  return normalizeErrorText(serialized && serialized !== "{}" ? serialized : fallback, { cap: 1_500 }).display;
}

export function presentOpencodeSessionError(error: unknown, fallback = "Session failed"): OpencodeSessionErrorPresentation {
  const fields = sessionErrorFields(error, fallback);
  const gatewayAuth = detectGatewayAuthRequired(error, fields);
  const gatewayProviderAuth = detectGatewayProviderAuthFailure(fields);
  const gatewaySelection = safeStringify(error)?.includes("gateway_selection_required") === true;
  const gatewayUsage = parseGatewayUsageError(error);
  const get3wModelsLimit = gatewayUsage ? null : parseGet3WModelsLimitError(error);
  const kind = gatewayProviderAuth?.kind ?? (gatewayAuth ? "gateway-auth-required" : gatewaySelection ? "gateway-selection-required" : get3wModelsLimit ? "generic" : sessionErrorKind(fields.name, fields.message, fields.code, fields.responseBody, fields.status));
  const fallbackTitle = normalizeSessionError(fields.message ?? defaultErrorMessage(fields.name, fallback));
  const credentialCopy = kind === "provider-credentials" ? providerCredentialCopy(fields) : null;
  return {
    kind,
    title: get3wModelsLimit ? t("desktop.text.078ea4dd08c9") : credentialCopy?.title ?? errorTitle(kind, fallbackTitle),
    description: gatewayProviderAuth?.message ?? credentialCopy?.description
      ?? (kind === "config-invalid" ? describeOpencodeConfigError(error) ?? fields.message : null)
      ?? errorDescription(kind, gatewayAuth),
    technicalDetails: kind === "gateway-selection-required" ? "Error code: gateway_selection_required\nStatus: 409" : gatewayAuth ? "Error code: get3w_auth_required\nStatus: 401" : technicalErrorDetails(error, fallback, fields),
    recoveryPrompt: errorRecoveryPrompt(kind),
    ...(gatewayAuth ? { connectUrl: gatewayAuth.connectUrl } : {}),
    ...(gatewayUsage ? { gatewayUsage, providerId: fields.provider } : {}),
    ...(get3wModelsLimit ? { get3wModelsLimit } : {}),
  };
}

export function describeOpencodeSessionError(error: unknown, fallback = "Session failed") {
  const presentation = presentOpencodeSessionError(error, fallback);
  return presentation.description
    ? `${presentation.title}\n${presentation.description}`
    : presentation.title;
}

export function sessionErrorPresentationFromUIMessage(message: UIMessage): OpencodeSessionErrorPresentation | null {
  const part = message.parts.find((candidate) => candidate.type === "text");
  if (!part || part.type !== "text") return null;
  const metadata = part.providerMetadata?.opencode;
  if (!metadata || typeof metadata !== "object") return null;
  const sessionError = "sessionError" in metadata
    ? (metadata as { sessionError?: unknown }).sessionError
    : null;
  if (!sessionError || typeof sessionError !== "object") return null;
  const candidate = sessionError as Partial<OpencodeSessionErrorPresentation>;
  if (
    typeof candidate.kind !== "string" ||
    typeof candidate.title !== "string" ||
    !(typeof candidate.description === "string" || candidate.description === null) ||
    typeof candidate.technicalDetails !== "string" ||
    !(typeof candidate.recoveryPrompt === "string" || candidate.recoveryPrompt === null) ||
    !(candidate.connectUrl === undefined || candidate.connectUrl === null || typeof candidate.connectUrl === "string")
  ) {
    return null;
  }
  if (candidate.gatewayUsage !== undefined && !gatewayUsageErrorEvidenceSchema.safeParse(candidate.gatewayUsage).success) return null;
  if (candidate.get3wModelsLimit !== undefined && !get3wModelsLimitSchema.safeParse(candidate.get3wModelsLimit).success) return null;
  if (candidate.providerId !== undefined && candidate.providerId !== null && typeof candidate.providerId !== "string") return null;
  return candidate as OpencodeSessionErrorPresentation;
}

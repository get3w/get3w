import { t } from "@/i18n";
import { sanitizeCloudMcpHealthDiagnostic } from "../../../app/lib/diagnostic-sanitizer";
import type {
  OpenworkCloudMcpEngineRefresh,
  OpenworkCloudMcpHealth,
  OpenworkCloudMcpProbeTrace,
} from "../../../app/lib/openwork-server";

export type CloudMcpAdvancedRow = {
  label: string;
  value: string;
  tone?: "error" | "muted";
};

const MAX_INLINE_ERROR_LENGTH = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactText(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_INLINE_ERROR_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_INLINE_ERROR_LENGTH)}…`;
}

/** Flatten an unknown error payload into one support-readable line. */
export function describeCloudMcpErrorDetail(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  if (typeof error === "string") return compactText(error) || null;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  try {
    return compactText(JSON.stringify(error));
  } catch {
    return compactText(String(error));
  }
}

/**
 * The engine stores only `Error.message` for a failed MCP connection (a
 * network/TLS failure surfaces as the bare "fetch failed"), so the raw string
 * matters on a support call even when it looks unhelpfully short.
 */
export function cloudMcpEngineErrorText(health: OpenworkCloudMcpHealth | null): string | null {
  return describeCloudMcpErrorDetail(health?.engine.error);
}

function transportCauseText(details: unknown): string | null {
  if (!isRecord(details)) return null;
  const transport = details.transport;
  if (!isRecord(transport)) return null;
  const parts: string[] = [];
  if (typeof transport.message === "string") parts.push(transport.message);
  if (typeof transport.code === "string") parts.push(`code ${transport.code}`);
  const causes = Array.isArray(transport.causes) ? transport.causes : [];
  for (const cause of causes) {
    if (!isRecord(cause)) continue;
    const causeParts = [
      typeof cause.message === "string" ? cause.message : null,
      typeof cause.code === "string" ? `code ${cause.code}` : null,
      typeof cause.syscall === "string" ? `syscall ${cause.syscall}` : null,
    ].filter((item): item is string => Boolean(item));
    if (causeParts.length) parts.push(`caused by: ${causeParts.join(" · ")}`);
  }
  return parts.length ? compactText(parts.join(" — ")) : null;
}

function formatEpoch(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "never";
  try {
    return new Date(value).toISOString();
  } catch {
    return "invalid time";
  }
}

function shortRevision(revision: string | null | undefined): string {
  const trimmed = revision?.trim() ?? "";
  if (!trimmed) return "none";
  return trimmed.length > 12 ? trimmed.slice(0, 12) : trimmed;
}

export function cloudMcpProbeTraceLines(trace: OpenworkCloudMcpProbeTrace | null | undefined): string[] {
  if (!trace) return [];
  return trace.steps.map((step) => {
    const parts = [
      step.step,
      step.ok ? "ok" : "failed",
      ...(step.httpStatus !== undefined ? [`HTTP ${step.httpStatus}`] : []),
      `${Math.max(0, Math.round(step.latencyMs))} ms`,
    ];
    const errorText = describeCloudMcpErrorDetail(step.error);
    return `${parts.join(" · ")}${errorText ? ` — ${errorText}` : ""}`;
  });
}

export function cloudMcpEngineRefreshLines(refresh: OpenworkCloudMcpEngineRefresh | null | undefined): string[] {
  if (!refresh) return [];
  const lines = refresh.steps.map((step) => {
    const label = step.step === "engine_disconnect" ? "engine disconnect" : step.step === "reapply" ? "re-register and verify" : step.step;
    const detailText = describeCloudMcpErrorDetail(step.detail);
    return `${label} · ${step.ok ? "ok" : "failed"} · ${Math.max(0, Math.round(step.latencyMs))} ms${detailText ? ` — ${detailText}` : ""}`;
  });
  if (!refresh.performed) {
    lines.unshift(`not performed${refresh.reason ? ` (${refresh.reason})` : ""}`);
  }
  return lines;
}

/**
 * Support-call rows for the card's Advanced section. Everything here is
 * derived from the already-sanitized health payload; no secrets are present.
 */
export function cloudMcpAdvancedRows(health: OpenworkCloudMcpHealth | null): CloudMcpAdvancedRow[] {
  if (!health) return [];
  const rows: CloudMcpAdvancedRow[] = [];
  const failure = health.firstFailure;
  rows.push({ get label() { return t("ui.46342ec1eec9"); }, value: String(health.phase) });
  if (failure) {
    rows.push({
      get label() { return t("ui.7031edbcf9c4"); },
      value: `${failure.code} · stage ${failure.stage} · ${failure.retryable ? "retryable" : "not retryable"}`,
      tone: "error",
    });
    rows.push({ get label() { return t("ui.0d47aa98e19c"); }, value: compactText(failure.message), tone: "error" });
    const failureDetail = describeCloudMcpErrorDetail(failure.details);
    if (failureDetail) rows.push({ get label() { return t("ui.b6711f92727c"); }, value: failureDetail, tone: "muted" });
    if (failure.requestId) rows.push({ get label() { return t("ui.d561f528baf7"); }, value: failure.requestId });
    if (failure.referenceId) rows.push({ get label() { return t("ui.293aba9f5a9d"); }, value: failure.referenceId });
  }
  const engineError = cloudMcpEngineErrorText(health);
  rows.push({
    get label() { return t("ui.120af1014baa"); },
    value: engineError ? `${health.engine.status} — ${engineError}` : String(health.engine.status),
    ...(health.engine.status === "connected" ? {} : { tone: "error" as const }),
  });
  const inspection = health.engineInspection;
  if (inspection?.checked) {
    if (inspection.cloudPresent === false) {
      rows.push({
        get label() { return t("ui.cc427f6b122f"); },
        value: "openwork-cloud is not registered in the engine (the dynamic entry is lost after an engine restart) — use Refresh engine connection",
        tone: "error",
      });
    }
    const servers = inspection.servers ?? [];
    const summary = servers
      .map((server) => `${server.name} ${server.status}${server.error ? ` — ${compactText(server.error)}` : ""}`)
      .join("; ");
    rows.push({
      get label() { return t("ui.bc0d0c25aeea"); },
      value: servers.length ? compactText(`${inspection.serverCount ?? servers.length} tracked: ${summary}`) : "none tracked",
      ...(servers.some((server) => server.status !== "connected") ? {} : { tone: "muted" as const }),
    });
  }
  rows.push({
    get label() { return t("ui.52bfe584a5fc"); },
    value: `${health.delivery.state} · desired ${shortRevision(health.delivery.desiredRevision)} · applied ${shortRevision(health.delivery.appliedRevision)} · last attempt ${formatEpoch(health.delivery.lastAttemptAt)}${health.delivery.trigger ? ` · trigger ${health.delivery.trigger}` : ""}`,
  });
  const direct = health.tools.direct;
  if (direct.checked || direct.trace) {
    const probeFailure = direct.failure ?? null;
    const cause = transportCauseText(probeFailure?.details);
    const summary = direct.checked
      ? direct.missing.length === 0 && direct.present.length > 0
        ? `ok · tools ${direct.present.join(", ")}`
        : probeFailure
          ? compactText(`${probeFailure.code} — ${probeFailure.message}`)
          : `missing ${direct.missing.join(", ") || "none"}`
      : probeFailure
        ? compactText(`${probeFailure.code} — ${probeFailure.message}`)
        : "not checked";
    rows.push({
      get label() { return t("ui.e0f767650955"); },
      value: summary,
      ...(direct.checked && direct.missing.length === 0 && direct.present.length > 0 ? {} : { tone: "error" as const }),
    });
    if (cause) rows.push({ get label() { return t("ui.580a8d22afd3"); }, value: cause, tone: "error" });
    if (direct.trace?.endpoint) rows.push({ get label() { return t("ui.3df9726c68ba"); }, value: direct.trace.endpoint, tone: "muted" });
    if (direct.trace?.serverInfo?.name) {
      rows.push({
        get label() { return t("ui.613477173212"); },
        value: `${direct.trace.serverInfo.name}${direct.trace.serverInfo.version ? ` ${direct.trace.serverInfo.version}` : ""}${direct.trace.protocolVersion ? ` · protocol ${direct.trace.protocolVersion}` : ""}`,
        tone: "muted",
      });
    }
  } else {
    rows.push({ get label() { return t("ui.e0f767650955"); }, value: "not run — use Test now to verify the endpoint outside the engine", tone: "muted" });
  }
  const token = health.desired.token;
  const expiresAt = token.metadata.expiresAt;
  rows.push({
    get label() { return t("ui.c77b78233cc4"); },
    value: token.present
      ? `present${typeof expiresAt === "string" || typeof expiresAt === "number" ? ` · expires ${expiresAt}` : ""}`
      : "missing",
    ...(token.present ? {} : { tone: "error" as const }),
  });
  const org = health.desired.org;
  if (org && (org.id || org.slug || org.name)) {
    rows.push({ get label() { return t("ui.d764d42592fc"); }, value: [org.name, org.slug, org.id].filter(Boolean).join(" · "), tone: "muted" });
  }
  const compatibility = health.compatibility;
  rows.push({
    get label() { return t("ui.f89ea27036ac"); },
    value: `app ${describeCloudMcpErrorDetail(compatibility.openwork.app?.version) ?? "unknown"} · server ${compatibility.openwork.serverVersion ?? "unknown"} · engine ${compatibility.opencode.actualVersion ?? "unknown"}${compatibility.opencode.expectedVersion ? ` (expected ${compatibility.opencode.expectedVersion})` : ""}`,
    tone: "muted",
  });
  rows.push({
    get label() { return t("ui.0efd92a33590"); },
    value: `${health.checkedAt}${typeof health.durationMs === "number" ? ` · took ${Math.max(0, Math.round(health.durationMs))} ms` : ""}`,
    tone: "muted",
  });
  return rows;
}

/**
 * One-click support bundle: the sanitized health plus the operation context a
 * support engineer needs to line the report up with Den/server logs.
 */
export function buildCloudMcpSupportBundle(input: {
  health: OpenworkCloudMcpHealth | null;
  refresh?: OpenworkCloudMcpEngineRefresh | null;
  context?: {
    workspaceId?: string | null;
    orgId?: string | null;
    denBaseUrl?: string | null;
    serverBaseUrl?: string | null;
  };
  capturedAt?: string;
}): string {
  const bundle = {
    kind: "openwork-cloud-mcp-diagnostic",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    context: {
      workspaceId: input.context?.workspaceId ?? null,
      orgId: input.context?.orgId ?? null,
      denBaseUrl: input.context?.denBaseUrl ?? null,
      serverBaseUrl: input.context?.serverBaseUrl ?? null,
    },
    ...(input.refresh ? { engineRefresh: input.refresh } : {}),
    health: input.health ? sanitizeCloudMcpHealthDiagnostic(input.health) : null,
  };
  return JSON.stringify(bundle, null, 2);
}

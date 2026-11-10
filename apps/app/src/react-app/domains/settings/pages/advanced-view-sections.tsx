/** @jsxImportSource react */
import { useState, type ComponentProps, type ReactNode } from "react";
import { Cpu, RefreshCcw, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { OpenworkServerClient, OpenworkCloudMcpHealth, OpenworkRuntimeConfigStatus } from "@/app/lib/openwork-server";
import { sanitizeCloudMcpHealthDiagnostic, sanitizeDiagnosticRecord } from "@/app/lib/diagnostic-sanitizer";
import {
  DEFAULT_DEN_API_BASE_URL,
  DEFAULT_DEN_BASE_URL,
  readDenBootstrapConfig,
  readDenSettings,
} from "@/app/lib/den";
import {
  describeCloudMcpTarget,
  describeDenEndpointSource,
  type DenEndpointSource,
} from "@/app/lib/den-endpoint-sources";
import { useOpencodeEngineControls } from "@/react-app/shell/opencode-engine-controls";
import { showEngineMigrationProgress } from "@/react-app/shell/engine-migration";
import { isDesktopRuntime } from "@/app/utils";
import { t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useFeatureFlagsPreferences } from "../state/feature-flags-preferences";
import { useDesktopRestriction } from "../../cloud/desktop-config-provider";
import {
  SettingsInset,
  SettingsNotice,
  SettingsStatusBadge,
} from "../settings-section";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemFootnote,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
} from "../settings-layout";

type SettingsTone = ComponentProps<typeof SettingsStatusBadge>["tone"];

const DESKTOP_BOOTSTRAP_PATH_HINT = "~/.config/openwork/desktop-bootstrap.json";

interface RuntimeStatusCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  statusLabel: string;
  tone: SettingsTone;
  detailLines?: string[];
}

function RuntimeStatusCard(props: RuntimeStatusCardProps) {
  return (
    <SettingsInset className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-gray-6/60 bg-gray-1/70 text-gray-12">
          {props.icon}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-12">{props.title}</div>
          <div className="text-xs text-gray-9">{props.description}</div>
        </div>
      </div>
      <SettingsStatusBadge className="inline-flex min-h-0 justify-start px-0 py-0" tone={props.tone} label={props.statusLabel} />
      {props.detailLines?.length ? (
        <div className="space-y-1 border-t border-gray-6/50 pt-2 text-[11px] text-gray-9">
          {props.detailLines.map((line) => (
            <div key={line} className="truncate" title={line}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </SettingsInset>
  );
}

interface AdvancedRuntimeSectionProps {
  clientStatusLabel: string;
  clientTone: SettingsTone;
  clientDetailLines: string[];
  openworkStatusLabel: string;
  openworkTone: SettingsTone;
  openworkDetailLines: string[];
}

export function AdvancedRuntimeSection(props: AdvancedRuntimeSectionProps) {
  return (
    <LayoutSection id="advanced-runtime">
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("settings.runtime_title")}</LayoutSectionTitle>
        <LayoutSectionDescription>{t("settings.runtime_desc")}</LayoutSectionDescription>
      </LayoutSectionHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <RuntimeStatusCard
          icon={<Cpu size={18} />}
          title={t("settings.opencode_engine_label")}
          description={t("settings.opencode_engine_desc")}
          statusLabel={props.clientStatusLabel}
          tone={props.clientTone}
          detailLines={props.clientDetailLines}
        />
        <RuntimeStatusCard
          icon={<Server size={18} />}
          title={t("settings.openwork_server_label")}
          description={t("settings.openwork_server_desc")}
          statusLabel={props.openworkStatusLabel}
          tone={props.openworkTone}
          detailLines={props.openworkDetailLines}
        />
      </div>
    </LayoutSection>
  );
}

function DiagnosticRow(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-gray-6 bg-gray-2/50 p-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-8">{props.label}</div>
      <div className="min-w-0 break-all font-mono text-[11px] text-gray-12">{props.value}</div>
    </div>
  );
}

function joinList(values: string[]): string {
  return values.length ? values.join(", ") : "none";
}

function formatMaybe(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "unknown";
  return String(value);
}

function formatMetadataRecord(value: Record<string, string | number | boolean | null> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return "none";
  return Object.entries(value).map(([key, nested]) => `${key}=${formatMaybe(nested)}`).join(", ");
}

function formatSupportedFeatures(features: OpenworkCloudMcpHealth["compatibility"]["supportedFeatures"]): string {
  return Object.entries(features).map(([key, enabled]) => `${key}:${enabled ? "yes" : "no"}`).join(", ");
}

function formatPluginHashes(hashes: OpenworkCloudMcpHealth["compatibility"]["pluginFileHashes"]): string {
  if (hashes.length === 0) return "none";
  return hashes.map((hash) => `${hash.name}=${hash.sha256 ? hash.sha256.slice(0, 12) : `unavailable${hash.error ? ` (${hash.error})` : ""}`}`).join(", ");
}

function formatMcpToolExposure(input: { checked: boolean; includesMcpTools: boolean | null; present: string[]; missing: string[]; limitation?: string }): string {
  if (!input.checked) return t("ui.62849b956e0e");
  const includes = input.includesMcpTools === null ? "unknown" : input.includesMcpTools ? "yes" : "no";
  return `includes MCP tools: ${includes}; present ${joinList(input.present)}; missing ${joinList(input.missing)}${input.limitation ? `; limitation: ${input.limitation}` : ""}`;
}

interface AdvancedCloudMcpDiagnosticsSectionProps {
  cloudMcpHealth: OpenworkCloudMcpHealth | null;
  onRefresh: () => Promise<OpenworkCloudMcpHealth | null>;
}

export function AdvancedCloudMcpDiagnosticsSection(props: AdvancedCloudMcpDiagnosticsSectionProps) {
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const safeHealth = sanitizeCloudMcpHealthDiagnostic(props.cloudMcpHealth);
  const projection = props.cloudMcpHealth?.tools.providerProjection;
  const compatibility = props.cloudMcpHealth?.compatibility;

  const refresh = async () => {
    setBusy(true);
    setCopyStatus(null);
    setRefreshError(null);
    try {
      await props.onRefresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : t("ui.977db93932a4"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const payload = JSON.stringify({ cloudMcpHealth: safeHealth }, null, 2);
    await navigator.clipboard.writeText(payload);
    setCopyStatus("Copied sanitized Cloud diagnostic.");
  };

  return (
    <LayoutSection id="advanced-agent-access">
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("ui.b4cbe7cce71d")}</LayoutSectionTitle>
        <LayoutSectionDescription>
          {t("ui.51377226b160")}
        </LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.4acce3a89c7d")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            {t("ui.3bd07e870f7f")}
          </LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
              <RefreshCcw size={14} className={busy ? "animate-spin" : ""} />
              {t("ui.0e9161011702")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={!props.cloudMcpHealth}>
              {t("ui.c5734e078203")}
            </Button>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>

        {copyStatus ? <SettingsNotice>{copyStatus}</SettingsNotice> : null}
        {refreshError ? <SettingsNotice tone="error">{refreshError}</SettingsNotice> : null}
        {props.cloudMcpHealth ? (
          <div className="space-y-2 rounded-xl border border-gray-6 bg-gray-1/60 p-3">
            <div className="grid gap-2">
              <DiagnosticRow label={t("ui.68971a708371")} value={`${props.cloudMcpHealth.workspace.id} (${props.cloudMcpHealth.workspace.directory ?? "no directory"})`} />
              <DiagnosticRow label={t("ui.d397c20ebd19")} value={props.cloudMcpHealth.desired.revision ?? "none"} />
              <DiagnosticRow label={t("ui.fdf04805215a")} value={props.cloudMcpHealth.delivery.appliedRevision ?? "none"} />
              <DiagnosticRow label={t("ui.52bfe584a5fc")} value={`${props.cloudMcpHealth.delivery.state}${props.cloudMcpHealth.delivery.trigger ? ` / ${props.cloudMcpHealth.delivery.trigger}` : ""}`} />
              <DiagnosticRow label={t("ui.7557fe2a37cd")} value={props.cloudMcpHealth.engine.status} />
              {props.cloudMcpHealth.engineInspection?.checked ? (
                <DiagnosticRow
                  label={t("ui.bc0d0c25aeea")}
                  value={(props.cloudMcpHealth.engineInspection.servers ?? []).length
                    ? (props.cloudMcpHealth.engineInspection.servers ?? []).map((server) => `${server.name} ${server.status}${server.error ? ` (${server.error})` : ""}`).join("; ")
                    : t("ui.14bea5584e7f")}
                />
              ) : null}
              <DiagnosticRow label={t("ui.0e92e34f33d9")} value={projection?.checked ? `${projection.provider ?? "unknown"}/${projection.model ?? "unknown"}; source ${projection.source ?? "unknown"}; tool calling ${formatMaybe(projection.toolCalling)}; present ${joinList(projection.present)}; missing ${joinList(projection.missing)}${projection.limitation ? `; limitation: ${projection.limitation}` : ""}` : t("ui.62849b956e0e")} />
              <DiagnosticRow label={t("ui.3d8767eb1d8d")} value={`derived present ${joinList(props.cloudMcpHealth.tools.present)}; missing ${joinList(props.cloudMcpHealth.tools.missing)}`} />
              <DiagnosticRow label={t("ui.62f925b9903e")} value={`checked ${props.cloudMcpHealth.tools.direct.checked ? "yes" : "no"}; present ${joinList(props.cloudMcpHealth.tools.direct.present)}; missing ${joinList(props.cloudMcpHealth.tools.direct.missing)}`} />
              {props.cloudMcpHealth.tools.direct.trace ? (
                <DiagnosticRow
                  label={t("ui.6aa69a2bc047")}
                  value={`${props.cloudMcpHealth.tools.direct.trace.endpoint ?? "unknown endpoint"} · ${props.cloudMcpHealth.tools.direct.trace.latencyMs} ms · ${props.cloudMcpHealth.tools.direct.trace.steps.map((step) => `${step.step} ${step.ok ? "ok" : "failed"}${step.httpStatus !== undefined ? ` (HTTP ${step.httpStatus})` : ""} ${Math.max(0, Math.round(step.latencyMs))}ms`).join(" → ") || "no steps"}`}
                />
              ) : null}
              {props.cloudMcpHealth.firstFailure ? (
                <DiagnosticRow
                  label={t("ui.268344cb7a47")}
                  value={`${props.cloudMcpHealth.firstFailure.code} (stage ${props.cloudMcpHealth.firstFailure.stage}; ${props.cloudMcpHealth.firstFailure.retryable ? "retryable" : t("ui.fa8c97fcdf9c")}): ${props.cloudMcpHealth.firstFailure.message}`}
                />
              ) : null}
              <DiagnosticRow label={t("ui.c0648823e77d")} value={`present ${joinList(props.cloudMcpHealth.pluginCanaries.present)}; missing ${joinList(props.cloudMcpHealth.pluginCanaries.missing)}`} />
              <DiagnosticRow label={t("ui.5816af8ff1a1")} value={`schema v${props.cloudMcpHealth.schemaVersion}; connect catalog ${props.cloudMcpHealth.connectCatalogEnabled ? "enabled" : "disabled"}`} />
              {compatibility ? (
                <>
                  <DiagnosticRow label={t("ui.156d2a8c42d3")} value={`server ${formatMaybe(compatibility.openwork.serverVersion)}; app ${formatMetadataRecord(compatibility.openwork.app)}`} />
                  <DiagnosticRow label={t("ui.692a3f2bf52a")} value={`expected ${formatMaybe(compatibility.opencode.expectedVersion)}; actual ${formatMaybe(compatibility.opencode.actualVersion)}; probe ${compatibility.opencode.probe}`} />
                  <DiagnosticRow label={t("ui.9da618e2ddf9")} value={formatSupportedFeatures(compatibility.supportedFeatures)} />
                  <DiagnosticRow label={t("ui.8dc892694635")} value={formatMcpToolExposure(compatibility.experimentalToolIds)} />
                  <DiagnosticRow label={t("ui.cf21de03eca2")} value={formatMcpToolExposure(compatibility.experimentalProviderTools)} />
                  <DiagnosticRow label={t("ui.f6886b0afe2a")} value={formatPluginHashes(compatibility.pluginFileHashes)} />
                </>
              ) : null}
              <DiagnosticRow label={t("ui.fb92e59e2efc")} value={props.cloudMcpHealth.checkedAt} />
            </div>
            <details className="rounded-lg bg-gray-3 p-2">
              <summary className="cursor-pointer text-[11px] font-medium text-gray-11">{t("ui.6674d32fbc73")}</summary>
              <pre className="mt-2 max-h-72 overflow-auto font-mono text-[11px] text-gray-11">
                {JSON.stringify(safeHealth, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <SettingsNotice>{t("ui.e992e156d225")}</SettingsNotice>
        )}
      </LayoutSectionItem>
    </LayoutSection>
  );
}

interface AdvancedRuntimeConfigSourcesSectionProps {
  busy: boolean;
  canInspect: boolean;
  configStatus: OpenworkRuntimeConfigStatus | null;
  configStatusBusy: boolean;
  configStatusError: string | null;
  onRefresh: () => Promise<void>;
}

function formatKeys(keys: string[]) {
  return keys.length ? keys.join(", ") : "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizedConfig(config: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDiagnosticRecord(config);
}

function countRecord(value: unknown) {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function providerModelCount(config: Record<string, unknown>) {
  const providers = isRecord(config.provider) ? config.provider : {};
  return Object.values(providers).reduce<number>((total, provider) => {
    if (!isRecord(provider)) return total;
    return total + countRecord(provider.models);
  }, 0);
}

function RuntimeConfigSummary(props: { config: Record<string, unknown> }) {
  const config = props.config;
  const providers = countRecord(config.provider);
  const models = providerModelCount(config);
  const agents = countRecord(config.agent);
  const plugins = countArray(config.plugin);
  const mcps = countRecord(config.mcp);
  const permissions = countRecord(config.permission);
  const disabledProviders = countArray(config.disabled_providers);
  const defaultAgent = typeof config.default_agent === "string" ? config.default_agent : t("ui.1aef93991721");

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-6 bg-gray-2/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.94da52ecd6c5")}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-gray-12" title={defaultAgent}>{defaultAgent}</div>
      </div>
      <div className="rounded-lg border border-gray-6 bg-gray-2/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.03171a357897")}</div>
        <div className="mt-1 font-mono text-[11px] text-gray-12">{providers} {t("ui.90a61bce5394")} {models} {"models"}</div>
      </div>
      <div className="rounded-lg border border-gray-6 bg-gray-2/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.2a62b75ac8cb")}</div>
        <div className="mt-1 font-mono text-[11px] text-gray-12">{agents} {t("ui.e75a0beeba56")} {plugins} {"plugins"}</div>
      </div>
      <div className="rounded-lg border border-gray-6 bg-gray-2/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.2405fd6f4c80")}</div>
        <div className="mt-1 font-mono text-[11px] text-gray-12">{mcps} {t("ui.813de8cc3959")} {permissions} {t("ui.b5f29e4b4777")}</div>
      </div>
      {disabledProviders ? (
        <div className="rounded-lg border border-gray-6 bg-gray-2/60 p-2 sm:col-span-2 lg:col-span-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-8">{t("ui.1be88dd22d12")}</div>
          <div className="mt-1 font-mono text-[11px] text-gray-12">{disabledProviders}</div>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeConfigSourceBlock(props: {
  title: string;
  description: string;
  path?: string;
  exists?: boolean;
  keys: string[];
  config: Record<string, unknown>;
}) {
  const safeConfig = sanitizedConfig(props.config);
  return (
    <div className="space-y-2 rounded-xl border border-gray-6 bg-gray-1/70 p-3">
      <div>
        <div className="font-medium text-gray-12">{props.title}</div>
        <div className="text-[11px] text-gray-9">{props.description}</div>
        {props.path ? <div className="mt-1 break-all font-mono text-[11px] text-gray-8">{props.path}</div> : null}
        {props.exists !== undefined ? <div className="text-[11px] text-gray-9">{props.exists ? t("ui.b0ee315f4ac6") : t("ui.e3ebaa16dd9d")}</div> : null}
        <div className="text-[11px] text-gray-9">{t("ui.800e29b5b047")} {formatKeys(props.keys)}</div>
      </div>
      <RuntimeConfigSummary config={safeConfig} />
      <details className="rounded-lg bg-gray-3 p-2">
        <summary className="cursor-pointer text-[11px] font-medium text-gray-11">{t("ui.f8e29d2661ff")}</summary>
        <pre className="mt-2 max-h-56 overflow-auto font-mono text-[11px] text-gray-11">
          {JSON.stringify(safeConfig, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function AdvancedRuntimeConfigSourcesSection(props: AdvancedRuntimeConfigSourcesSectionProps) {
  const effectiveRuntimeConfig = props.configStatus
    ? sanitizedConfig(props.configStatus.effectiveRuntime ?? props.configStatus.runtime)
    : null;
  const runtimeConfig = props.configStatus ? sanitizedConfig(props.configStatus.runtime) : null;
  return (
    <LayoutSection id="advanced-config-sources">
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("ui.88d5b2e2dbc6")}</LayoutSectionTitle>
        <LayoutSectionDescription>
          {t("ui.ec18c9204bd3")}
        </LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.4c3f5c6b3927")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            {t("ui.1bcbdfda52b7")}
          </LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void props.onRefresh()}
              disabled={props.busy || props.configStatusBusy || !props.canInspect}
            >
              <RefreshCcw size={14} className={props.configStatusBusy ? "animate-spin" : ""} />
              {t("ui.0e9161011702")}
            </Button>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
        {props.configStatusError ? <SettingsNotice>{props.configStatusError}</SettingsNotice> : null}
        {props.configStatus ? (
          <div className="space-y-3 rounded-xl border border-gray-6 bg-gray-1/60 p-3 text-xs text-gray-10">
            <div className="space-y-2 rounded-xl border border-blue-6/50 bg-blue-2/40 p-3">
              <div className="font-medium text-gray-12">{t("ui.9e08ad0428d9")}</div>
              <div className="text-[11px] text-gray-9">
                {t("ui.af3d61a27665")}
              </div>
              <RuntimeConfigSummary config={effectiveRuntimeConfig ?? {}} />
              <details className="rounded-lg bg-gray-3 p-2">
                <summary className="cursor-pointer text-[11px] font-medium text-gray-11">{t("ui.901e77bd9cb6")}</summary>
                <pre className="mt-2 max-h-72 overflow-auto font-mono text-[11px] text-gray-11">
                  {JSON.stringify(effectiveRuntimeConfig, null, 2)}
                </pre>
              </details>
            </div>
            {props.configStatus.sources ? (
              <div className="space-y-3">
                <div>
                  <div className="font-medium text-gray-12">{t("ui.0833e15324dd")}</div>
                  <div className="text-[11px] text-gray-9">
                    {t("ui.f07f1b610adf")}
                  </div>
                </div>
                <RuntimeConfigSourceBlock
                  title={t("ui.ee0f19c56abd")}
                  description={t("ui.1a98634842c9")}
                  path={props.configStatus.sources.projectOpencode.path}
                  exists={props.configStatus.sources.projectOpencode.exists}
                  keys={props.configStatus.sources.projectOpencode.keys}
                  config={props.configStatus.sources.projectOpencode.config}
                />
                <RuntimeConfigSourceBlock
                  title={t("ui.e1908f834406")}
                  description={t("ui.ead48ca0ee86")}
                  path={props.configStatus.sources.globalOpencode.path}
                  exists={props.configStatus.sources.globalOpencode.exists}
                  keys={props.configStatus.sources.globalOpencode.keys}
                  config={props.configStatus.sources.globalOpencode.config}
                />
                <RuntimeConfigSourceBlock
                  title={t("ui.a47842eec7c0")}
                  description={t("ui.c1a369b75670")}
                  keys={props.configStatus.sources.runtimeDatabase.keys}
                  config={props.configStatus.sources.runtimeDatabase.config}
                />
                <RuntimeConfigSourceBlock
                  title={t("ui.2d308f331bf3")}
                  description={t("ui.e53c8e2bf09e")}
                  keys={props.configStatus.sources.injected.keys}
                  config={props.configStatus.sources.injected.config}
                />
              </div>
            ) : null}
            <div>
              <div className="font-medium text-gray-12">{t("ui.379319776fba")}</div>
              <div>{t("ui.9a14cf601e37")} {formatKeys(props.configStatus.runtimeKeys)}</div>
            </div>
            <div>
              <div className="font-medium text-gray-12">{t("ui.2ee001ea1fdf")}</div>
              <div className="break-all">{props.configStatus.userOpencode.path}</div>
              <div>{props.configStatus.userOpencode.exists ? t("ui.b0ee315f4ac6") : t("ui.e3ebaa16dd9d")}</div>
              <div>{t("ui.bab0b431cec7")} {formatKeys(props.configStatus.userOpencode.keys)}</div>
            </div>
            <div>
              <div className="font-medium text-gray-12">{t("ui.3c1cf38c13a2")}</div>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-3 p-2 font-mono text-[11px] text-gray-11">
                {JSON.stringify(runtimeConfig, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </LayoutSectionItem>
    </LayoutSection>
  );
}

export function AdvancedWorkspaceRunModeSection() {
  const { workspaceRunModeEnabled, toggleWorkspaceRunMode } = useFeatureFlagsPreferences();
  const restricted = useDesktopRestriction("allowControlSettings");
  return (
    <LayoutSection id="advanced-workspace-run-mode">
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("ui.43c8dc900465")}</LayoutSectionTitle>
        <LayoutSectionDescription>{t("ui.26702576625b")}</LayoutSectionDescription>
      </LayoutSectionHeader>
      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.f01b7af048a6")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            {t("ui.bc164fa53d43")}
          </LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Switch
              data-testid="workspace-run-mode-flag"
              aria-label={t("ui.f01b7af048a6")}
              checked={workspaceRunModeEnabled}
              disabled={restricted || !isDesktopRuntime()}
              onCheckedChange={toggleWorkspaceRunMode}
            />
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
        <LayoutSectionItemFootnote>
          {t("ui.41244ad9037d")}
        </LayoutSectionItemFootnote>
      </LayoutSectionItem>
    </LayoutSection>
  );
}

export function AdvancedEngineV2PreviewSection(props: { client: OpenworkServerClient | null }) {
  const engine = useOpencodeEngineControls(props.client);
  if (!isDesktopRuntime()) return null;
  const runtimeError = engine.status?.enabled ? engine.status.lastError : undefined;
  const engineNote = engine.blockedReason ?? (engine.migrating ? t("ui.80638d1f51d7") : undefined);
  return (
    <LayoutSection id="advanced-experimental-engine">
      <LayoutSectionHeader><LayoutSectionTitle>{t("ui.4891f9535778")}</LayoutSectionTitle></LayoutSectionHeader>
      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.166ce750496b")}</LayoutSectionItemTitle>
          <LayoutSectionItemHeaderActions>
            <ToggleGroup aria-label={t("ui.166ce750496b")} value={[engine.selected]} variant="outline" disabled={engine.disabled}
              onValueChange={(value) => { if (value[0] === "v1" || value[0] === "v2") engine.select(value[0]); }}>
              <ToggleGroupItem value="v1" data-engine="v1">{t("ui.e3796b98fa2b")}</ToggleGroupItem>
              <ToggleGroupItem value="v2" data-engine="v2">{t("ui.dddc1eeba473")}</ToggleGroupItem>
            </ToggleGroup>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
        {engineNote ? <p className="text-xs text-muted-foreground">{engineNote}</p> : null}
        {engine.status?.enabled && !engine.status.running && !engine.status.lastError ? <p role="status" className="text-xs text-muted-foreground">{t("ui.c0de40439d77")}</p> : null}
        {engine.error || runtimeError ? <p role="alert" className="text-xs text-destructive">{engine.error ?? runtimeError}</p> : null}
      </LayoutSectionItem>
      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("ui.17a5386f815d")}</LayoutSectionItemTitle>
          <LayoutSectionItemHeaderActions>
            {engine.migrating
              ? <Button variant="outline" size="sm" onClick={showEngineMigrationProgress}>{t("engine_migration.show_progress")}</Button>
              : <Button variant="outline" size="sm" disabled={engine.disabled || !engine.status?.migration} onClick={engine.openMigration}>{t("ui.1f74ec4bfae6")}</Button>}
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
        {engine.message ? <p role="status" className="text-xs text-muted-foreground">{engine.message}</p> : null}
      </LayoutSectionItem>
      <details className="text-xs text-muted-foreground"><summary>{t("ui.0e7a45b44f16")}</summary>
        <p className="py-2">{t("ui.397f7a0260ad")}</p>
        {engine.status?.running ? <p>{t("ui.3af0e55ccc96")} {engine.status.version} · {engine.status.mirroredProviderIds.length} {t("ui.e1fe12cb1223")} {engine.status.catalogModelIds.length} {"models"}</p> : null}
      </details>
    </LayoutSection>
  );
}

interface AdvancedDeveloperSectionProps {
  busy: boolean;
  developerMode: boolean;
  opencodeDevModeEnabled: boolean;
  deepLinkOpen: boolean;
  deepLinkInput: string;
  deepLinkBusy: boolean;
  deepLinkStatus: string | null;
  onToggleDeveloperMode: () => void;
  onToggleDeepLink: () => void;
  onDeepLinkInput: (input: string) => void;
  onSubmitDeepLink: () => Promise<void>;
}

export function AdvancedDeveloperSection(props: AdvancedDeveloperSectionProps) {
  return (
    <LayoutSection id="advanced-developer">
      <LayoutSectionHeader>
        <LayoutSectionTitle>{t("settings.developer")}</LayoutSectionTitle>
      </LayoutSectionHeader>

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("settings.developer_mode_title")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>{t("settings.developer_mode_desc")}</LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Switch
              aria-label={t("settings.developer_mode_title")}
              checked={props.developerMode}
              onCheckedChange={props.onToggleDeveloperMode}
            />
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>
      </LayoutSectionItem>

      {isDesktopRuntime() && props.opencodeDevModeEnabled && props.developerMode ? (
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.open_deeplink_title")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.open_deeplink_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onToggleDeepLink}
                disabled={props.busy || props.deepLinkBusy}
              >
                {props.deepLinkOpen ? t("common.hide") : t("settings.open_deeplink_button")}
              </Button>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>

          {props.deepLinkOpen ? (
            <div className="space-y-3">
              <Field>
                <FieldLabel htmlFor="advanced-debug-deep-link">{t("settings.open_deeplink_title")}</FieldLabel>
                <Textarea
                  id="advanced-debug-deep-link"
                  value={props.deepLinkInput}
                  onChange={(event) => props.onDeepLinkInput(event.currentTarget.value)}
                  rows={3}
                  placeholder={t("ui.940a4cb37907")}
                  className="font-mono text-xs"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void props.onSubmitDeepLink()}
                  disabled={props.busy || props.deepLinkBusy || !props.deepLinkInput.trim()}
                >
                  {props.deepLinkBusy ? t("settings.opening") : t("settings.open_deeplink_action")}
                </Button>
                <div className="text-xs text-gray-8">{t("settings.deeplink_hint")}</div>
              </div>
            </div>
          ) : null}

          {props.deepLinkStatus ? <SettingsNotice>{props.deepLinkStatus}</SettingsNotice> : null}
        </LayoutSectionItem>
      ) : null}
    </LayoutSection>
  );
}

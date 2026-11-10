import { Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { gatewayConnectProviderKey, type GatewayConnectProvider, isCloudManagedProviderKey } from "../../connections/provider-auth/cloud-provider-config";
import { isKeylessZenProvider } from "../../connections/provider-auth/provider-policy";
import type { ProviderLoadState } from "../../connections/provider-auth/store";
import { credentialHealthKey, useProviderCredentialHealth, type ProviderCredentialHealth } from "../../connections/provider-auth/credential-health";
import type { LocalProviderEngineState } from "../../connections/provider-auth/local-provider-engine-state";
import { SettingsNotice } from "../settings-section";
import { LayoutStack } from "../settings-layout";
import { SettingsPanel, SettingsPanelDescription, SettingsPanelHeading, SettingsPanelTitle } from "../shell/panel";
import { getSettingsTabLabel } from "../shell/settings-page";
import { CredentialHealthStatus, LocalProviderStatus, ProviderList, ProviderMeta, ProviderRow, ProviderStatus, ProviderTile } from "./provider-rows";

export type ConnectedProvider = {
  id: string;
  name: string;
  source?: "env" | "api" | "config" | "custom";
};

export type AiSettingsViewProps = {
  busy: boolean;
  runtimeWorkspaceId?: string | null;
  onReplaceProviderKey?: (providerId: string) => void | Promise<void>;
  providerAuthBusy: boolean;
  providerStatusLabel: string;
  providerStatusStyle: string;
  providerSummary: string;
  providerLoadState: ProviderLoadState;
  onRetryProviders: () => void | Promise<void>;
  connectedProviders: ConnectedProvider[];
  disconnectingProviderId: string | null;
  providerConnectError: string | null;
  providerDisconnectStatus: string | null;
  providerDisconnectError: string | null;
  onOpenProviderAuth: () => void | Promise<void>;
  onDisconnectProvider: (providerId: string) => void | Promise<void>;
  canDisconnectProvider: (provider: ConnectedProvider) => boolean;
  /** Providers hidden by Disconnect (disabled_providers); each can be enabled again. */
  disabledProviders?: { id: string; name: string }[];
  enablingProviderId?: string | null;
  onEnableProvider?: (providerId: string) => void | Promise<void>;
  canAddProviders: boolean;
  signedIn?: boolean;
  cloudProviderIds?: Set<string>;
  gatewayProviderIds?: ReadonlySet<string>;
  gatewayConnectProviders?: GatewayConnectProvider[];
  connectingGatewayProviderId?: string | null;
  onConnectGatewayProvider?: (provider: GatewayConnectProvider) => void | Promise<void>;
  onCancelGatewayConnect?: () => void;
  showOpenWorkModelsConnect?: boolean;
  showOpenWorkModelsSyncing?: boolean;
  onDismissOpenWorkModels?: () => void | Promise<void>;
  /** Providers on this device the engine chat runs on cannot use, from the server's skipped list. */
  localProviderStates?: ReadonlyMap<string, LocalProviderEngineState>;
  onOpenDen?: () => void;
};

function deviceSourceLabel(source: ConnectedProvider["source"]) {
  if (source === "api") return t("ui.16f0ee47f993");
  if (source === "env") return t("ui.fc98aa319c68");
  return t("ui.9b7c35d07469");
}

export function GatewayConnectRow({ provider, busy, onConnect, onCancel }: {
  provider: GatewayConnectProvider;
  busy: boolean;
  onConnect?: (provider: GatewayConnectProvider) => void | Promise<void>;
  onCancel?: () => void;
}) {
  return (
    <ProviderRow
      scope="organization"
      tile={<ProviderTile providerId={provider.providerId} name={provider.name} />}
      name={provider.name}
      status={<ProviderStatus tone="attention">{t("ui.852d0642a744")}</ProviderStatus>}
      meta={<ProviderMeta id={provider.cloudProviderId} parts={["Get3W Gateway"]} />}
      actions={<>
        <Button disabled={busy || !onConnect} onClick={() => void onConnect?.(provider)}>{busy ? t("ui.20ff194db325") : `Sign in to ${provider.name}`}</Button>
        {busy && onCancel ? <Button variant="ghost" onClick={onCancel}>{t("ui.d4af24be4049")}</Button> : null}
      </>}
    />
  );
}

export function AiSettingsView(props: AiSettingsViewProps) {
  const healthEntries = useProviderCredentialHealth((state) => state.entries);
  const providerHealth = (providerId: string): ProviderCredentialHealth =>
    (props.runtimeWorkspaceId ? healthEntries[credentialHealthKey(props.runtimeWorkspaceId, providerId)]?.status : undefined) ?? "unverified";
  const ready = props.providerLoadState.status === "ready";
  const loading = props.providerLoadState.status === "loading" || props.providerLoadState.status === "idle";
  const error = props.providerLoadState.error;
  const signedIn = props.signedIn ?? false;
  const managed = (provider: ConnectedProvider) => provider.id !== "get3w-account" && (isCloudManagedProviderKey(provider.id) || props.cloudProviderIds?.has(provider.id) || props.gatewayProviderIds?.has(provider.id));
  // Keyless built-in Zen is offered under "Available to add" in Connect a provider, not listed as connected.
  const local = props.connectedProviders.filter((provider) => !managed(provider) && provider.id !== "get3w-account" && !isKeylessZenProvider(provider));
  const disabled = props.onEnableProvider ? (props.disabledProviders ?? []).filter(provider => provider.id !== "get3w-account") : [];
  const showAuto = true;
  const autoAvailable = props.connectedProviders.some(provider => provider.id === "get3w-account");
  const locked = !props.canAddProviders;
  const deviceCount = local.length + Number(showAuto);
  const rowsBusy = props.busy || props.providerAuthBusy || props.disconnectingProviderId !== null;
  const needsCredentialRecovery = (providerId: string) => providerHealth(providerId) === "rejected"
    && props.localProviderStates?.get(providerId) !== "managed_by_organization"
    && props.localProviderStates?.get(providerId) !== "not_on_engine";

  return <LayoutStack>
    <SettingsPanel>
      <SettingsPanelHeading className="max-w-xl">
        <SettingsPanelTitle>{getSettingsTabLabel("ai")}</SettingsPanelTitle>
        <SettingsPanelDescription>{t("ui.d1ac71397383")}</SettingsPanelDescription>
      </SettingsPanelHeading>
      <Button className="shrink-0 self-start" disabled={locked || props.busy || props.providerAuthBusy || !ready} onClick={() => void props.onOpenProviderAuth()}>
        {locked ? <Lock className="size-4" /> : <Plus className="size-4" />}{t("ui.a002b3f35f99")}
      </Button>
    </SettingsPanel>

    {locked ? <p className="-mt-3 text-xs text-muted-foreground">{t("ui.550ba13a0b0c")}</p> : null}
    {error ? <SettingsNotice tone="error" className="flex flex-wrap items-center justify-between gap-3"><div role="alert"><p>{error}</p>{props.connectedProviders.length ? <p>{t("settings.providers_not_refreshed")}</p> : null}</div><Button variant="outline" disabled={props.busy || loading} aria-busy={loading} onClick={() => void props.onRetryProviders()}>{t("settings.providers_retry")}</Button></SettingsNotice> : null}

    <section className="flex flex-col gap-3" aria-labelledby="ai-providers-device">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ai-providers-device" className="text-base font-medium text-dls-text">{t("ui.38b9d88c1fdb")}</h2>
          {ready ? <span className="text-xs text-muted-foreground">{deviceCount === 1 ? t("ui.384ae4ab1a28") : `${deviceCount} providers`}</span> : null}
        </div>
        <p className="text-sm text-muted-foreground">{signedIn ? t("ui.6b79d7dd8a18") : t("ui.75fbaeb901d5")}</p>
      </div>

      {loading && !props.connectedProviders.length ? <div role="status" aria-label={t("settings.loading_providers")} className="grid gap-2">{[0, 1].map((key) => <div key={key} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div> : null}

      {showAuto || local.length || disabled.length ? <ProviderList>
        {showAuto ? <ProviderRow
          testId="settings-auto-provider"
          scope="device"
          tile={<ProviderTile providerId="openwork" />}
          name="Get3W Models"
          status={autoAvailable ? <ProviderStatus tone="ready">{t("ui.996f87b386e1")}</ProviderStatus>
            : <ProviderStatus tone="neutral">{t("ui.ca1844969742")}</ProviderStatus>}
          meta={null}
          actions={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock aria-hidden className="size-3" />{t("settings.builtin_provider")}</span>}
        /> : null}
        {local.map((provider) => <ProviderRow
          key={provider.id}
          testId={`local-provider-${provider.id}`}
          scope="device"
          tile={<ProviderTile providerId={provider.id} name={provider.name} />}
          name={provider.name}
          status={<LocalProviderStatus state={props.localProviderStates?.get(provider.id)} credentialHealth={providerHealth(provider.id)} />}
          meta={<ProviderMeta id={provider.id} parts={[deviceSourceLabel(provider.source), needsCredentialRecovery(provider.id) && provider.source === "env" ? t("ui.9235a52ba042") : null]} />}
          actions={needsCredentialRecovery(provider.id) && provider.source === "env"
            ? <span className="text-xs text-muted-foreground" title={t("ui.9235a52ba042")}>{t("ui.81b165f3fb1b")}</span>
            : needsCredentialRecovery(provider.id)
            ? <Button variant="outline" disabled={rowsBusy || !ready || locked || !props.onReplaceProviderKey} onClick={() => void props.onReplaceProviderKey?.(provider.id)}>{t("ui.548dca59aca6")}</Button>
            : <Button variant="ghost" disabled={rowsBusy || !ready || !props.canDisconnectProvider(provider)} onClick={() => void props.onDisconnectProvider(provider.id)}>{props.disconnectingProviderId === provider.id ? t("settings.disconnecting") : props.canDisconnectProvider(provider) ? t("settings.disconnect") : t("settings.managed_by_env")}</Button>}
        />)}
        {disabled.map((provider) => <ProviderRow
          key={`disabled:${provider.id}`}
          testId="disabled-provider"
          scope="device"
          tile={<ProviderTile providerId={provider.id} name={provider.name} />}
          name={provider.name}
          status={<ProviderStatus tone="neutral">{t("settings.provider_disabled_badge")}</ProviderStatus>}
          meta={<ProviderMeta id={provider.id} parts={[t("settings.provider_disabled_hint")]} />}
          actions={<Button variant="ghost" disabled={rowsBusy || (props.enablingProviderId ?? null) !== null} onClick={() => void props.onEnableProvider?.(provider.id)}>{props.enablingProviderId === provider.id ? t("settings.enabling_provider") : t("settings.enable_provider")}</Button>}
        />)}
      </ProviderList> : ready ? <p className="text-sm text-muted-foreground">{t("settings.no_providers_connected")}</p> : null}

      {props.providerConnectError ? <SettingsNotice tone="error">{props.providerConnectError}</SettingsNotice> : null}
      {props.providerDisconnectStatus ? <SettingsNotice>{props.providerDisconnectStatus}</SettingsNotice> : null}
      {props.providerDisconnectError ? <SettingsNotice tone="error">{props.providerDisconnectError}</SettingsNotice> : null}
    </section>


  </LayoutStack>;
}

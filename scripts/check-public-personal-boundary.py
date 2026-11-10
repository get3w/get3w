#!/usr/bin/env python3
"""Check the removed enterprise reporting surfaces, not the full release/license boundary."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
REMOVED = [
    "apps/server/src/provider-credential-bindings.ts",
    "apps/app/src/react-app/domains/cloud/use-member-activity-sync.ts",
    "apps/app/src/react-app/domains/cloud/inventory-revision.ts",
    "apps/app/src/react-app/domains/cloud/use-cloud-provider-auto-sync.ts",
    "apps/app/src/react-app/domains/cloud/org-onboarding-page.tsx",
    "apps/app/src/react-app/domains/cloud/forced-signin-page.tsx",
    "apps/app/src/react-app/domains/connections/member-api-key-dialog.tsx",
    # Native personal automations restore the editor and local thread execution.
    # Organization authentication adapters remain forbidden below.
    # Native Artifact client restored by explicit product scope; legacy auth remains blocked.
    "apps/server/src/extensions/cloud-uploads.ts",
    "apps/server/src/extensions/drive-files.ts",
    "apps/server/src/extensions/cloud-upload-constants.ts",
    "apps/server/src/extensions/drive-resumable-upload.ts",
    "apps/server/src/opencode-plugins/drive-file-tools.ts",
    "apps/server/src/opencode-plugins/gmail-attachment-fulfillment.ts",
    "apps/server/src/opencode-plugins/openwork-cloud-skills-v2.ts",

    "apps/server/src/cloud-mcp-health.ts",
    "apps/server/src/cloud-mcp-v2.ts",
    "apps/server/src/connect-skill-catalog.ts",
    "apps/server/src/connect-automation-catalog.ts",
    "apps/app/src/react-app/domains/settings/cloud/agent-access-card.tsx",
    "apps/app/src/react-app/domains/connections/cloud-mcp-reconciler.ts",
    "apps/server/src/routes/cloud-mcp.ts",
    "apps/server/src/cloud-plugins.ts",
    "apps/server/src/desktop-cloud-sync.ts",
    "apps/app/src/app/cloud/desktop-cloud-sync.ts",
    'apps/app/src/react-app/domains/cloud/use-org-feature.ts',
    'apps/app/src/react-app/domains/cloud/organization-context.ts',
    'packages/opencode-plugin',
    'apps/app/src/react-app/domains/automations/use-automations.ts',
    'apps/app/src/react-app/domains/automations/use-automation-editor-setup.ts',
    'apps/server/src/opencode-v2-provider-session.ts',
    'apps/server/src/opencode-v2-inference-proxy.ts',
    'apps/server/src/opencode-v2-provider-channel.ts',
    'apps/app/src/react-app/shell/cloud-workspace-overlay.tsx',
    'apps/app/src/react-app/domains/automations/automation-runner-bridge.tsx',
    'apps/server/src/cloud-provider-sync.ts',
    'apps/app/src/react-app/domains/cloud/use-gateway-usage.ts',
    'apps/app/src/react-app/domains/cloud/gateway-usage-panel.tsx',
    'apps/app/src/react-app/domains/cloud/gateway-usage-approval-store.ts',
    'apps/app/src/react-app/domains/cloud/gateway-usage-refresh.ts',
    'apps/app/src/react-app/domains/settings/pages/cloud-providers-view.tsx',
    'apps/app/src/react-app/domains/cloud/connect-policy-reconciler.ts',
    'apps/app/src/react-app/domains/settings/cloud/cloud-account-section.tsx',
    'apps/app/src/react-app/domains/settings/cloud/dev-mode.tsx',
    'apps/app/src/react-app/domains/settings/cloud/use-den-session.tsx',
    'apps/server/src/cloud-computer.ts',
    'apps/app/src/react-app/domains/session/computer/cloud-computer-control.tsx',
    'packages/types/src/models-analytics.ts',
    'packages/types/src/den/activation.ts',
    'apps/app/src/app/lib/models-task-analytics.ts',
    'apps/app/src/react-app/domains/cloud/activation',
]
# Organization-only surfaces removed in the personal release; keep them from returning.
APP = 'apps/app/src/react-app/domains/'
REMOVED_ORGANIZATION = [
    APP+'settings/cloud/organization-server-affordance.tsx', APP+'cloud/use-org-list-window.ts',
    APP+'cloud/join-organization-input.ts', APP+'cloud/workspace-branding-restart.ts',
    APP+'cloud/openwork-web-access-state.ts', APP+'cloud/signin-fallback-notice.tsx',
    'apps/app/src/app/lib/gateway-usage-scope.ts', APP+'cloud/org-onboarding-selection.ts',
    'apps/app/src/app/lib/den-handoff.ts', 'apps/app/src/app/lib/den-org-memory.ts',
    'apps/app/src/app/lib/den-sign-in-intent.ts', 'apps/app/src/app/lib/den-sign-in-return.ts',
    'apps/app/src/react-app/shell/den-signin-routing.ts', APP+'cloud/sign-in-return.tsx',
    APP+'cloud/sign-in-return-draft.ts', APP+'cloud/sign-in-handoff-notice.tsx',
    APP+'settings/cloud/cloud-session-provider.tsx', APP+'settings/cloud/sections.tsx',
    APP+'connections/use-org-mcp-connections.ts', APP+'settings/connect-cloud-readiness.ts',
    APP+'session/surface/connect-capability-inventory.ts', APP+'cloud/cloud-sign-in-banner.tsx',
    APP+'models/org-default-model.ts', APP+'settings/use-library-cloud.ts',
    APP+'settings/cloud/control-plane-url.ts', APP+'settings/cloud/control-plane-url-editor.tsx',
    'apps/app/src/app/lib/organization-server-input.ts', APP+'settings/pages/library-connector-pages.tsx',
    APP+'cloud/connect-link-provider.tsx', APP+'cloud/connect-confirm-dialog.tsx',
    'apps/desktop/electron/connect-link.mjs', 'apps/desktop/electron/connect-link-branding.mjs',
    'apps/desktop/electron/connect-link-keys.mjs', 'packages/types/src/connect-link.ts',
    'apps/server/src/organization-provider-gate.ts', 'apps/server/src/provider-session-contract.ts',
    'apps/server/src/agent-context-cloud-probe.ts', 'apps/server/src/managed-desktop-policy.ts',
    'apps/server/src/managed-policy-ipc.ts', 'apps/server/src/managed-policy-rules.ts',
    'apps/server/src/managed-policy-plugin.ts', 'apps/server/src/opencode-plugins/managed-policy.ts',
    'apps/server/src/opencode-plugins/managed-policy-next.ts',
    'apps/server/src/opencode-plugins/managed-policy-client.ts',
    'apps/server/src/organization-mcp-names.ts',
]
ORGANIZATION_TOKENS = ['X-Get3W-Organization', 'x-openwork-org-id', 'connectLinkVerify', 'connectLinkAccept',
    'connect-link-seen.json', 'appendOrganizationPrompts']
TOKENS = ["/experimental/connect/skills", "/experimental/connect/automations", '/cloud-computer/status', '/cloud-computer/frame', '/cloud-computer/interact', 'startCloudComputerBridge', '/v1/me/desktop-config', 'refreshGatewayUsageAfterCloudSync', 'refreshGatewayUsageAfterCompletion', '/v1/gateway/usage-limits/me', '/v1/gateway/usage-limit-reset-requests',
          'getGatewayUsageStatus', 'requestGatewayUsageReset', '<GatewayUsageNotice', '<GatewayUsageMenuItem','@openwork/types/models-analytics', '@openwork/types/den/activation',
          'observeModelsTaskEvent', 'noteActivationRunStarted', 'noteActivationRunCompleted',
          '/v1/inference/analytics/', '/v1/me/activation', '<ActivationCard']

def text(path):
    # A deleted file cannot reintroduce the surface it used to carry.
    return path.read_text() if path.exists() else ''

def check(root):
    issues = [{'path': p, 'reason': 'removed enterprise surface remains'} for p in REMOVED if (root/p).exists()]
    issues += [{'path': p, 'reason': 'removed organization surface remains'} for p in REMOVED_ORGANIZATION if (root/p).exists()]
    # Product source only; tests keep reverse assertions that these headers are never sent.
    for base in ['apps/app/src', 'apps/server/src', 'packages/types/src', 'apps/desktop/electron']:
        for p in (root/base).rglob('*'):
            if p.suffix not in {'.ts', '.tsx', '.js', '.mjs'} or '.test.' in p.name: continue
            content = p.read_text()
            for token in ORGANIZATION_TOKENS:
                if token in content: issues.append({'path': str(p.relative_to(root)), 'reason': 'organization surface: '+token})
    for base in ['apps/app/src', 'apps/server/src', 'packages/types/src']:
        for p in (root/base).rglob('*'):
            if p.suffix not in {'.ts', '.tsx', '.js', '.mjs'}: continue
            content = p.read_text()
            if base == 'apps/app/src' and '/v1/me/desktop-config' in content:
                issues.append({'path': str(p.relative_to(root)), 'reason': 'renderer enterprise policy request'})
            for token in TOKENS:
                if token in content: issues.append({'path': str(p.relative_to(root)), 'reason': token})
    for name in ['automations-page.tsx', 'personal-automation-client.ts']:
        p = root/'apps/app/src/react-app/domains/automations'/name
        for token in ['readDenSettings', 'createDenClient', 'organizationId', 'accessToken']:
            if token in text(p): issues.append({'path': str(p.relative_to(root)), 'reason': 'personal automation identity boundary: '+token})
    auth = root/'apps/app/src/react-app/domains/cloud/den-auth-provider.tsx'
    for token in ['createDenClient', 'setInterval', 'exchangeHandoffAndSignIn', 'ensureDenActiveOrganization']:
        if token in text(auth): issues.append({'path': str(auth.relative_to(root)), 'reason': 'retired identity lifecycle: ' + token})
    store = root/'apps/app/src/react-app/domains/connections/provider-auth/store.ts'
    for token in ['readDenSettings', 'createDenClient', 'putDenSession', 'putDenIdentity', 'deleteDenSession', 'runCloudProviderSyncNow', 'getCloudProviderSyncStatus', 'sweepOrphanCloudProvidersFromConfig']:
        if token in text(store): issues.append({'path': str(store.relative_to(root)), 'reason': 'retired organization provider lifecycle: ' + token})
    for name in ['store.ts', 'use-session-mcp-maintenance.ts', 'use-cloud-mcp-submit-readiness.ts']:
        p = root/'apps/app/src/react-app/domains/connections'/name
        for token in ['readDenSettings', 'mintCloudControlMcpToken', 'runOpenworkCloudMcpReconciler', 'syncCloudControlMcp']:
            if token in text(p): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired Gateway lifecycle: '+token})
    extensions = root/'apps/app/src/react-app/domains/settings/state/extensions-store.ts'
    for token in ['readDenSettings', 'createDenClient', 'refreshDesktopCloudSync', 'listCloudPlugins(', 'removeCloudPlugin(', 'workspaceOpenworkWrite', 'openwork-den-session-updated']:
        if token in text(extensions): issues.append({'path': str(extensions.relative_to(root)), 'reason': 'retired organization extension lifecycle: '+token})
    server = root/'apps/server/src/server.ts'
    for token in ['CloudProviderSync', 'cloudProviderSync', 'parseCloudProviderDenSession', 'providerSession:', 'registerCloudMcpRoutes', 'reconcilePersistedOpenworkCloudMcp', 'migrateOpenworkCloudMcpRuntimeConfig', 'removeOpenworkCloudMcpDesiredConfig']:
        if token in text(server): issues.append({'path': str(server.relative_to(root)), 'reason': 'retired server organization sync: ' + token})
    for name in ['engine-v2-preview.ts', 'managed-opencode-v2.ts']:
        p = root/'apps/server/src'/name
        for token in ['providerSession', 'OPENWORK_PROVIDER_SESSION_FD', 'providerSyncPluginDirectory']:
            if token in text(p): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired private provider channel: '+token})
    for name in ['session/status/use-desktop-feature.ts', 'session/surface/composer/use-native-dictation-feature.ts']:
        p = root/'apps/app/src/react-app/domains'/name
        for token in ['createDenClient', 'useQuery', 'readDenSettings', 'getDeploymentFeatures']:
            if token in text(p): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired remote capability flag: '+token})
    exports = json.loads((root/'packages/types/package.json').read_text())['exports']
    for key in ['./models-analytics', './den/activation']:
        if key in exports: issues.append({'path': 'packages/types/package.json', 'reason': key})
    return issues

if __name__ == '__main__':
    problems = check(ROOT)
    print(json.dumps({'scope': 'removed enterprise reporting, checklist and quota request surfaces', 'problems': problems}, indent=2))
    raise SystemExit(bool(problems))

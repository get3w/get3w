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
    "apps/app/src/react-app/domains/apps/use-apps.ts",
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
    'packages/headless-threads',
    'packages/opencode-plugin',
    'apps/app/src/react-app/domains/automations/use-automations.ts',
    'apps/app/src/react-app/domains/automations/use-automation-editor-setup.ts',
    'apps/app/src/react-app/domains/automations/automation-editor.tsx',
    'apps/server/src/opencode-v2-provider-session.ts',
    'apps/server/src/opencode-v2-inference-proxy.ts',
    'apps/server/src/opencode-v2-provider-channel.ts',
    'apps/app/src/react-app/shell/cloud-workspace-overlay.tsx',
    'apps/app/src/react-app/domains/automations/automation-runner-bridge.tsx',
    'apps/desktop/electron/automation-runner.mjs',
    'apps/desktop/electron/session-runner-adapter.mjs',
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
TOKENS = ["/experimental/connect/skills", "/experimental/connect/automations", '/cloud-computer/status', '/cloud-computer/frame', '/cloud-computer/interact', 'startCloudComputerBridge', '/v1/me/desktop-config', 'refreshGatewayUsageAfterCloudSync', 'refreshGatewayUsageAfterCompletion', '/v1/gateway/usage-limits/me', '/v1/gateway/usage-limit-reset-requests',
          'getGatewayUsageStatus', 'requestGatewayUsageReset', '<GatewayUsageNotice', '<GatewayUsageMenuItem','@openwork/types/models-analytics', '@openwork/types/den/activation',
          'observeModelsTaskEvent', 'noteActivationRunStarted', 'noteActivationRunCompleted',
          '/v1/inference/analytics/', '/v1/me/activation', '<ActivationCard']

def check(root):
    issues = [{'path': p, 'reason': 'removed enterprise surface remains'} for p in REMOVED if (root/p).exists()]
    for base in ['apps/app/src', 'apps/server/src', 'packages/types/src']:
        for p in (root/base).rglob('*'):
            if p.suffix not in {'.ts', '.tsx', '.js', '.mjs'}: continue
            content = p.read_text()
            if base == 'apps/app/src' and '/v1/me/desktop-config' in content:
                issues.append({'path': str(p.relative_to(root)), 'reason': 'renderer enterprise policy request'})
            for token in TOKENS:
                if token in content: issues.append({'path': str(p.relative_to(root)), 'reason': token})
    auth = root/'apps/app/src/react-app/domains/cloud/den-auth-provider.tsx'
    for token in ['createDenClient', 'setInterval', 'exchangeHandoffAndSignIn', 'ensureDenActiveOrganization']:
        if token in auth.read_text(): issues.append({'path': str(auth.relative_to(root)), 'reason': 'retired identity lifecycle: ' + token})
    store = root/'apps/app/src/react-app/domains/connections/provider-auth/store.ts'
    for token in ['readDenSettings', 'createDenClient', 'putDenSession', 'putDenIdentity', 'deleteDenSession', 'runCloudProviderSyncNow', 'getCloudProviderSyncStatus', 'sweepOrphanCloudProvidersFromConfig']:
        if token in store.read_text(): issues.append({'path': str(store.relative_to(root)), 'reason': 'retired organization provider lifecycle: ' + token})
    for name in ['store.ts', 'use-session-mcp-maintenance.ts', 'use-cloud-mcp-submit-readiness.ts']:
        p = root/'apps/app/src/react-app/domains/connections'/name
        for token in ['readDenSettings', 'mintCloudControlMcpToken', 'runOpenworkCloudMcpReconciler', 'syncCloudControlMcp']:
            if token in p.read_text(): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired Gateway lifecycle: '+token})
    extensions = root/'apps/app/src/react-app/domains/settings/state/extensions-store.ts'
    for token in ['readDenSettings', 'createDenClient', 'refreshDesktopCloudSync', 'listCloudPlugins(', 'removeCloudPlugin(', 'workspaceOpenworkWrite', 'openwork-den-session-updated']:
        if token in extensions.read_text(): issues.append({'path': str(extensions.relative_to(root)), 'reason': 'retired organization extension lifecycle: '+token})
    server = root/'apps/server/src/server.ts'
    for token in ['CloudProviderSync', 'cloudProviderSync', 'parseCloudProviderDenSession', 'providerSession:', 'registerCloudMcpRoutes', 'reconcilePersistedOpenworkCloudMcp', 'migrateOpenworkCloudMcpRuntimeConfig', 'removeOpenworkCloudMcpDesiredConfig']:
        if token in server.read_text(): issues.append({'path': str(server.relative_to(root)), 'reason': 'retired server organization sync: ' + token})
    for name in ['engine-v2-preview.ts', 'managed-opencode-v2.ts']:
        p = root/'apps/server/src'/name
        for token in ['providerSession', 'OPENWORK_PROVIDER_SESSION_FD', 'providerSyncPluginDirectory']:
            if token in p.read_text(): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired private provider channel: '+token})
    for name in ['session/status/use-desktop-feature.ts', 'session/surface/composer/use-native-dictation-feature.ts']:
        p = root/'apps/app/src/react-app/domains'/name
        for token in ['createDenClient', 'useQuery', 'readDenSettings', 'getDeploymentFeatures']:
            if token in p.read_text(): issues.append({'path': str(p.relative_to(root)), 'reason': 'retired remote capability flag: '+token})
    exports = json.loads((root/'packages/types/package.json').read_text())['exports']
    for key in ['./models-analytics', './den/activation']:
        if key in exports: issues.append({'path': 'packages/types/package.json', 'reason': key})
    return issues

if __name__ == '__main__':
    problems = check(ROOT)
    print(json.dumps({'scope': 'removed enterprise reporting, checklist and quota request surfaces', 'problems': problems}, indent=2))
    raise SystemExit(bool(problems))

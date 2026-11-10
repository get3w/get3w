#!/usr/bin/env python3
"""Run the same fail-fast release checks locally and in CI; never publish."""
import argparse, json, os, subprocess, time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--desktop', action='store_true', help='Build, package and exercise the native macOS application')
p.add_argument('--output', type=Path, default=root / 'artifacts/verification')
a = p.parse_args()
a.output.mkdir(parents=True, exist_ok=True)
results = []
def run(name, command, env=None, cwd=root):
    start = time.monotonic()
    with (a.output / (name + '.log')).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    results.append({'name': name, 'command': command, 'exitCode': result.returncode, 'seconds': round(time.monotonic() - start, 2)})
    (a.output / 'results.json').write_text(json.dumps({'checks': results, 'releaseReady': False}, indent=2) + '\n')
    print(name + ': exit ' + str(result.returncode), flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)

run('source', ['python3', 'scripts/verify-public-source.py'])
for guard in ['workspace', 'personal-boundary', 'brand', 'licenses']:
    run(guard, ['python3', 'scripts/check-public-' + guard + '.py'])
run('typecheck', ['pnpm', 'typecheck'])
run('native-regressions', ['node', '--test', *['apps/desktop/electron/' + n + '.test.mjs' for n in [
    'get3w-auth', 'get3w-managed-provider', 'get3w-managed-mcp', 'get3w-egress', 'updater', 'workspace-file-access', 'local-package-profile']]])
# The automation runner imports this workspace package's built ESM, which is not committed.
run('headless-threads-build', ['pnpm', '--filter', '@openwork/headless-threads', 'build'])
run('automation-native', ['node', '--test', *[str(path.relative_to(root)) for path in sorted((root / 'apps/desktop/electron').glob('get3w-automation-*.test.mjs'))]])
run('automation-ui', ['bun', 'test', 'apps/app/tests/personal-automations.test.tsx', 'apps/app/tests/personal-automation-client.test.ts', 'apps/app/tests/automation-proposal-model.test.ts', 'apps/app/tests/automation-desktop-runtime-models.test.ts'])
# Navigation mocks replace the account module; keep them isolated from other UI suites.
run('automation-navigation', ['bun', 'test', 'apps/app/tests/personal-automation-navigation.test.tsx'])
run('personal-account-native', ['node', '--test', 'apps/desktop/electron/get3w-personal.test.mjs', 'apps/desktop/electron/get3w-artifact-route.test.mjs'])
run('personal-account-ui', ['bun', 'test', 'apps/app/tests/personal-account-ui.test.tsx', 'apps/app/tests/get3w-sign-in-gate.test.tsx'])
run('model-native-regressions', ['node', '--test', *[str(path.relative_to(root)) for path in sorted((root / 'apps/desktop/electron').glob('get3w-model-*.test.mjs'))], 'apps/desktop/electron/get3w-mcp-proxy-stop.test.mjs'])
run('model-surface-regressions', ['bun', 'test',
    'apps/app/tests/model-approval-cards.test.tsx', 'apps/app/tests/output-preview.test.tsx', 'apps/app/tests/model-preferences.test.ts',
    'apps/server/test/opencode-v2-instructions.test.ts', 'apps/server/test/get3w-chat-tools.test.ts', 'apps/server/test/model-approval-bridge.test.ts',
    'apps/server/test/model-task-approval.test.ts', 'apps/server/test/model-output-files.test.ts', 'apps/server/test/model-output-route.test.ts'])
run('personal-regressions', ['bun', 'test', *['apps/app/tests/' + n for n in [
    'get3w-settings-policy.test.ts', 'get3w-settings-lifecycle.test.tsx', 'personal-desktop-config.test.tsx',
    'personal-chat-submit.test.tsx', 'personal-mcp-maintenance.test.ts', 'local-provider-engine-state.test.tsx',
    'session-history.test.tsx', 'chat-file-links.test.ts']], 'apps/server/test/personal-runtime-boundary.test.ts'])
if a.desktop:
    if os.uname().sysname != 'Darwin':
        raise SystemExit('--desktop currently requires macOS; no cross-platform acceptance implied')
    run('native-rebuild', ['pnpm', '--dir', 'apps/desktop', 'exec', 'electron-rebuild', '--force', '--which-module', 'better-sqlite3'])
    run('desktop-build', ['pnpm', 'build'])
    env = {**os.environ, 'CSC_IDENTITY_AUTO_DISCOVERY': 'false', 'GET3W_COMPUTER_USE_CODESIGN_IDENTITY': '-'}
    command = ['pnpm', '--dir', 'apps/desktop', 'exec', 'electron-builder', '--config', 'electron-builder.yml', '--mac', '--x64', '--dir', '--publish', 'never']
    # Optional verified official Electron unpacked distribution, useful offline.
    if os.environ.get('GET3W_VERIFIED_ELECTRON_DIST'):
        command.append('--config.electronDist=' + os.environ['GET3W_VERIFIED_ELECTRON_DIST'])
    run('desktop-package', command, env)
    app = root / 'apps/desktop/dist-electron/mac/Get3W.app'
    resources = app / 'Contents/Resources'
    run('asar-extract', ['pnpm', '--dir', 'apps/desktop', 'exec', 'asar', 'extract', str(resources / 'app.asar'), str(a.output.resolve() / 'asar')])
    run('package-inventory', ['python3', 'scripts/verify-public-package.py', str(app), str(a.output.resolve() / 'asar'), str(a.output.resolve() / 'package.json')])
    env = {k: v for k, v in os.environ.items() if k not in {'NODE_OPTIONS', 'NODE_PATH'}}
    env.update(ELECTRON_RUN_AS_NODE='1', GET3W_TEST_EMBEDDED_MODULE_URL=(resources / 'app.asar/server/dist/embedded.js').as_uri(), GET3W_TEST_ENGINE_BIN=str(resources / 'sidecars/opencode'))
    run('packaged-engine', [str(app / 'Contents/MacOS/Get3W'), '--test', 'apps/desktop/test/engine-cold-start.test.mjs'], env)
run('source-after-checks', ['python3', 'scripts/verify-public-source.py'])

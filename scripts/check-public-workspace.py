#!/usr/bin/env python3
"""Structural check only; does not certify licensing or application behavior."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def check(root):
    problems = []
    if (root / 'ee').exists(): problems.append('ee directory remains')
    if (root / '.env.dev').exists(): problems.append('local .env.dev remains')
    config = (root / 'pnpm-workspace.yaml').read_text()
    if re.search(r'^\s*-\s*[\"\']?ee/', config, re.M): problems.append('workspace includes ee')
    packages = {}
    manifests = [root / 'package.json'] + list(root.glob('apps/*/package.json')) + list(root.glob('packages/*/package.json'))
    for p in manifests:
        d = json.loads(p.read_text()); packages[d['name']] = (p, d)
    for name, (path, d) in packages.items():
        for kind in ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']:
            for target, version in d.get(kind, {}).items():
                if target.startswith('@openwork-ee/'): problems.append(f'{name}: EE dependency {target}')
                if version.startswith('workspace:') and target not in packages: problems.append(f'{name}: missing {target}')
        for key, cmd in d.get('scripts', {}).items():
            if '@openwork-ee/' in cmd or re.search(r'\bee/(apps|packages)/', cmd):
                problems.append(f'{name}: EE script {key}')
    lock = (root / 'pnpm-lock.yaml').read_text()
    if re.search(r'^  ee/(apps|packages)/', lock, re.M): problems.append('EE lock importer remains')
    if re.search(r'^\s+version: link:.*(?:/ee/|@openwork-ee/)', lock, re.M): problems.append('EE lock link remains')
    for p in (root / '.github').rglob('*'):
        if p.is_file() and any(t in p.read_text(errors='replace') for t in ['@openwork-ee/', 'ee/apps/', 'ee/packages/']):
            problems.append(f'EE CI reference: {p.relative_to(root)}')
    return problems

if __name__ == '__main__':
    problems = check(ROOT)
    print(json.dumps({'scope': 'workspace/manifests/lock-importers/CI only', 'problems': problems}, indent=2))
    raise SystemExit(bool(problems))

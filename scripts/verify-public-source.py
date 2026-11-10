#!/usr/bin/env python3
"""Verify the explicit public source inventory and optionally copy a clean tree."""
import argparse, hashlib, json, shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--copy-to', type=Path)
p.add_argument('--update', action='store_true', help='Explicitly refresh hashes for the reviewed source inventory')
p.add_argument('--add', action='append', default=[], metavar='PATH', help='Add an explicitly reviewed source path (requires --update)')
a = p.parse_args()
manifest = json.loads((root / 'public-source-manifest.json').read_text())
if not manifest.get('files'):
    raise SystemExit('Empty public source manifest')
if a.add and not a.update:
    raise SystemExit('--add requires --update')
if a.update and a.copy_to:
    raise SystemExit('Update and copy must be separate operations')
existing = {row['path'] for row in manifest['files']}
for name in a.add:
    if name not in existing:
        manifest['files'].append({'path': name, 'sha256': ''})
        existing.add(name)
paths = set()
for row in manifest['files']:
    rel = Path(row['path'])
    if rel.is_absolute() or '..' in rel.parts or rel.as_posix() in paths:
        raise SystemExit('Unsafe or duplicate source path')
    paths.add(rel.as_posix())
    if any(part in {'ee', '.git', 'node_modules', '.build', '__pycache__'} or part.startswith('.env') for part in rel.parts) or rel.parts[0] == 'artifacts' or rel.suffix in {'.pyc', '.pyo'} or rel.as_posix() == 'public-source-manifest.json':
        raise SystemExit('Private/generated source path: ' + str(rel))
    f = root / rel
    if f.is_symlink() or not f.is_file():
        raise SystemExit('Source file missing or symlink: ' + str(rel))
    digest = hashlib.sha256(f.read_bytes()).hexdigest()
    if a.update:
        row['sha256'] = digest
    elif digest != row['sha256']:
        raise SystemExit('Source hash mismatch: ' + str(rel))
if a.update:
    manifest['files'].sort(key=lambda row: row['path'])
    (root / 'public-source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
if a.copy_to:
    target = a.copy_to.resolve()
    if target.exists() or target == root or root in target.parents:
        raise SystemExit('Copy target must be new and outside this source tree')
    target.mkdir(parents=True)
    for rel in sorted(paths | {'public-source-manifest.json'}):
        dest = target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, dest)
print(json.dumps({'files': len(paths), 'hashesMatch': True, 'copyTo': str(a.copy_to) if a.copy_to else None}))

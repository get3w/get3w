#!/usr/bin/env python3
"""Verify the explicit public source inventory and optionally copy a clean tree."""
import argparse, hashlib, json, shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--copy-to', type=Path)
a = p.parse_args()
manifest = json.loads((root / 'public-source-manifest.json').read_text())
if not manifest.get('files'):
    raise SystemExit('Empty public source manifest')
paths = set()
for row in manifest['files']:
    rel = Path(row['path'])
    if rel.is_absolute() or '..' in rel.parts or rel.as_posix() in paths:
        raise SystemExit('Unsafe or duplicate source path')
    paths.add(rel.as_posix())
    if any(part in {'ee', '.git', 'node_modules', '.build', '.env', '.env.dev'} for part in rel.parts):
        raise SystemExit('Private/generated source path: ' + str(rel))
    f = root / rel
    if f.is_symlink() or not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest() != row['sha256']:
        raise SystemExit('Source hash mismatch: ' + str(rel))
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

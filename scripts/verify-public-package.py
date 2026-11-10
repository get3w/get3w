#!/usr/bin/env python3
"""Inventory actual package bytes; validate receipts, notices and forbidden caches."""
import hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path
app, extracted, output = map(Path, sys.argv[1:])
r = app / 'Contents/Resources'
versions = json.loads((r / 'sidecars/versions.json').read_text())
rows = []
for scope, folder in [('app', app), ('asar', extracted)]:
    for p in sorted(folder.rglob('*')):
        if not p.is_file() or p.is_symlink():
            continue
        rel = p.relative_to(folder)
        if any(x in {'.build', '.git', 'ee', '.env', '.env.dev'} for x in rel.parts):
            raise SystemExit('Forbidden package content: ' + str(rel))
        if 'computer-use/native' in rel.as_posix():
            raise SystemExit('Workspace native source/cache shipped: ' + str(rel))
        rows.append({'scope': scope, 'path': rel.as_posix(), 'bytes': p.stat().st_size, 'sha256': hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()})
def unsigned_sha256(path):
    # Developer ID re-signing rewrites the code signature; compare the unsigned Mach-O.
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / 'bin'
        shutil.copyfile(path, copy)
        subprocess.run(['codesign', '--remove-signature', str(copy)], check=True, capture_output=True)
        return hashlib.file_digest(copy.open('rb'), 'sha256').hexdigest()
for name in ['opencode', 'opencode2']:
    binary = r / 'sidecars' / name
    if hashlib.file_digest(binary.open('rb'), 'sha256').hexdigest() == versions[name]['sha256']:
        continue
    expected = versions[name].get('unsignedSha256')
    signed = subprocess.run(['codesign', '--verify', '--strict', str(binary)], capture_output=True).returncode == 0
    if not expected or not signed or unsigned_sha256(binary) != expected:
        raise SystemExit('Sidecar receipt mismatch: ' + name)
for name in ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'third-party/runtime-licenses.json', 'third-party/electron/LICENSES.chromium.html']:
    if not (r / 'legal' / name).is_file():
        raise SystemExit('Missing legal resource: ' + name)
output.write_text(json.dumps({'files': rows, 'sidecarReceiptsMatch': True, 'releaseReady': False}, indent=2) + '\n')
print(json.dumps({'files': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'sidecarReceiptsMatch': True}))

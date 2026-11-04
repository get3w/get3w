#!/usr/bin/env python3
"""Validate checked-in license inventory, copied notices and packaging inclusion."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];problems=[]
manifest=root/'third-party/runtime-licenses.json';data=json.loads(manifest.read_text());records=data.get('records',[])
if not records:problems.append('empty dependency license inventory')
if data.get('problems'):problems.append('unresolved dependency license records')
for row in records:
 if not row['notices']:
  declaration=root/row.get('manifestDeclarationFile','missing')
  if not declaration.is_file() or hashlib.sha256(declaration.read_bytes()).hexdigest()!=row.get('manifestDeclarationSha256'):
   problems.append('missing verified license declaration: '+row['name'])
 if row['selectedLicense'] in ['Unknown','UNLICENSED','LicenseRef-OpenWork-EE']:problems.append('unresolved or restricted '+row['name'])
 for entry in row['notices']:
  p=root/entry['file']
  if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=entry['sha256']:problems.append('notice missing or modified: '+entry['file'])
text=(root/'LICENSE').read_text()
for expected in ['MIT License','Copyright (c) 2026 Get3W contributors','Permission is hereby granted']:
 if expected not in text:problems.append('root MIT notice incomplete')
upstream=root/'third-party/openwork';upstream_source=json.loads((upstream/'source.json').read_text()) if (upstream/'source.json').is_file() else {'files':[]}
for entry in upstream_source['files']:
 p=upstream/entry['file']
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=entry['sha256']:problems.append('OpenWork notice missing or modified: '+entry['file'])
if not upstream_source['files']:problems.append('OpenWork notice record missing')
upstream_text=(upstream/'LICENSE').read_text() if (upstream/'LICENSE').is_file() else ''
for expected in ['Copyright (c) 2026 Different AI','Permission is hereby granted']:
 if expected not in upstream_text:problems.append('OpenWork MIT notice incomplete')
if 'third-party/openwork/LICENSE' not in (root/'NOTICE').read_text():problems.append('NOTICE does not reference OpenWork license')
if (root/'LICENSES/LicenseRef-OpenWork-EE.txt').exists():problems.append('obsolete EE license remains')
config=(root/'apps/desktop/electron-builder.base.yml').read_text()
for expected in ['../../LICENSE','../../NOTICE','../../THIRD_PARTY_NOTICES.md','../../third-party']:
 if expected not in config:problems.append('packaging omits '+expected)
print(json.dumps({'records':len(records),'noticeFiles':len({n['file'] for r in records for n in r['notices']}),'missingPackageNoticeFiles':[r['name']+'@'+r['version'] for r in records if not r['notices']],'problems':problems},indent=2))
raise SystemExit(bool(problems))

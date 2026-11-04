#!/usr/bin/env python3
"""Public product boundary: compatibility names and original notices are not rebranded."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
allowed={
 'apps/app/src/app/lib/den.ts':'legacy URL parser; transport rejects every request',
 'apps/app/src/app/lib/get3w-service-target.ts':'legacy service rejection list',
 'apps/desktop/electron/get3w-egress.mjs':'legacy service rejection list',
}
pattern=re.compile(r'(?:openworklabs\.(?:com|ai)|openwork\.(?:com|dev|software|so)(?=[/"\s\x27]|$)|github\.com/different-ai/openwork)')
issues=[];classified=[]
for folder in ['apps/app/src','apps/desktop/electron','apps/desktop/scripts','apps/server/src','packages']:
 for p in (root/folder).rglob('*'):
  if not p.is_file() or any(x in p.parts for x in ['node_modules','dist','.build','target','test','tests']):continue
  if '.test.' in p.name or p.suffix not in {'.ts','.tsx','.mjs','.js','.cjs','.swift','.cs','.json','.yml'}:continue
  rel=p.relative_to(root).as_posix()
  for number,line in enumerate(p.read_text().splitlines(),1):
   if pattern.search(line):
    row={'path':rel,'line':number}
    if rel in allowed:classified.append({**row,'reason':allowed[rel]})
    else:issues.append(row)
for rel in ['infra','packaging/helm','packaging/cloud-run','evals','worlds']:
 p=root/rel
 if p.exists() and any(x.is_file() for x in p.rglob('*')):issues.append({'path':rel,'reason':'obsolete upstream deployment/evaluation remains'})
for rel in ['apps/desktop/electron-builder.yml','apps/desktop/package.json']:
 if 'com.get3w.desktop' not in (root/rel).read_text():issues.append({'path':rel,'reason':'Get3W identity missing'})
print(json.dumps({'scope':'product domains, packaging identity, retired deployment/evaluation','problems':issues,'classified':classified},indent=2))
raise SystemExit(bool(issues))

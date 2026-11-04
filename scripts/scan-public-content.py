#!/usr/bin/env python3
"""Read only explicit source/build paths; report hashes/locations, never matched secrets."""
import argparse,json,re,hashlib,tarfile,io,bisect
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--build',action='store_true');p.add_argument('--package-root',type=Path,action='append',default=[],help='Scan all bytes in a packaged app or extracted ASAR directory');a=p.parse_args();root=Path(__file__).resolve().parents[1]
patterns={
 'private-key':rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'aws-access-key':rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'github-token':rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
 'provider-key':rb'\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}',
 'google-api-key':rb'\bAIza[A-Za-z0-9_-]{35}',
 'slack-token':rb'\bxox[baprs]-[A-Za-z0-9-]{20,}',
 'jwt':rb'\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}',
 'credential-url':rb'https?://[^\s/"\x27:]{1,80}:[^\s/@"\x27]{1,100}@',
 'personal-home-path':rb'/Users/[A-Za-z0-9_.-]+/',
}
compiled={k:re.compile(v) for k,v in patterns.items()};findings=[];files=[];archives=0
# Only explicit fixture identities, never a blanket ignore for test files.
fixture=re.compile(rb'(?:test|fixture|example|dummy|synthetic|fake|localhost|127\.0\.0\.1|user:pass@)',re.I)
def scan(data,label,scope):
 global archives
 files.append({'path':label,'scope':scope,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 newlines=[i for i,b in enumerate(data) if b==10]
 for rule,pattern in compiled.items():
  for hit in pattern.finditer(data):
   start=data.rfind(b'\n',0,hit.start())+1;end=data.find(b'\n',hit.end());line=data[max(start,hit.start()-200):min(end if end!=-1 else len(data),hit.end()+200)]
   lineNo=bisect.bisect_left(newlines,hit.start())+1
   classification='review'
   if fixture.search(line) and ('/test' in label or '.test.' in label or '/node_modules/' in label or 'license-texts/' in label):classification='synthetic fixture or third-party test example'
   if rule=='personal-home-path' and hit.group().startswith((b'/Users/test/',b'/Users/example/',b'/Users/user/',b'/Users/username/')):classification='generic documentation path'
   findings.append({'path':label,'scope':scope,'line':lineNo,'rule':rule,'matchSha256':hashlib.sha256(hit.group()).hexdigest(),'classification':classification})
 if label.endswith(('.tgz','.tar.gz')):
  try:
   with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
    archives+=1
    for f in tar.getmembers():
     if f.isfile():scan(tar.extractfile(f).read(),label+'!/'+f.name,scope+'-archive-content')
  except tarfile.TarError:findings.append({'path':label,'rule':'unreadable-archive','classification':'review'})
manifest=json.loads(a.manifest.read_text());paths={r['path'] for r in manifest['files']}
# Include new release documentation/notice content without traversing user/local data.
for name in ['LICENSE','NOTICE','README.md','THIRD_PARTY_NOTICES.md']:
 if (root/name).is_file():paths.add(name)
for name in ['third-party','scripts']:
 for f in (root/name).rglob('*'):
  if f.is_file():paths.add(f.relative_to(root).as_posix())
for rel in sorted(paths):
 f=root/rel
 if f.is_file():scan(f.read_bytes(),rel,'source')
if a.build:
 for folder in ['apps/app/dist','apps/server/dist','apps/desktop/server','apps/desktop/.electron-runtime','apps/desktop/resources/sidecars','apps/desktop/resources/helpers']:
  for f in (root/folder).rglob('*'):
   if f.is_file() and not f.is_symlink():scan(f.read_bytes(),f.relative_to(root).as_posix(),'build')
for index, folder in enumerate(a.package_root):
 if not folder.is_dir():p.error('package root must be an existing directory')
 for f in sorted(folder.rglob('*')):
  if f.is_file() and not f.is_symlink():scan(f.read_bytes(),f'package-{index}/'+f.relative_to(folder).as_posix(),'package-content')
report={'policy':'pattern scan including binary bytes and archive members; no secret values included; not proof of all possible secrets','filesScanned':len(files),'bytesScanned':sum(f['bytes'] for f in files),'archivesExpanded':archives,'findings':findings,'files':files}
a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'files':len(files),'bytes':report['bytesScanned'],'archives':archives,'findings':len(findings),'review':sum(f['classification']=='review' for f in findings)}))

#!/usr/bin/env python3
"""Inventory installed production dependencies and staged runtime/archive contents.
Reads package metadata and notices, never user profiles or environment files.
Run pnpm licenses list --prod --json first and pass that JSON with --pnpm-report.
"""
import argparse,hashlib,json,re,tarfile,tempfile,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--pnpm-report',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'third-party';out.mkdir(exist_ok=True);records={};problems=[]
prior=json.loads((out/'runtime-licenses.json').read_text()).get('records',[]) if (out/'runtime-licenses.json').exists() else []
prior={r['name']+'@'+r['version']:r for r in prior}
def sha(data):return hashlib.sha256(data).hexdigest()
def add(folder,scope,declared=None):
 try:d=json.loads((folder/'package.json').read_text())
 except (OSError,ValueError):return
 name=d.get('name');version=d.get('version','unspecified')
 if not name:return
 key=name+'@'+version
 if key not in records:records[key]={'name':name,'version':version,'declaredLicense':declared or d.get('license','Unknown'),'selectedLicense':None,'scopes':[],'notices':[]}
 row=records[key]
 if scope not in row['scopes']:row['scopes'].append(scope)
 license=row['declaredLicense'];license=license.get('type','Unknown') if isinstance(license,dict) else str(license)
 texts=[]
 for f in sorted(folder.iterdir()):
  if not f.is_file() or not re.match(r'^(license|licence|copying|notice|copyright|third.party)',f.name,re.I):continue
  data=f.read_bytes(); digest=sha(data);dest=out/'license-texts'/digest/(f.name)
  dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  entry={'file':dest.relative_to(root).as_posix(),'sha256':digest,'originalFilename':f.name}
  if entry not in row['notices']:row['notices'].append(entry)
  texts.append(data.decode('utf-8',errors='replace'))
 if license.lower()=='unknown' and any('Permission is hereby granted, free of charge' in t for t in texts):license='MIT';row['resolution']='package license text supplies MIT; metadata omitted license'
 if license.lower()=='apache-2.0':license='Apache-2.0'
 choices={'(MPL-2.0 OR Apache-2.0)':'Apache-2.0','(AFL-2.1 OR BSD-3-Clause)':'BSD-3-Clause','(MIT OR CC0-1.0)':'MIT','(MIT OR GPL-3.0-or-later)':'MIT'}
 if name=='duck' and license=='BSD' and any('1. Redistributions of source code' in t and '2. Redistributions in binary form' in t and '3.' not in t for t in texts):license='BSD-2-Clause'
 row['selectedLicense']=choices.get(license,license)
 row['sourceManifestSha256']=sha((folder/'package.json').read_bytes())
for license,packages in json.loads(a.pnpm_report.read_text()).items():
 for package in packages:
  for path in package.get('paths',[]):add(Path(path),'installed-production-closure',license)
for folder in (root/'apps/desktop/.electron-runtime/node_modules').rglob('package.json'):
 add(folder.parent,'staged-electron-runtime')
for archive in (root/'apps/server/dist').glob('opencode-plugin-deps-*.tgz'):
 with tempfile.TemporaryDirectory(prefix='get3w-license-') as tmp:
  with tarfile.open(archive) as tar:tar.extractall(tmp,filter='data')
  for f in Path(tmp).rglob('package.json'):
   if 'node_modules' in f.parts:add(f.parent,'bundled-engine-plugin-archive')
# Electron framework is a build dependency but will be redistributed.
for folder in (root/'node_modules/.pnpm').glob('electron@*/node_modules/electron'):add(folder,'electron-framework')
allow={'MIT','Apache-2.0','ISC','BSD-2-Clause','BSD-3-Clause','0BSD','(MIT AND Zlib)','BlueOak-1.0.0','Python-2.0','OFL-1.1','CC-BY-4.0','Unlicense'}
for row in records.values():
 previous=prior.get(row['name']+'@'+row['version'])
 if previous and previous.get('sourceManifestSha256')==row['sourceManifestSha256']:
  for field in ['selectedLicense','resolution','noticeStatus','registryIntegrity','noticeRetrievalSource','manifestDeclarationFile','manifestDeclarationSource','manifestDeclarationSha256']:
   if field in previous:row[field]=previous[field]
  for notice in previous.get('notices',[]):
   f=root/notice['file']
   if f.is_file() and sha(f.read_bytes())==notice['sha256'] and notice not in row['notices']:row['notices'].append(notice)
 if row['name'].startswith('@openwork/') and row['selectedLicense']=='Unknown':
  row['selectedLicense']='MIT';row['resolution']='non-ee workspace source under root MIT'
 if row['selectedLicense'] not in allow:problems.append({'package':row['name']+'@'+row['version'],'reason':'unresolved or restricted license','license':row['selectedLicense']})
 if not row['notices']:row['noticeStatus']='no root license file in installed package; manifest declaration retained'
 else:row['noticeStatus']='verbatim license/notice files retained'
result={'scope':'production dependency closure plus actual staged runtime, plugin archive and Electron framework; engine binary receipts separate','records':sorted(records.values(),key=lambda x:(x['name'],x['version'])),'count':len(records),'licenseCounts':dict(collections.Counter(r['selectedLicense'] for r in records.values())),'problems':problems}
(out/'runtime-licenses.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'count':len(records),'problems':problems,'withoutRootLicenseFiles':sum(not r['notices'] for r in records.values()),'licenseCounts':result['licenseCounts']},indent=2))
raise SystemExit(bool(problems))

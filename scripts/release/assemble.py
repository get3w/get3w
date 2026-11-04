"""Validate all six native release outputs before producing public assets."""
import argparse, base64, hashlib, json, re, shutil
from pathlib import Path
import yaml

MATRIX = {('mac', 'x64'): ['dmg', 'zip'], ('mac', 'arm64'): ['dmg', 'zip'],
          ('win', 'x64'): ['exe'], ('win', 'arm64'): ['exe'],
          ('linux', 'x86_64'): ['AppImage', 'tar.gz'], ('linux', 'arm64'): ['AppImage', 'tar.gz']}

def assemble(source, output, version):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version): raise ValueError('Expected stable version')
    assets = {}
    manifests = {}
    for folder in sorted(source.iterdir()):
        if not folder.is_dir(): continue
        for path in folder.iterdir():
            if path.suffix == '.yml':
                if not path.name.startswith('latest'): continue
                data = yaml.safe_load(path.read_text())
                if data['version'] != version: raise ValueError('Manifest version mismatch')
                manifests.setdefault(path.name, []).append(data)
            elif path.is_file() and path.name.startswith('get3w-'):
                if path.name in assets: raise ValueError('Duplicate asset: ' + path.name)
                assets[path.name] = path
    for (platform, arch), extensions in MATRIX.items():
        for ext in extensions:
            name = f'get3w-{platform}-{arch}-{version}.{ext}'
            if name not in assets or assets[name].stat().st_size == 0: raise ValueError('Missing installer: ' + name)
    expected_manifests = {'latest-mac.yml', 'latest.yml', 'latest-linux.yml', 'latest-linux-arm64.yml'}
    if set(manifests) != expected_manifests: raise ValueError('Missing updater manifests')
    output.mkdir(parents=True, exist_ok=False)
    covered = set()
    for name, inputs in manifests.items():
        merged = dict(inputs[0]); merged['files'] = []
        for data in inputs:
            for file in data['files']:
                asset = assets.get(file['url'])
                if asset is None: raise ValueError('Manifest references missing asset')
                raw = asset.read_bytes()
                if file['sha512'] != base64.b64encode(hashlib.sha512(raw).digest()).decode(): raise ValueError('SHA512 mismatch')
                if file.get('size') != len(raw): raise ValueError('Size mismatch')
                if file['url'] in covered: raise ValueError('Duplicate manifest asset')
                covered.add(file['url']); merged['files'].append(file)
        (output / name).write_text(yaml.safe_dump(merged, sort_keys=False))
    for (platform, arch), extensions in MATRIX.items():
        for ext in extensions:
            if ext in ['dmg', 'zip', 'exe', 'AppImage'] and f'get3w-{platform}-{arch}-{version}.{ext}' not in covered:
                raise ValueError('Installer absent from updater manifest')
    checksums = []
    for name, path in sorted(assets.items()):
        shutil.copy2(path, output / name)
    for path in sorted(output.iterdir()):
        with path.open('rb') as stream:
            checksums.append(hashlib.file_digest(stream, 'sha256').hexdigest() + '  ' + path.name)
    (output / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
    (output / 'release.json').write_text(json.dumps({'version': version, 'signed': False, 'platforms': 6, 'assets': sorted(assets)}, indent=2) + '\n')

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('source', type=Path); p.add_argument('output', type=Path); p.add_argument('version')
    a = p.parse_args(); assemble(a.source, a.output, a.version)

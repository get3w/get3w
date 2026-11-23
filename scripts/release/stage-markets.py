"""Verify draft assets, restore market metadata names and stage China legacy aliases.

No network or publishing. Binaries are hard-linked without changing signed bytes.
"""
import argparse, hashlib, json, os, re
from pathlib import Path
import yaml


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def stage(source, output, version):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected stable version')
    for market in ('cn', 'global'):
        dest = output / market
        dest.mkdir(parents=True, exist_ok=False)
        for path in source.iterdir():
            if path.name.startswith(f'get3w-{market}-'):
                os.link(path, dest / path.name)
        for name in ('latest-mac.yml', 'latest.yml', 'SHA256SUMS', 'release.json'):
            os.link(source / f'{market}-{name}', dest / name)
        metadata = json.loads((dest / 'release.json').read_text())
        if metadata['version'] != version or metadata['market'] != market:
            raise ValueError('Release identity mismatch')
        for line in (dest / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split('  ', 1)
            if Path(name).name != name or sha256(dest / name) != digest:
                raise ValueError('Checksum mismatch: ' + name)
        for name in ('latest-mac.yml', 'latest.yml'):
            data = yaml.safe_load((dest / name).read_text())
            if data['version'] != version:
                raise ValueError('Manifest version mismatch')
            for item in data['files']:
                if not item['url'].startswith(f'get3w-{market}-') or not (dest / item['url']).is_file():
                    raise ValueError('Foreign or missing installer')
    # Existing releases and installations expect unsuffixed China filenames.
    legacy = output / 'legacy'
    legacy.mkdir()
    china = output / 'cn'
    for path in china.iterdir():
        if path.name.startswith('get3w-cn-'):
            os.link(path, legacy / path.name.replace('get3w-cn-', 'get3w-', 1))
    for name in ('latest-mac.yml', 'latest.yml', 'release.json'):
        (legacy / name).write_text((china / name).read_text().replace('get3w-cn-', 'get3w-'))
    checksums = [sha256(p) + '  ' + p.name for p in sorted(legacy.iterdir())]
    (legacy / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('version')
    args = parser.parse_args()
    stage(args.source, args.output, args.version)

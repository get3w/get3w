import base64, hashlib, importlib.util, tempfile, unittest
from pathlib import Path
import yaml
spec = importlib.util.spec_from_file_location('assemble', Path(__file__).with_name('assemble.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ReleaseTest(unittest.TestCase):
    def fixtures(self, root):
        for (platform, arch), extensions in module.MATRIX.items():
            folder = root / f'{platform}-{arch}'; folder.mkdir()
            files = []
            for ext in extensions:
                name = f'get3w-{platform}-{arch}-0.1.0.{ext}'; raw = name.encode(); (folder / name).write_bytes(raw)
                if ext != 'tar.gz': files.append({'url': name, 'size': len(raw), 'sha512': base64.b64encode(hashlib.sha512(raw).digest()).decode()})
            manifest = 'latest-mac.yml' if platform == 'mac' else 'latest.yml' if platform == 'win' else f'latest-linux{"-arm64" if arch == "arm64" else ""}.yml'
            (folder / manifest).write_text(yaml.safe_dump({'version': '0.1.0', 'files': files, 'path': files[0]['url'], 'sha512': files[0]['sha512']}))
    def test_complete_release_merges_both_architectures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source)
            module.assemble(source,root/'output','0.1.0')
            for name in ['latest-mac.yml','latest.yml']:
                data=yaml.safe_load((root/'output'/name).read_text()); self.assertTrue(any('-arm64-' in x['url'] for x in data['files'])); self.assertTrue(any('-x64-' in x['url'] for x in data['files']))
            self.assertTrue((root/'output/SHA256SUMS').is_file())
    def test_missing_platform_and_tampering_fail(self):
        for tamper in [False,True]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source)
                asset=source/'win-arm64/get3w-win-arm64-0.1.0.exe'
                if tamper: asset.write_bytes(b'tampered')
                else: asset.unlink()
                with self.assertRaises(ValueError): module.assemble(source,root/'output','0.1.0')

if __name__ == '__main__': unittest.main()

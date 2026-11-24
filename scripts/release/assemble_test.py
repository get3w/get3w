import base64, hashlib, importlib.util, tempfile, unittest, subprocess, json
from pathlib import Path
import yaml
spec = importlib.util.spec_from_file_location('assemble', Path(__file__).with_name('assemble.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ReleaseTest(unittest.TestCase):
    def fixtures(self, root, market=None):
        for (platform, arch), extensions in module.MATRIX.items():
            folder = root / f'{platform}-{arch}'; folder.mkdir()
            files = []
            for ext in extensions:
                prefix = f'get3w-{market}' if market else 'get3w'
                name = f'{prefix}-{platform}-{arch}-0.1.0.{ext}'; raw = name.encode(); (folder / name).write_bytes(raw)
                files.append({'url': name, 'size': len(raw), 'sha512': base64.b64encode(hashlib.sha512(raw).digest()).decode()})
            manifest = 'latest-mac.yml' if platform == 'mac' else 'latest.yml'
            (folder / manifest).write_text(yaml.safe_dump({'version': '0.1.0', 'files': files, 'path': files[0]['url'], 'sha512': files[0]['sha512']}))
    def test_complete_release_merges_both_architectures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source)
            module.assemble(source,root/'output','0.1.0')
            for name in ['latest-mac.yml','latest.yml']:
                data=yaml.safe_load((root/'output'/name).read_text()); self.assertTrue(any('-arm64-' in x['url'] for x in data['files'])); self.assertTrue(any('-x64-' in x['url'] for x in data['files']))
            self.assertTrue((root/'output/SHA256SUMS').is_file())
            recovery = Path(__file__).resolve().parents[2] / 'apps/desktop/electron/recovery.mjs'
            script = "import {parseRecoveryManifest} from " + json.dumps(recovery.as_uri()) + ";import{readFileSync}from'node:fs';console.log(JSON.stringify(parseRecoveryManifest(readFileSync(process.argv[1],'utf8'))));"
            for name in ['latest-mac.yml','latest.yml']:
                manifest = root/'output'/name
                parsed=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,str(manifest)],text=True))
                self.assertEqual(parsed, [{key: str(value) for key, value in item.items()} for item in yaml.safe_load(manifest.read_text())['files']])
    def test_missing_platform_and_tampering_fail(self):
        for tamper in [False,True]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source)
                asset=source/'win-arm64/get3w-win-arm64-0.1.0.exe'
                if tamper: asset.write_bytes(b'tampered')
                else: asset.unlink()
                with self.assertRaises(ValueError): module.assemble(source,root/'output','0.1.0')
    def test_market_identity_and_wrong_market(self):
        for market in ('cn', 'global'):
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source, market)
                module.assemble(source,root/'output','0.1.0',market)
                with self.assertRaises(ValueError):
                    module.assemble(source,root/'wrong','0.1.0','global' if market == 'cn' else 'cn')

    def test_staging_verifies_markets_and_preserves_legacy_bytes(self):
        stage_spec=importlib.util.spec_from_file_location('stage', Path(__file__).with_name('stage-markets.py'))
        stage_module=importlib.util.module_from_spec(stage_spec);stage_spec.loader.exec_module(stage_module)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); flat=root/'flat';flat.mkdir()
            for market in ('cn','global'):
                source=root/market;source.mkdir();self.fixtures(source,market)
                output=root/f'output-{market}';module.assemble(source,output,'0.1.0',market)
                for path in output.iterdir():
                    name=path.name if path.name.startswith('get3w-') else f'{market}-{path.name}'
                    (flat/name).write_bytes(path.read_bytes())
            stage_module.stage(flat,root/'staged','0.1.0')
            self.assertEqual((root/'staged/cn/get3w-cn-win-arm64-0.1.0.exe').read_bytes(),(root/'staged/legacy/get3w-win-arm64-0.1.0.exe').read_bytes())
            (flat/'get3w-global-win-arm64-0.1.0.exe').write_bytes(b'tampered')
            with self.assertRaises(ValueError):stage_module.stage(flat,root/'tampered','0.1.0')

    def test_release_has_no_linux_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'input'; source.mkdir(); self.fixtures(source)
            module.assemble(source,root/'output','0.1.0')
            self.assertFalse(any('linux' in p.name for p in (root/'output').iterdir()))

if __name__ == '__main__': unittest.main()

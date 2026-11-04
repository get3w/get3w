import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDesktopDistribution } from '../electron/desktop-distribution.mjs';

for (const flavor of ['public', 'cloud', 'enterprise', '', 'unknown']) {
  test(`public build does not restore enterprise activation from ${JSON.stringify(flavor)}`, () => {
    const distribution = resolveDesktopDistribution({isPackaged: true, packageFlavor: flavor});
    assert.notEqual(distribution.flavor, 'enterprise');
    assert.equal(distribution.requireActivation, false);
  });
}

test('packaged metadata takes precedence over development override', () => {
  assert.equal(resolveDesktopDistribution({isPackaged: true, packageFlavor: 'public', environmentFlavor: 'enterprise'}).flavor, 'public');
});

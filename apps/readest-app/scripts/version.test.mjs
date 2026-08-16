import assert from 'node:assert/strict';
import test from 'node:test';

import { coreVersion, isSemanticVersion } from './version.mjs';

test('accepts stable and prerelease semantic versions', () => {
  for (const version of [
    '1.0.1',
    '1.0.1-alpha',
    '1.0.1-beta',
    '1.0.1-beta.2',
    '1.0.1-rc.1+build.42',
  ]) {
    assert.equal(isSemanticVersion(version), true, version);
  }
});

test('rejects incomplete or malformed versions', () => {
  for (const version of ['1.0', '01.0.1', '1.0.1-', '1.0.1-alpha..1']) {
    assert.equal(isSemanticVersion(version), false, version);
  }
});

test('extracts the numeric core for stores that require it', () => {
  assert.equal(coreVersion('1.0.1-beta.2+build.42'), '1.0.1');
  assert.equal(coreVersion('not-a-version'), null);
});

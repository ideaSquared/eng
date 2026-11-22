import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readVersion } from '../src/version.ts';

describe('readVersion', () => {
  it('reads the version from package.json text', () => {
    expect(readVersion('{"name":"x","version":"1.2.3"}')).toBe('1.2.3');
  });

  it('fails when there is no version', () => {
    expect(() => readVersion('{"name":"x"}')).toThrow();
  });

  it('reads this package version, which is what eng --version prints', () => {
    const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(readVersion(text)).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

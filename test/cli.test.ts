import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readVersion } from '../src/version.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = '.test-dist';
const run = (...args: string[]) =>
  spawnSync(process.execPath, [`${outDir}/cli.js`, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ENG_NO_UPDATE: '1', NO_COLOR: '1' } });

// A real build, so the entry point is tested as people run it. It lives in .test-dist (git-ignored) so that
// ../package.json resolves the same way as from dist/.
beforeAll(() => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--outDir', outDir], { cwd: root });
}, 120_000);
afterAll(() => rmSync(`${root}${outDir}`, { recursive: true, force: true }));

describe('eng command line', () => {
  it('prints the package version for --version and exits 0', () => {
    const result = run('--version');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(readVersion(readFileSync(`${root}package.json`, 'utf8')));
  });

  it('prints usage on stdout for --help and exits 0', () => {
    const result = run('--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('eng setup');
  });

  it('reports an unknown command on stderr and exits non-zero', () => {
    const result = run('no-such-command');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command: no-such-command');
    expect(result.stdout).toBe('');
  });
});

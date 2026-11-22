import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The stale-shim cleanup in install.sh, run for real on a temp pnpm home.
const script = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const lib = script.slice(script.indexOf('# >>> stale-shims'), script.indexOf('# <<< stale-shims'));

const shim = (tool: string): string =>
  `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/global/5/.pnpm/${tool}@1.0.0/node_modules/${tool}/dist/cli.js" "$@"
`;

let home = '';
let bin = '';
const clean = (homeDir: string, binDir: string): void => {
  execFileSync('bash', ['-c', `${lib}\nremove_stale_shims "$1" "$2"`, 'bash', homeDir, binDir]);
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'eng-pnpm-'));
  bin = join(home, 'bin');
  mkdirSync(bin);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('install.sh stale shim cleanup', () => {
  it('removes pnpm 10 shims of ship, idea and eng at the top of the pnpm home', () => {
    for (const name of ['ship', 'idea', 'eng', 'ship.cmd', 'ship.ps1']) writeFileSync(join(home, name), shim(name));
    clean(home, bin);
    for (const name of ['ship', 'idea', 'eng', 'ship.cmd', 'ship.ps1']) expect(existsSync(join(home, name))).toBe(false);
  });

  it('leaves the new global bin alone', () => {
    writeFileSync(join(bin, 'ship'), shim('ship'));
    clean(home, bin);
    expect(existsSync(join(bin, 'ship'))).toBe(true);
  });

  it('leaves a file that is not a pnpm shim, even with a tool name', () => {
    writeFileSync(join(home, 'idea'), '#!/bin/sh\necho my own idea script\n');
    clean(home, bin);
    expect(readFileSync(join(home, 'idea'), 'utf8')).toContain('my own idea script');
  });

  it('leaves a symlink with a tool name', () => {
    writeFileSync(join(home, 'real'), shim('eng'));
    symlinkSync(join(home, 'real'), join(home, 'eng'));
    clean(home, bin);
    expect(existsSync(join(home, 'eng'))).toBe(true);
  });

  it('leaves other tools, even pnpm shims, untouched', () => {
    for (const name of ['pnpm', 'pnpx', 'node', 'wrangler']) writeFileSync(join(home, name), shim(name));
    clean(home, bin);
    for (const name of ['pnpm', 'pnpx', 'node', 'wrangler']) expect(existsSync(join(home, name))).toBe(true);
  });

  it('does nothing when the global bin is the pnpm home (pnpm 10 layout)', () => {
    writeFileSync(join(home, 'ship'), shim('ship'));
    clean(home, `${home}/`);
    expect(existsSync(join(home, 'ship'))).toBe(true);
  });

  it('does nothing when pnpm could not say where the global bin is, and can be re-run', () => {
    writeFileSync(join(home, 'ship'), shim('ship'));
    clean(home, '');
    expect(existsSync(join(home, 'ship'))).toBe(true);
    clean(home, bin);
    clean(home, bin);
    expect(existsSync(join(home, 'ship'))).toBe(false);
  });
});

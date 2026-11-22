import { describe, expect, it } from 'vitest';
import { checkGlobalCli, foldersWith, isRunnable, sameFolder, shimNames } from '../src/shims.ts';

const bin = '/home/me/.local/share/pnpm/bin';
const home = '/home/me/.local/share/pnpm';
const winBin = 'C:\\Users\\me\\AppData\\Local\\pnpm\\bin';
const winHome = 'C:\\Users\\me\\AppData\\Local\\pnpm';

describe('shimNames', () => {
  it('is the bare name on Linux and macOS', () => {
    expect(shimNames('ship', false)).toEqual(['ship']);
  });

  it('adds the .cmd and .ps1 shims on Windows', () => {
    expect(shimNames('ship', true)).toEqual(['ship', 'ship.cmd', 'ship.ps1']);
  });
});

describe('sameFolder', () => {
  it('ignores a trailing separator', () => {
    expect(sameFolder('/a/b/', '/a/b', false)).toBe(true);
  });

  it('ignores case and separator style on Windows only', () => {
    expect(sameFolder('C:\\Pnpm\\bin\\', 'c:/pnpm/bin', true)).toBe(true);
    expect(sameFolder('/A/b', '/a/b', false)).toBe(false);
  });
});

describe('foldersWith', () => {
  const exists = (files: string[]) => (file: string) => files.includes(file);

  it('lists every PATH folder that holds the tool, in PATH order', () => {
    const found = foldersWith('ship', [home, '/usr/bin', bin], exists([`${home}/ship`, `${bin}/ship`]), false);
    expect(found).toEqual([home, bin]);
  });

  it('counts a folder once however often PATH repeats it', () => {
    expect(foldersWith('ship', [bin, `${bin}/`, bin], exists([`${bin}/ship`]), false)).toEqual([bin]);
  });

  it('finds a Windows folder from any of its shims', () => {
    expect(foldersWith('ship', [winHome, winBin], exists([`${winHome}\\ship.ps1`, `${winBin}\\ship.cmd`]), true)).toEqual([winHome, winBin]);
  });

  it('reads an empty PATH entry as the current folder on Linux and macOS', () => {
    const found = foldersWith('ship', ['', bin], exists(['/work/ship', `${bin}/ship`]), false, '/work');
    expect(found).toEqual(['/work', bin]);
  });

  it('ignores an empty PATH entry on Windows', () => {
    expect(foldersWith('ship', ['', winBin], exists([`${winBin}\\ship.cmd`]), true, 'C:\\work')).toEqual([winBin]);
  });

  it('is empty when no folder holds the tool', () => {
    expect(foldersWith('ship', [bin], exists([]), false)).toEqual([]);
  });
});

describe('isRunnable', () => {
  it('needs a regular file with an execute bit on Linux and macOS', () => {
    expect(isRunnable({ isFile: true, mode: 0o755 }, false)).toBe(true);
    expect(isRunnable({ isFile: true, mode: 0o644 }, false)).toBe(false);
    expect(isRunnable({ isFile: false, mode: 0o755 }, false)).toBe(false);
  });

  it('needs only a file on Windows, which has no execute bit', () => {
    expect(isRunnable({ isFile: true, mode: 0o644 }, true)).toBe(true);
    expect(isRunnable({ isFile: false, mode: 0o644 }, true)).toBe(false);
  });
});

describe('checkGlobalCli', () => {
  const base = { name: 'ship', binDir: bin, windows: false };

  it('passes when one folder, the global bin, holds a tool that runs', () => {
    expect(checkGlobalCli({ ...base, folders: [bin], version: 'ship 1.4.0' })).toEqual({
      name: 'ship',
      ok: true,
      required: true,
      detail: '1.4.0',
    });
  });

  it('fails a tool no PATH folder holds', () => {
    expect(checkGlobalCli({ ...base, folders: [], version: undefined })).toMatchObject({ ok: false, detail: 'not found', fix: 'Run: eng update' });
  });

  it('fails a tool found in more than one folder, naming them and the fix', () => {
    const result = checkGlobalCli({ ...base, folders: [home, bin], version: '1.0.0' });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(home);
    expect(result.detail).toContain(bin);
    expect(result.fix).toContain('pnpm setup');
    expect(result.fix).toContain('11.15.1');
    expect(result.fix).toContain(`delete the old ship shims in ${home}`);
  });

  it('advises deleting the stale folder, not PNPM_HOME, when they differ', () => {
    const stale = '/opt/old-bin';
    const result = checkGlobalCli({ ...base, folders: [stale, bin], version: '1.0.0' });
    expect(result.fix).toContain(`delete the old ship shims in ${stale}`);
    expect(result.fix).not.toContain(home);
  });

  it('fails when the first match is not in the global bin', () => {
    const result = checkGlobalCli({ ...base, folders: [home], version: '1.0.0' });
    expect(result.ok).toBe(false);
    expect(result.detail).toBe(`runs from ${home}, not ${bin}`);
    expect(result.fix).toContain('pnpm setup');
  });

  it('accepts the pnpm home itself when the global bin is the pnpm home (pnpm 10 layout)', () => {
    expect(checkGlobalCli({ ...base, binDir: home, folders: [home], version: '1.0.0' })).toMatchObject({ ok: true });
  });

  it('does not judge the folder when pnpm cannot say where the global bin is', () => {
    expect(checkGlobalCli({ ...base, binDir: undefined, folders: [home], version: '1.0.0' })).toMatchObject({ ok: true });
  });

  it('fails a tool that does not run --version', () => {
    expect(checkGlobalCli({ ...base, folders: [bin], version: undefined })).toMatchObject({
      ok: false,
      detail: 'found but --version fails',
      fix: 'Run: eng update',
    });
  });

  it('names Windows folders the same way', () => {
    const result = checkGlobalCli({ name: 'idea', binDir: winBin, windows: true, folders: [winHome, winBin], version: '1.0.0' });
    expect(result.ok).toBe(false);
    expect(result.fix).toContain(`delete the old idea shims in ${winHome}`);
  });
});

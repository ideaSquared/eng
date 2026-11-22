// Where the global CLIs (ship, idea, eng) resolve on PATH. pnpm 11 moved global bins from PNPM_HOME to
// PNPM_HOME/bin, so shims left there by pnpm 10 can sit earlier on PATH and win. Pure: the caller supplies
// the PATH folders, a file-exists check and what `<tool> --version` printed.
import { parseVersion, type Result } from './checks.ts';

export const shimNames = (name: string, windows: boolean): string[] => (windows ? [name, `${name}.cmd`, `${name}.ps1`] : [name]);

const trim = (dir: string): string => dir.replace(/[\\/]+$/, '');

const normal = (dir: string, windows: boolean): string => (windows ? trim(dir).replaceAll('\\', '/').toLowerCase() : trim(dir));

export const sameFolder = (a: string, b: string, windows: boolean): boolean => normal(a, windows) === normal(b, windows);

// Whether a directory entry is something the shell would run: on Linux and macOS a regular file with an execute bit
// (a directory or a non-executable file is skipped by lookup), on Windows any file (it has no execute bit).
export const isRunnable = (info: { isFile: boolean; mode: number }, windows: boolean): boolean => info.isFile && (windows || (info.mode & 0o111) !== 0);

// Every PATH folder holding the tool, in PATH order, each once. On Linux and macOS an empty PATH entry means the
// current folder (`cwd`).
export const foldersWith = (name: string, pathEntries: readonly string[], exists: (file: string) => boolean, windows: boolean, cwd?: string): string[] => {
  const sep = windows ? '\\' : '/';
  const dirs = pathEntries.map((entry) => (entry === '' && !windows && cwd !== undefined ? cwd : entry));
  return dirs
    .filter((dir, i) => dir !== '' && dirs.findIndex((other) => sameFolder(other, dir, windows)) === i)
    .filter((dir) => shimNames(name, windows).some((file) => exists(`${trim(dir)}${sep}${file}`)))
    .map(trim);
};

const fixFor = (name: string, folder: string): string =>
  `Run: pnpm setup (pnpm 11.15.1 or later), or delete the old ${name} shims in ${folder}, then run: eng update`;

export type GlobalCli = {
  name: string;
  folders: readonly string[];
  binDir: string | undefined;
  windows: boolean;
  version: string | undefined;
};

export const checkGlobalCli = ({ name, folders, binDir, windows, version }: GlobalCli): Result => {
  const base = { name, required: true };
  const [first] = folders;
  if (first === undefined) return { ...base, ok: false, detail: 'not found', fix: 'Run: eng update' };
  if (folders.length > 1) {
    const stale = binDir ? (folders.find((dir) => !sameFolder(dir, binDir, windows)) ?? first) : first;
    return { ...base, ok: false, detail: `found in ${folders.length} folders on PATH: ${folders.join(', ')}`, fix: fixFor(name, stale) };
  }
  if (binDir !== undefined && !sameFolder(first, binDir, windows)) {
    return { ...base, ok: false, detail: `runs from ${first}, not ${binDir}`, fix: fixFor(name, first) };
  }
  if (version === undefined) return { ...base, ok: false, detail: 'found but --version fails', fix: 'Run: eng update' };
  const parsed = parseVersion(version);
  return { ...base, ok: true, detail: parsed ? parsed.join('.') : 'unknown version' };
};

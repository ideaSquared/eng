// Where the global CLIs (ship, idea, eng) resolve on PATH. pnpm 11 moved global bins from PNPM_HOME to
// PNPM_HOME/bin, so shims left there by pnpm 10 can sit earlier on PATH and win. Pure: the caller supplies
// the PATH folders, a file-exists check and what `<tool> --version` printed.
import { parseVersion } from "./checks.js";
export const shimNames = (name, windows) => (windows ? [name, `${name}.cmd`, `${name}.ps1`] : [name]);
const trim = (dir) => dir.replace(/[\\/]+$/, '');
const normal = (dir, windows) => (windows ? trim(dir).replaceAll('\\', '/').toLowerCase() : trim(dir));
export const sameFolder = (a, b, windows) => normal(a, windows) === normal(b, windows);
// Every PATH folder holding the tool, in PATH order, each once.
export const foldersWith = (name, dirs, exists, windows) => {
    const sep = windows ? '\\' : '/';
    return dirs
        .filter((dir, i) => dir !== '' && dirs.findIndex((other) => sameFolder(other, dir, windows)) === i)
        .filter((dir) => shimNames(name, windows).some((file) => exists(`${trim(dir)}${sep}${file}`)))
        .map(trim);
};
const fixFor = (name, folder) => `Run: pnpm setup (pnpm 11.15.1 or later), or delete the old ${name} shims in ${folder}, then run: eng update`;
export const checkGlobalCli = ({ name, folders, binDir, pnpmHome, windows, version }) => {
    const base = { name, required: true };
    const [first] = folders;
    if (first === undefined)
        return { ...base, ok: false, detail: 'not found', fix: 'Run: eng update' };
    if (folders.length > 1) {
        const stale = binDir ? (folders.find((dir) => !sameFolder(dir, binDir, windows)) ?? first) : first;
        return { ...base, ok: false, detail: `found in ${folders.length} folders on PATH: ${folders.join(', ')}`, fix: fixFor(name, pnpmHome ?? stale) };
    }
    if (binDir !== undefined && !sameFolder(first, binDir, windows)) {
        return { ...base, ok: false, detail: `runs from ${first}, not ${binDir}`, fix: fixFor(name, first) };
    }
    if (version === undefined)
        return { ...base, ok: false, detail: 'found but --version fails', fix: 'Run: eng update' };
    const parsed = parseVersion(version);
    return { ...base, ok: true, detail: parsed ? parsed.join('.') : 'unknown version' };
};

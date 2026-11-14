// The commit `git ls-remote <url> HEAD` reports for the default branch.
export const parseLsRemote = (output) => /^([0-9a-f]{40})\s+HEAD$/m.exec(output)?.[1];
// Repos whose latest commit differs from the one last installed. A repo GitHub did not answer for is left alone.
export const staleRepos = (installed, latest) => Object.entries(latest)
    .filter(([repo, sha]) => sha !== undefined && installed[repo] !== sha)
    .map(([repo]) => repo);
// update and setup install the CLIs themselves; scripts and ENG_NO_UPDATE=1 skip the check.
export const shouldCheck = (command, env, interactive) => interactive && !env.ENG_NO_UPDATE && command !== 'update' && command !== 'setup';
export const listNames = (names) => names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

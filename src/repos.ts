// The repos a developer works in, and how each one should be brought up to date.
export const ORG = 'ideaSquared';

export const REPOS: readonly string[] = [
  'adopt-dont-shop',
  'agent-idea',
  'creatrgrid',
  'eng',
  'ideasquared-bot',
  'ideasquared-website',
  'pairflix',
  'shipper',
  'social-generator',
];

// Global CLIs, installed and updated from their repos' default branches, with the command each one gives you.
export const GLOBAL_CLIS: Readonly<Record<string, string>> = {
  [`${ORG}/eng`]: 'eng',
  [`${ORG}/shipper`]: 'ship',
  [`${ORG}/agent-idea`]: 'idea',
};
export const GLOBAL_REPOS: readonly string[] = Object.keys(GLOBAL_CLIS);
export const GLOBAL_PACKAGES: readonly string[] = GLOBAL_REPOS.map((repo) => `github:${repo}`);

export type RepoState = { name: string; cloned: false } | { name: string; cloned: true; branch?: string; defaultBranch?: string; dirty: boolean };

export type RepoAction = { name: string; action: 'clone' } | { name: string; action: 'pull' } | { name: string; action: 'skip'; reason: string };

// Only a clean checkout of the default branch is pulled, so update never touches work in progress.
export const planRepo = (state: RepoState): RepoAction => {
  if (!state.cloned) return { name: state.name, action: 'clone' };
  if (state.dirty) return { name: state.name, action: 'skip', reason: 'has uncommitted changes' };
  if (!state.branch || state.branch !== state.defaultBranch) {
    return {
      name: state.name,
      action: 'skip',
      reason: `on ${state.branch ?? 'a detached HEAD'}, not ${state.defaultBranch ?? 'the default branch'}`,
    };
  }
  return { name: state.name, action: 'pull' };
};

// How a repo's dependencies are installed, from the manifest files it has.
// `venv` is whether the repo's .venv is ready to use (its Python runs and has pip), not merely whether the folder exists.
export type RepoFiles = { packageJson: boolean; requirements: boolean; venv: boolean };
export type DepsStep = { command: string; args: string[]; label: string; needsPython: boolean };

// The Python that creates a repo's environment: `python3` is a Microsoft Store stub on Windows.
export const pythonCommand = (windows: boolean): string => (windows ? 'python' : 'python3');

// Where a repo's own Python lives once its .venv exists, relative to the repo.
export const venvPython = (windows: boolean): string => (windows ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

// pnpm for a package.json; for a requirements.txt, a .venv inside the repo, so nothing is installed into the system
// Python and a re-run only installs what changed. The .venv is made when it is not ready, which also repairs one an
// interrupted run left half-made.
export const depsSteps = (files: RepoFiles, windows: boolean): DepsStep[] => [
  ...(files.packageJson ? [{ command: 'pnpm', args: ['install'], label: 'pnpm install', needsPython: false }] : []),
  ...(files.requirements && !files.venv
    ? [{ command: pythonCommand(windows), args: ['-m', 'venv', '.venv'], label: 'create or repair the Python environment in .venv', needsPython: true }]
    : []),
  ...(files.requirements
    ? [{ command: venvPython(windows), args: ['-m', 'pip', 'install', '-r', 'requirements.txt'], label: 'pip install -r requirements.txt', needsPython: true }]
    : []),
];

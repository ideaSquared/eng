// What eng checks on a machine, as pure functions over a `run` that executes a command.
export type Version = readonly [number, number, number];

// stdout of a command that exited 0, or undefined when it is missing or failed.
export type Run = (command: string, args: string[]) => string | undefined;

export type Tool = {
  name: string;
  command: string;
  args: string[];
  min?: Version;
  showVersion: boolean;
  required: boolean;
  fix: string;
};

export type Result = { name: string; ok: boolean; required: boolean; detail: string; fix?: string };

export const TOOLS: readonly Tool[] = [
  {
    name: 'Node',
    command: 'node',
    args: ['--version'],
    min: [22, 18, 0],
    showVersion: true,
    required: true,
    fix: 'Re-run the installer, or install Node 22.18 or later from https://nodejs.org',
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    args: ['--version'],
    min: [10, 0, 0],
    showVersion: true,
    required: true,
    fix: 'Run: npm install -g pnpm@10',
  },
  {
    name: 'git',
    command: 'git',
    args: ['--version'],
    showVersion: true,
    required: true,
    fix: 'Install git from https://git-scm.com/downloads',
  },
  {
    name: 'GitHub CLI',
    command: 'gh',
    args: ['--version'],
    showVersion: true,
    required: true,
    fix: 'Install gh from https://cli.github.com',
  },
  { name: 'ship', command: 'ship', args: ['--help'], showVersion: false, required: true, fix: 'Run: eng update' },
  { name: 'idea', command: 'idea', args: ['--help'], showVersion: false, required: true, fix: 'Run: eng update' },
  {
    name: 'Docker',
    command: 'docker',
    args: ['--version'],
    showVersion: true,
    required: false,
    fix: 'Only adopt-dont-shop needs it: https://docs.docker.com/get-docker/',
  },
];

// The tools setup cannot install itself; the installer script does.
export const BASE_TOOLS: readonly string[] = ['Node', 'pnpm', 'git', 'GitHub CLI'];

export const parseVersion = (text: string): Version | undefined => {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined;
};

export const atLeast = (version: Version, min: Version): boolean => {
  const i = version.findIndex((n, k) => n !== min[k]);
  return i === -1 || (version[i] ?? 0) > (min[i] ?? 0);
};

const show = (version: Version | undefined): string => version?.join('.') ?? 'unknown version';

export const checkTool = (tool: Tool, run: Run): Result => {
  const base = { name: tool.name, required: tool.required };
  const out = run(tool.command, tool.args);
  if (out === undefined) return { ...base, ok: false, detail: 'not found', fix: tool.fix };
  const version = parseVersion(out);
  if (tool.min && !(version && atLeast(version, tool.min))) {
    return { ...base, ok: false, detail: `${show(version)}, need ${tool.min.join('.')} or later`, fix: tool.fix };
  }
  return { ...base, ok: true, detail: tool.showVersion ? show(version) : 'installed' };
};

export const checkGitHubLogin = (run: Run): Result => {
  const ok = run('gh', ['auth', 'status']) !== undefined;
  return ok
    ? { name: 'GitHub login', ok, required: true, detail: 'signed in' }
    : { name: 'GitHub login', ok, required: true, detail: 'not signed in', fix: 'Run: gh auth login' };
};

export const formatResults = (results: readonly Result[]): { lines: string[]; ok: boolean } => ({
  lines: results.map((r) => {
    const mark = r.ok ? '✓' : r.required ? '✗' : '!';
    return `${mark} ${r.name}: ${r.detail}${r.ok || !r.fix ? '' : `\n    ${r.fix}`}`;
  }),
  ok: results.every((r) => r.ok || !r.required),
});

#!/usr/bin/env node
// eng: set up and update an ideaSquared developer machine. See the README for the commands.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BASE_TOOLS, checkGitHubLogin, checkTool, formatResults, TOOLS, type Result, type Run } from './checks.ts';
import { GLOBAL_PACKAGES, ORG, planRepo, REPOS, type RepoState } from './repos.ts';

const HELP = `eng: set up and update an ideaSquared developer machine

  eng setup [--dir <folder>]   sign in to GitHub, install ship and idea, clone and install every repo
  eng update                   update ship, idea and eng, pull every clean repo on its default branch
  eng doctor                   check what is missing or out of date

Repos live in ~/ideasquared unless you pass --dir to setup (it is remembered) or set ENG_DIR.`;

// Global pnpm commands are .cmd shims on Windows, which only start through a shell.
const shell = process.platform === 'win32';
const CONFIG = join(homedir(), '.config', 'eng', 'config.json');

const run: Run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'pipe'] });
  return result.status === 0 ? result.stdout.trim() : undefined;
};

const runIn = (cwd: string): Run => (command, args) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'pipe'] });
  return result.status === 0 ? result.stdout.trim() : undefined;
};

// Runs with the terminal attached, for commands that ask questions or show progress.
const live = (command: string, args: string[], cwd?: string): boolean =>
  spawnSync(command, args, { cwd, shell, stdio: 'inherit' }).status === 0;

const savedDir = (): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(CONFIG, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && 'dir' in parsed && typeof parsed.dir === 'string'
      ? parsed.dir
      : undefined;
  } catch {
    return undefined;
  }
};

const saveDir = (dir: string): void => {
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, `${JSON.stringify({ dir }, null, 2)}\n`);
};

const reposDir = (): string => process.env.ENG_DIR ?? savedDir() ?? join(homedir(), 'ideasquared');

const repoState = (dir: string, name: string): RepoState => {
  const path = join(dir, name);
  if (!existsSync(join(path, '.git'))) return { name, cloned: false };
  const git = runIn(path);
  const branch = git('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const remoteHead = git('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return {
    name,
    cloned: true,
    branch: branch === 'HEAD' ? undefined : branch,
    defaultBranch: remoteHead?.replace(/^origin\//, ''),
    // A failed status check counts as dirty: update must not pull when it cannot tell.
    dirty: git('git', ['status', '--porcelain']) !== '',
  };
};

const installDeps = (dir: string, name: string): boolean => {
  const path = join(dir, name);
  if (!existsSync(join(path, 'package.json'))) return true;
  console.log(`\n→ ${name}: pnpm install`);
  const ok = live('pnpm', ['install'], path);
  if (!ok) console.log(`! ${name}: pnpm install failed. Run it in ${path} to see why.`);
  return ok;
};

const installGlobals = (): boolean => {
  console.log('\n→ Installing ship, idea and eng');
  return live('pnpm', ['add', '-g', ...GLOBAL_PACKAGES]);
};

const doctor = (dir: string): number => {
  const repoResults: Result[] = REPOS.map((name) =>
    existsSync(join(dir, name, '.git'))
      ? { name: `repo ${name}`, ok: true, required: false, detail: 'cloned' }
      : { name: `repo ${name}`, ok: false, required: false, detail: `not in ${dir}`, fix: 'Run: eng setup' },
  );
  const { lines, ok } = formatResults([...TOOLS.map((t) => checkTool(t, run)), checkGitHubLogin(run), ...repoResults]);
  console.log(lines.join('\n'));
  console.log(ok ? '\nAll required tools are ready.' : '\nSome required tools are missing. Follow the fixes above.');
  return ok ? 0 : 1;
};

const setup = (dir: string): number => {
  const base = formatResults(TOOLS.filter((t) => BASE_TOOLS.includes(t.name)).map((t) => checkTool(t, run)));
  if (!base.ok) {
    console.log(`${base.lines.join('\n')}\n\nInstall the missing tools (the installer script does this), then run eng setup again.`);
    return 1;
  }
  if (!checkGitHubLogin(run).ok) {
    console.log('\n→ Signing in to GitHub');
    if (!live('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'])) return 1;
  }
  live('gh', ['auth', 'setup-git']);
  if (!installGlobals()) return 1;

  mkdirSync(dir, { recursive: true });
  const actions = REPOS.map((name) => planRepo(repoState(dir, name)));
  const cloned = actions
    .filter((a) => a.action === 'clone')
    .filter(({ name }) => {
      console.log(`\n→ Cloning ${ORG}/${name}`);
      const ok = live('gh', ['repo', 'clone', `${ORG}/${name}`, name], dir);
      if (!ok) console.log(`! ${name}: clone failed. Ask for access to ${ORG}/${name} if you need it.`);
      return ok;
    });
  // Existing clean checkouts get their dependencies too, so re-running setup finishes an interrupted one.
  const toInstall = [...cloned, ...actions.filter((a) => a.action === 'pull')];
  const installed = toInstall.map(({ name }) => installDeps(dir, name)).every(Boolean);

  console.log('');
  const status = doctor(dir);
  return installed ? status : 1;
};

const update = (dir: string): number => {
  const globalsOk = installGlobals();
  const actions = REPOS.map((name) => planRepo(repoState(dir, name)));
  const reposOk = actions
    .map((a) => {
      if (a.action === 'clone') {
        console.log(`! ${a.name}: not cloned. Run eng setup.`);
        return true;
      }
      if (a.action === 'skip') {
        console.log(`- ${a.name}: skipped, ${a.reason}`);
        return true;
      }
      console.log(`\n→ ${a.name}: git pull`);
      if (!live('git', ['pull', '--ff-only'], join(dir, a.name))) {
        console.log(`! ${a.name}: pull failed.`);
        return false;
      }
      return installDeps(dir, a.name);
    })
    .every(Boolean);
  console.log('');
  const status = doctor(dir);
  return globalsOk && reposOk ? status : 1;
};

const main = (): number => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { dir: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
  const [command] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  const dir = values.dir ? resolve(values.dir) : reposDir();
  if (values.dir && command === 'setup') saveDir(dir);
  if (command === 'setup') return setup(dir);
  if (command === 'update') return update(dir);
  if (command === 'doctor') return doctor(dir);
  console.log(`Unknown command: ${command}\n\n${HELP}`);
  return 1;
};

process.exitCode = main();

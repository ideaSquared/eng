import { describe, expect, it } from 'vitest';
import { depsSteps, planRepo, REPOS, runDepsSteps, type DepsIo } from '../src/repos.ts';

describe('planRepo', () => {
  it('clones a missing repo', () => {
    expect(planRepo({ name: 'pairflix', cloned: false })).toEqual({ name: 'pairflix', action: 'clone' });
  });

  it('pulls a clean checkout of the default branch', () => {
    expect(planRepo({ name: 'pairflix', cloned: true, branch: 'master', defaultBranch: 'master', dirty: false })).toEqual({
      name: 'pairflix',
      action: 'pull',
    });
  });

  it('leaves uncommitted work alone', () => {
    expect(planRepo({ name: 'pairflix', cloned: true, branch: 'master', defaultBranch: 'master', dirty: true })).toEqual({
      name: 'pairflix',
      action: 'skip',
      reason: 'has uncommitted changes',
    });
  });

  it('leaves a feature branch alone', () => {
    expect(planRepo({ name: 'eng', cloned: true, branch: 'my-feature', defaultBranch: 'main', dirty: false })).toEqual({
      name: 'eng',
      action: 'skip',
      reason: 'on my-feature, not main',
    });
  });

  it('leaves a detached HEAD alone', () => {
    expect(planRepo({ name: 'eng', cloned: true, defaultBranch: 'main', dirty: false })).toMatchObject({
      action: 'skip',
      reason: 'on a detached HEAD, not main',
    });
  });
});

describe('the repo list', () => {
  it('has the repos developers work in, and none that were retired', () => {
    expect(REPOS).toContain('ideasquared-website');
    expect(REPOS.filter((name) => name.startsWith('gaminginit'))).toEqual([]);
  });
});

describe('depsSteps', () => {
  const labels = (files: Parameters<typeof depsSteps>[0], windows = false): string[] =>
    depsSteps(files, windows).map((step) => [step.command, ...step.args].join(' '));

  it('runs pnpm install for a package.json', () => {
    expect(labels({ packageJson: true, requirements: false, venv: false })).toEqual(['pnpm install']);
  });

  it('does nothing for a repo with no manifest', () => {
    expect(depsSteps({ packageJson: false, requirements: false, venv: false }, false)).toEqual([]);
  });

  it('makes the .venv when it is not ready, then installs requirements.txt into it', () => {
    expect(labels({ packageJson: false, requirements: true, venv: false })).toEqual([
      'python3 -m venv .venv',
      '.venv/bin/python -m pip install -r requirements.txt',
    ]);
    expect(labels({ packageJson: false, requirements: true, venv: true })).toEqual(['.venv/bin/python -m pip install -r requirements.txt']);
  });

  it('uses python and the Scripts folder on Windows', () => {
    expect(labels({ packageJson: false, requirements: true, venv: false }, true)).toEqual([
      'python -m venv .venv',
      '.venv\\Scripts\\python.exe -m pip install -r requirements.txt',
    ]);
  });

  it('marks only the Python steps as needing Python', () => {
    expect(depsSteps({ packageJson: true, requirements: true, venv: false }, false).map((step) => step.needsPython)).toEqual([false, true, true]);
  });

  it('lists social-generator, whose dependencies are Python', () => {
    expect(REPOS).toContain('social-generator');
  });
});

describe('runDepsSteps', () => {
  const venv = { ownPython: '/repos/sg/.venv/bin/python', venvCommand: '.venv/bin/python', venvDir: '/repos/sg/.venv' };
  const steps = depsSteps({ packageJson: false, requirements: true, venv: false }, false);

  // A machine where every command succeeds; `answers` is what the .venv's Python prints for --version and pip.
  const machine = (answers: { version?: string; pip?: string }, fails: string[] = []) => {
    const ran: string[] = [];
    const lines: string[] = [];
    const io: DepsIo = {
      live: (command, args) => {
        ran.push([command, ...args].join(' '));
        return !fails.some((f) => [command, ...args].join(' ').includes(f));
      },
      run: (command, args) => (command !== venv.ownPython ? undefined : args[0] === '--version' ? answers.version : answers.pip),
      log: (line) => lines.push(line),
    };
    return { io, ran, lines };
  };

  it('installs requirements with the repo Python once the .venv checks out', () => {
    const { io, ran, lines } = machine({ version: 'Python 3.12.1', pip: 'pip 24.0' });
    expect(runDepsSteps('sg', '/repos/sg', steps, venv, io)).toBe(true);
    expect(ran).toEqual(['python3 -m venv .venv', '/repos/sg/.venv/bin/python -m pip install -r requirements.txt']);
    expect(lines.filter((line) => line.startsWith('!'))).toEqual([]);
  });

  it('does not run pip when a repaired .venv kept an old Python', () => {
    const { io, ran, lines } = machine({ version: 'Python 3.9.18', pip: 'pip 24.0' });
    expect(runDepsSteps('sg', '/repos/sg', steps, venv, io)).toBe(false);
    expect(ran).toEqual(['python3 -m venv .venv']);
    expect(lines.at(-1)).toBe('! sg: its .venv still uses a Python older than 3.10. To rebuild it, delete /repos/sg/.venv, then run eng update.');
  });

  it('does not run pip when pip is still broken after the repair', () => {
    const { io, ran, lines } = machine({ version: 'Python 3.12.1' });
    expect(runDepsSteps('sg', '/repos/sg', steps, venv, io)).toBe(false);
    expect(ran).toEqual(['python3 -m venv .venv']);
    expect(lines.at(-1)).toBe('! sg: pip in its .venv is still broken. To rebuild it, delete /repos/sg/.venv, then run eng update.');
  });

  it('stops at a step that fails and says where to look', () => {
    const { io, ran, lines } = machine({ version: 'Python 3.12.1', pip: 'pip 24.0' }, ['-m venv']);
    expect(runDepsSteps('sg', '/repos/sg', steps, venv, io)).toBe(false);
    expect(ran).toEqual(['python3 -m venv .venv']);
    expect(lines.at(-1)).toContain('failed. Run it in /repos/sg to see why.');
  });

  it('skips the .venv checks for a repo that only needs pnpm', () => {
    const { io, ran } = machine({});
    expect(runDepsSteps('web', '/repos/web', depsSteps({ packageJson: true, requirements: false, venv: false }, false), venv, io)).toBe(true);
    expect(ran).toEqual(['pnpm install']);
  });
});

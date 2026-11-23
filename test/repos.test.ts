import { describe, expect, it } from 'vitest';
import { depsSteps, planRepo, REPOS } from '../src/repos.ts';

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

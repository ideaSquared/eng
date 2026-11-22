import { describe, expect, it } from 'vitest';
import { planRepo, REPOS } from '../src/repos.ts';

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

import { describe, expect, it } from 'vitest';
import { atLeast, canReadTeams, checkGitHubLogin, checkTool, formatResults, parseVersion, type Run, type Tool } from '../src/checks.ts';

const node: Tool = {
  name: 'Node',
  command: 'node',
  args: ['--version'],
  min: [22, 18, 0],
  showVersion: true,
  required: true,
  fix: 'install Node',
};
const answers =
  (outputs: Record<string, string>): Run =>
  (command) =>
    outputs[command];

describe('versions', () => {
  it('reads versions from tool output', () => {
    expect(parseVersion('v22.20.1')).toEqual([22, 20, 1]);
    expect(parseVersion('gh version 2.83.0 (2026-10-01)')).toEqual([2, 83, 0]);
    expect(parseVersion('git version 2.47')).toEqual([2, 47, 0]);
    expect(parseVersion('no version here')).toBeUndefined();
  });

  it('compares against a minimum', () => {
    expect(atLeast([22, 18, 0], [22, 18, 0])).toBe(true);
    expect(atLeast([24, 0, 0], [22, 18, 0])).toBe(true);
    expect(atLeast([22, 9, 5], [22, 18, 0])).toBe(false);
    expect(atLeast([20, 30, 0], [22, 18, 0])).toBe(false);
  });
});

describe('checkTool', () => {
  it('passes a new enough tool', () => {
    expect(checkTool(node, answers({ node: 'v22.20.1' }))).toEqual({
      name: 'Node',
      required: true,
      ok: true,
      detail: '22.20.1',
    });
  });

  it('fails an old tool with the fix', () => {
    expect(checkTool(node, answers({ node: 'v20.11.0' }))).toMatchObject({
      ok: false,
      detail: '20.11.0, need 22.18.0 or later',
      fix: 'install Node',
    });
  });

  it('fails a missing tool', () => {
    expect(checkTool(node, answers({}))).toMatchObject({ ok: false, detail: 'not found' });
  });

  it('reports a tool without a version as installed', () => {
    const ship: Tool = { name: 'ship', command: 'ship', args: ['--help'], showVersion: false, required: true, fix: '' };
    expect(checkTool(ship, answers({ ship: 'ship deploy -n 10' }))).toMatchObject({ ok: true, detail: 'installed' });
  });
});

describe('checkGitHubLogin', () => {
  it('passes when gh auth status succeeds, even with no stdout', () => {
    expect(checkGitHubLogin(answers({ gh: '' })).ok).toBe(true);
  });

  it('tells you to sign in otherwise', () => {
    expect(checkGitHubLogin(answers({}))).toMatchObject({ ok: false, fix: 'Run: gh auth login' });
  });
});

describe('formatResults', () => {
  it('fails only on a missing required tool', () => {
    const optional = { name: 'Docker', ok: false, required: false, detail: 'not found', fix: 'get Docker' };
    expect(formatResults([optional]).ok).toBe(true);
    expect(formatResults([{ ...optional, required: true }]).ok).toBe(false);
  });

  it('shows each result with its fix', () => {
    const { lines } = formatResults([
      { name: 'Node', ok: true, required: true, detail: '22.20.1' },
      { name: 'gh', ok: false, required: true, detail: 'not found', fix: 'install gh' },
      { name: 'Docker', ok: false, required: false, detail: 'not found', fix: 'get Docker' },
    ]);
    expect(lines).toEqual(['✓ Node: 22.20.1', '✗ gh: not found\n    install gh', '! Docker: not found\n    get Docker']);
  });
});

describe('GitHub token scopes', () => {
  it('reads the scopes from the response headers of gh api -i', () => {
    const headers = 'HTTP/2.0 200 OK\nContent-Type: application/json\nX-Oauth-Scopes: gist, read:org, repo\n\n{"login":"x"}';
    expect(canReadTeams(headers)).toBe(true);
  });

  it('accepts admin:org and write:org, which include read:org', () => {
    expect(canReadTeams('X-OAuth-Scopes: repo, admin:org\n')).toBe(true);
    expect(canReadTeams('X-OAuth-Scopes: repo, write:org\n')).toBe(true);
  });

  it('says no when read:org is missing or the headers cannot be read', () => {
    expect(canReadTeams('X-Oauth-Scopes: gist, repo\n')).toBe(false);
    expect(canReadTeams('X-Oauth-Scopes: write:org-ish\n')).toBe(false);
    expect(canReadTeams(undefined)).toBe(false);
  });
});

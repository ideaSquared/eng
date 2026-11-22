import { describe, expect, it } from 'vitest';
import { atLeast, checkGitHubLogin, checkOpsAccess, checkTool, formatResults, OPS_TOKEN_URL, parseVersion, TOOLS, type Run, type Tool } from '../src/checks.ts';

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
  it('requires Node 24 on this machine', () => {
    const required = TOOLS.find((tool) => tool.name === 'Node');
    expect(required && checkTool(required, answers({ node: 'v22.20.1' }))).toMatchObject({ ok: false });
    expect(required && checkTool(required, answers({ node: 'v24.0.0' }))).toMatchObject({ ok: true });
  });

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

describe('ops access', () => {
  const products = [
    { name: 'creatrgrid', team: 'creatrgrid' },
    { name: 'ads', team: 'adoptdontshop' },
  ];
  // gh run as the token eng ops would send.
  const gh =
    (headers: string | undefined, teams: string | undefined): Run =>
    (_command, args) =>
      args.includes('-i') ? headers : args.includes('user/teams') ? teams : undefined;
  const READ_ORG = 'HTTP/2.0 200 OK\nX-Oauth-Scopes: read:org\n\n{"login":"x"}';
  const TEAMS = 'ideaSquared/creatrgrid\nideaSquared/adoptdontshop\n';

  it('shows each product as ready when ENG_OPS_TOKEN has only read:org and you are in its team', () => {
    const results = checkOpsAccess(gh(READ_ORG, TEAMS), true, products);
    expect(results.map((r) => [r.name, r.ok, r.detail])).toEqual([
      ['ops creatrgrid', true, 'in the creatrgrid team'],
      ['ops ads', true, 'in the adoptdontshop team'],
    ]);
    expect(results.every((r) => !r.required)).toBe(true);
  });

  it('names the team to join for a product you cannot reach, matching the org in any case', () => {
    const [creatrgrid, ads] = checkOpsAccess(gh(READ_ORG, 'IDEASQUARED/creatrgrid\nsomeone-else/adoptdontshop\n'), true, products);
    expect(creatrgrid?.ok).toBe(true);
    expect(ads).toMatchObject({ ok: false, detail: 'not in the adoptdontshop team' });
    expect(ads?.fix).toContain('https://github.com/orgs/ideaSquared/teams/adoptdontshop');
  });

  it('says to set ENG_OPS_TOKEN, with the token link, when it is unset and the gh token can do more', () => {
    const results = checkOpsAccess(gh('X-Oauth-Scopes: repo, read:org\n', TEAMS), false, products);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'ops token', ok: false, required: false });
    expect(results[0]?.detail).toContain('ENG_OPS_TOKEN is not set');
    expect(results[0]?.detail).toContain('repo');
    expect(results[0]?.fix).toContain(OPS_TOKEN_URL);
    expect(results[0]?.fix).toContain('ENG_OPS_TOKEN');
  });

  it('names the extra scopes when ENG_OPS_TOKEN can do more than read teams', () => {
    const [result] = checkOpsAccess(gh('X-Oauth-Scopes: gist, read:org, user\n', TEAMS), true, products);
    expect(result).toMatchObject({ name: 'ops token', ok: false });
    expect(result?.detail).toBe('ENG_OPS_TOKEN can do more than read teams (gist, user)');
    expect(result?.fix).toContain(OPS_TOKEN_URL);
  });

  it('says ENG_OPS_TOKEN needs read:org when it has no scopes', () => {
    const [result] = checkOpsAccess(gh('X-Oauth-Scopes: \n', TEAMS), true, products);
    expect(result).toMatchObject({ name: 'ops token', ok: false, detail: 'ENG_OPS_TOKEN cannot read your GitHub teams (it needs read:org)' });
  });

  it('refuses a token whose scopes cannot be read, such as a fine-grained token', () => {
    const [result] = checkOpsAccess(gh('HTTP/2.0 200 OK\n\n{}', TEAMS), true, products);
    expect(result).toMatchObject({ name: 'ops token', ok: false, detail: 'could not read the scopes of ENG_OPS_TOKEN (use a classic token)' });
  });

  it('accepts the gh token when ENG_OPS_TOKEN is unset but the gh token has only read:org', () => {
    const results = checkOpsAccess(gh(READ_ORG, TEAMS), false, products);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('says so when the team list cannot be read', () => {
    const results = checkOpsAccess(gh(READ_ORG, undefined), true, products);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'ops access', ok: false, detail: 'could not list your GitHub teams' });
  });

  it('never puts a token value in its output', () => {
    const results = checkOpsAccess(gh('X-Oauth-Scopes: repo\n', TEAMS), false, products);
    expect(JSON.stringify(results)).not.toMatch(/gh[pousr]_/);
  });
});

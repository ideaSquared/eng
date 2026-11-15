import { OpsError } from '@ideasquared/ops';
import type { Catalog, Fetch } from '@ideasquared/ops';
import { describe, expect, it } from 'vitest';
import {
  confirmationFor,
  defaultEnvironment,
  deployedProducts,
  describeError,
  formatCatalog,
  formatHeader,
  formatProducts,
  formatResult,
  isConfirmed,
  OPS_PRODUCTS,
  plain,
  resolveUrl,
  routeOps,
  runOps,
  type OpsDeps,
} from '../src/ops.ts';

const creatrgrid = OPS_PRODUCTS[0]!;
const pairflix = OPS_PRODUCTS[1]!;

describe('the product registry', () => {
  it('knows creatrgrid in both environments', () => {
    expect(resolveUrl(creatrgrid, 'staging', {})).toBe('https://api-staging.creatrgrid.com/api/v1/ops');
    expect(resolveUrl(creatrgrid, 'production', {})).toBe('https://api.creatrgrid.com/api/v1/ops');
  });

  it('has no URL for pairflix until an env var gives one', () => {
    expect(resolveUrl(pairflix, 'staging', {})).toBeUndefined();
    expect(resolveUrl(pairflix, 'staging', { ENG_OPS_URL_PAIRFLIX_STAGING: 'http://localhost:8787/ops' })).toBe('http://localhost:8787/ops');
    expect(resolveUrl(pairflix, 'production', { ENG_OPS_URL_PAIRFLIX_STAGING: 'http://localhost:8787/ops' })).toBeUndefined();
  });

  it('lets an env var override a registered URL, and ignores a blank one', () => {
    expect(resolveUrl(creatrgrid, 'staging', { ENG_OPS_URL_CREATRGRID_STAGING: 'http://127.0.0.1:9' })).toBe('http://127.0.0.1:9');
    expect(resolveUrl(creatrgrid, 'staging', { ENG_OPS_URL_CREATRGRID_STAGING: '  ' })).toBe('https://api-staging.creatrgrid.com/api/v1/ops');
  });

  it('lists only products with a URL as deployed, and says pairflix is not deployed yet', () => {
    expect(deployedProducts({}).map((p) => p.name)).toEqual(['creatrgrid']);
    expect(deployedProducts({ ENG_OPS_URL_PAIRFLIX_STAGING: 'http://x' }).map((p) => p.name)).toEqual(['creatrgrid', 'pairflix']);
    const text = formatProducts({}).join('\n');
    expect(text).toContain('not deployed yet');
    expect(text).toContain('adopt-dont-shop keeps its own `pnpm ops`');
  });
});

describe('the default environment', () => {
  it('is ENG_ENV when valid, else staging', () => {
    expect(defaultEnvironment({ ENG_ENV: 'production' })).toBe('production');
    expect(defaultEnvironment({ ENG_ENV: 'staging' })).toBe('staging');
    expect(defaultEnvironment({ ENG_ENV: 'prod' })).toBe('staging');
    expect(defaultEnvironment({})).toBe('staging');
  });

  it('refuses --env naming the other environment inside a fixed session', () => {
    const refused = routeOps(['creatrgrid', '--env', 'production'], 'staging', 'staging');
    expect(refused.kind).toBe('error');
    expect(refused.kind === 'error' && refused.message).toContain('fixed to staging');
    expect(routeOps(['creatrgrid', '--env=staging'], 'production', 'production').kind).toBe('error');
    expect(routeOps(['creatrgrid', '--env', 'staging'], 'staging', 'staging').kind).toBe('catalog');
  });

  it('allows --env outside a session', () => {
    expect(routeOps(['creatrgrid', '--env', 'production'])).toMatchObject({ kind: 'catalog', environment: 'production' });
  });

  it('treats --help and -h as the product list with usage', () => {
    expect(routeOps(['--help']).kind).toBe('products');
    expect(routeOps(['-h']).kind).toBe('products');
  });

  it('is overridden by --env', () => {
    expect(routeOps(['creatrgrid'], 'production')).toMatchObject({ environment: 'production' });
    expect(routeOps(['creatrgrid', '--env', 'staging'], 'production')).toMatchObject({ environment: 'staging' });
  });
});

describe('argv routing', () => {
  it('lists products with no words', () => {
    expect(routeOps([])).toEqual({ kind: 'products' });
  });

  it('browses a product, staging by default', () => {
    expect(routeOps(['creatrgrid'])).toEqual({ kind: 'catalog', product: 'creatrgrid', environment: 'staging', jsonOutput: false });
    expect(routeOps(['creatrgrid', '--env=production'])).toMatchObject({ kind: 'catalog', environment: 'production' });
  });

  it('accepts group name and group.name alike', () => {
    const spaced = routeOps(['creatrgrid', 'accounts', 'resync', 'acct_1']);
    const dotted = routeOps(['creatrgrid', 'accounts.resync', 'acct_1']);
    expect(spaced).toEqual(dotted);
    expect(spaced).toMatchObject({ kind: 'command', commandId: 'accounts.resync', args: ['acct_1'], yes: false });
  });

  it('extracts --env, --yes and --json-output wherever they stand, leaving the command args', () => {
    expect(routeOps(['creatrgrid', '--yes', 'accounts', 'resync', '--env', 'production', '--limit', '5', '--json-output'])).toEqual({
      kind: 'command',
      product: 'creatrgrid',
      environment: 'production',
      commandId: 'accounts.resync',
      args: ['--limit', '5'],
      yes: true,
      jsonOutput: true,
    });
  });

  it('leaves everything after -- to the command', () => {
    expect(routeOps(['creatrgrid', 'a.b', '--', '--yes'])).toMatchObject({ args: ['--', '--yes'], yes: false });
  });

  it('rejects a bad environment, a missing --env value and a missing command name', () => {
    expect(routeOps(['creatrgrid', '--env', 'prod'])).toMatchObject({ kind: 'error' });
    expect(routeOps(['creatrgrid', '--env'])).toMatchObject({ kind: 'error' });
    expect(routeOps(['creatrgrid', 'accounts'])).toMatchObject({ kind: 'error' });
  });
});

describe('confirmation', () => {
  it('asks y/N on staging, and --yes skips it', () => {
    const rule = confirmationFor('staging', 'creatrgrid', 'accounts.resync', false);
    expect(rule).toMatchObject({ kind: 'yesno', prompt: 'Run accounts.resync on creatrgrid staging? [y/N] ' });
    expect(confirmationFor('staging', 'creatrgrid', 'accounts.resync', true)).toBeUndefined();
  });

  it('accepts only y or yes on staging', () => {
    const rule = confirmationFor('staging', 'creatrgrid', 'a.b', false)!;
    expect(['y', 'Y', 'yes'].map((a) => isConfirmed(rule, a))).toEqual([true, true, true]);
    expect(['', 'n', 'no', 'maybe'].map((a) => isConfirmed(rule, a))).toEqual([false, false, false, false]);
    expect(isConfirmed(rule, undefined)).toBe(false);
  });

  it('always needs the product name typed on production, even with --yes', () => {
    const rule = confirmationFor('production', 'creatrgrid', 'accounts.resync', true)!;
    expect(rule).toMatchObject({ kind: 'typed', expected: 'creatrgrid' });
    expect(isConfirmed(rule, 'y')).toBe(false);
    expect(isConfirmed(rule, 'yes')).toBe(false);
    expect(isConfirmed(rule, 'creatrgrid')).toBe(true);
  });
});

describe('output', () => {
  it('prints key: value lines, nested records indented, arrays of records as a table', () => {
    const lines = formatResult({ accountId: 'acct_1', queued: 3, ok: true, none: null, tags: ['a', 'b'], rows: [{ id: 'x', n: 1 }, { id: 'yy', n: 22 }], meta: { by: 'me' } });
    expect(lines).toEqual([
      'accountId: acct_1',
      'queued: 3',
      'ok: true',
      'none: -',
      'tags: a, b',
      'rows:',
      '  id  n',
      '  x   1',
      '  yy  22',
      'meta:',
      '  by: me',
    ]);
  });

  it('prints a top-level array of records as a table and a scalar as itself', () => {
    expect(formatResult([{ id: 'a' }])).toEqual(['id', 'a']);
    expect(formatResult([])).toEqual(['(none)']);
    expect(formatResult(5)).toEqual(['5']);
  });

  it('groups the catalog, with kind and summary', () => {
    const lines = formatCatalog(CATALOG).join('\n');
    expect(lines).toMatch(/accounts\n\s+accounts\.list\s+read\s+List accounts/);
    expect(lines).toMatch(/accounts\.resync\s+write\s+Re-import posts/);
  });

  it('puts the environment in the header, production in red from the palette', () => {
    expect(formatHeader('creatrgrid', 'staging', 'accounts.list')).toBe('ops creatrgrid · staging · accounts.list');
    const red = formatHeader('creatrgrid', 'production', undefined, (role, text) => `<${role}>${text}</${role}>`);
    expect(red).toContain('<danger>production</danger>');
  });
});

describe('error messages', () => {
  const url = 'http://x';
  it('maps each code to one clear line', () => {
    expect(describeError(new OpsError('forbidden', 'm'), creatrgrid, url)).toBe('You need write access to ideaSquared/creatrgrid on GitHub');
    expect(describeError(new OpsError('unauthenticated', 'm'), creatrgrid, url)).toContain('gh auth login');
    expect(describeError(new OpsError('not_found', 'm'), creatrgrid, url)).toContain('eng ops creatrgrid');
    expect(describeError(new OpsError('invalid_argument', "field 'x' is required"), creatrgrid, url)).toBe("Invalid arguments: field 'x' is required");
    expect(describeError(new OpsError('internal', 'internal error'), creatrgrid, url)).toContain('internal error');
  });

  it('names the URL when the network fails', () => {
    expect(describeError(new TypeError('fetch failed'), creatrgrid, url)).toBe('Could not reach http://x: fetch failed');
  });
});

const CATALOG: Catalog = {
  version: 1,
  product: 'creatrgrid',
  environment: 'staging',
  commands: [
    { id: 'accounts.list', group: 'accounts', name: 'list', summary: 'List accounts', kind: 'read', fields: [], dryRun: false },
    {
      id: 'accounts.resync',
      group: 'accounts',
      name: 'resync',
      summary: 'Re-import posts',
      kind: 'write',
      dryRun: true,
      fields: [{ name: 'accountId', type: 'id', required: true, positional: true, description: 'The account' }],
    },
    { id: 'cache.purge', group: 'cache', name: 'purge', summary: 'Purge the cache', kind: 'write', dryRun: false, fields: [] },
  ],
};

type Harness = { deps: OpsDeps; out: string[]; err: string[]; asked: string[]; calls: Array<{ path: string; auth: string | null; body?: unknown }> };

const harness = (answers: Array<string | undefined>, options: { token?: string | undefined; env?: Record<string, string>; interactive?: boolean; failWith?: Response } = {}): Harness => {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const calls: Harness['calls'] = [];
  const queue = [...answers];
  const fetch: Fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path, auth: headers.get('authorization'), body });
    if (options.failWith) return options.failWith;
    if (path.endsWith('/catalog')) return Response.json(CATALOG);
    const request = body as { command: string; args: Record<string, unknown>; mode: string };
    const mode = request.command === 'accounts.list' ? 'run' : request.mode;
    return Response.json({ command: request.command, mode, result: { accountId: request.args.accountId ?? null, did: mode }, summary: `${mode} done` });
  };
  const deps: OpsDeps = {
    env: options.env ?? { ENG_OPS_URL_CREATRGRID_STAGING: 'http://ops.test/ops', ENG_OPS_URL_CREATRGRID_PRODUCTION: 'http://ops.test/prod' },
    fetch,
    getToken: () => ('token' in options ? options.token : 'secret-token'),
    ask: async (prompt) => {
      asked.push(prompt);
      return queue.shift();
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    interactive: options.interactive ?? false,
    paint: plain,
  };
  return { deps, out, err, asked, calls };
};

const runCalls = (h: Harness) => h.calls.filter((c) => c.path.endsWith('/invoke')).map((c) => (c.body as { mode: string }).mode);

describe('running ops commands end to end, with the real client', () => {
  it('lists commands for a product', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    expect(h.out.join('\n')).toContain('ops creatrgrid · staging');
    expect(h.out.join('\n')).toContain('accounts.resync');
    expect(h.calls[0]).toMatchObject({ path: '/ops/catalog', auth: 'Bearer secret-token' });
  });

  it('runs a read straight away, summary first', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid', 'accounts', 'list'], h.deps)).toBe(0);
    expect(runCalls(h)).toEqual(['run']);
    expect(h.asked).toEqual([]);
    expect(h.out[0]).toBe('ops creatrgrid · staging · accounts.list');
    expect(h.out[1]).toMatch(/^run done\naccountId: -/);
  });

  it('previews a write, asks, then runs on y', async () => {
    const h = harness(['y']);
    expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1'], h.deps)).toBe(0);
    expect(runCalls(h)).toEqual(['preview', 'run']);
    expect(h.asked).toEqual(['Run accounts.resync on creatrgrid staging? [y/N] ']);
    expect(h.out.join('\n')).toContain('Preview (nothing has changed yet):');
    expect(h.out.join('\n')).toContain('preview done');
    expect(h.out.join('\n')).toContain('accountId: acct_1');
  });

  it('aborts without running on n, or when input closes', async () => {
    for (const answer of ['n', '', undefined]) {
      const h = harness([answer]);
      expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1'], h.deps)).toBe(1);
      expect(runCalls(h)).toEqual(['preview']);
      expect(h.out.join('\n')).toContain('Aborted');
    }
  });

  it('skips the staging question with --yes but still previews', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1', '--yes'], h.deps)).toBe(0);
    expect(h.asked).toEqual([]);
    expect(runCalls(h)).toEqual(['preview', 'run']);
  });

  it('says there is no preview for a write without dryRun, then confirms', async () => {
    const h = harness(['y']);
    expect(await runOps(['creatrgrid', 'cache', 'purge'], h.deps)).toBe(0);
    expect(h.out.join('\n')).toContain('No preview available for cache.purge.');
    expect(runCalls(h)).toEqual(['run']);
  });

  it('needs the product typed on production, and --yes does not skip it', async () => {
    const wrong = harness(['yes']);
    expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1', '--env', 'production', '--yes'], wrong.deps)).toBe(1);
    expect(runCalls(wrong)).toEqual(['preview']);
    expect(wrong.asked).toEqual(['Type creatrgrid to continue: ']);
    expect(wrong.out.join('\n')).toContain('ops creatrgrid · production');
    expect(wrong.out.join('\n')).toContain('PRODUCTION');

    const right = harness(['creatrgrid']);
    expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1', '--env', 'production', '--yes'], right.deps)).toBe(0);
    expect(runCalls(right)).toEqual(['preview', 'run']);
    expect(right.calls[0]?.path).toBe('/prod/catalog');
  });

  it('uses ENG_ENV as the environment when --env is absent', async () => {
    const h = harness(['creatrgrid'], { env: { ENG_ENV: 'production', ENG_OPS_URL_CREATRGRID_PRODUCTION: 'http://ops.test/prod' } });
    expect(await runOps(['creatrgrid', 'accounts.resync', 'acct_1'], h.deps)).toBe(0);
    expect(h.asked).toEqual(['Type creatrgrid to continue: ']);
  });

  it('prints only the raw result as JSON with --json-output, human lines to stderr', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid', 'accounts', 'list', '--json-output'], h.deps)).toBe(0);
    expect(JSON.parse(h.out.join('\n'))).toEqual({ accountId: null, did: 'run' });
    expect(h.err.join('\n')).toContain('ops creatrgrid · staging');
  });

  it('rejects bad arguments before any invoke', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid', 'accounts.resync'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toBe("Invalid arguments: field 'accountId' is required");
    expect(runCalls(h)).toEqual([]);
  });

  it('reports an unknown command and a product with no URL', async () => {
    const h = harness([]);
    expect(await runOps(['creatrgrid', 'nope.nope'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain("no command 'nope.nope'");
    const none = harness([]);
    expect(await runOps(['pairflix'], none.deps)).toBe(1);
    expect(none.err.join('\n')).toContain('ENG_OPS_URL_PAIRFLIX_STAGING');
    expect(none.calls).toEqual([]);
  });

  it('tells you to sign in when gh has no token, without calling anything', async () => {
    const h = harness([], { token: undefined });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain('gh auth login');
    expect(h.calls).toEqual([]);
  });

  it('maps a server error to one line and never prints the token', async () => {
    const h = harness([], { failWith: Response.json({ error: { code: 'forbidden', message: 'no' } }, { status: 403 }) });
    expect(await runOps(['creatrgrid', 'accounts.list'], h.deps)).toBe(1);
    expect(h.err).toEqual(['You need write access to ideaSquared/creatrgrid on GitHub']);
    expect([...h.out, ...h.err].join('\n')).not.toContain('secret-token');
  });

  it('picks a command interactively, asks each field, then previews and runs', async () => {
    const h = harness(['2', '', 'acct_9', 'y'], { interactive: true });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    expect(h.asked[0]).toBe('Pick a command by number or id (enter to quit): ');
    expect(h.asked[1]).toMatch(/^accountId .*required.*The account: $/);
    expect(runCalls(h)).toEqual(['preview', 'run']);
    expect(h.out.join('\n')).toContain('accountId: acct_9');
  });

  it('quits the picker on a blank answer without running anything', async () => {
    const h = harness([''], { interactive: true });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    expect(runCalls(h)).toEqual([]);
  });
});

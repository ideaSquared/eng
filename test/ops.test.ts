import type { Fetch } from '../src/vendor/ops/client.ts';
import { OpsError } from '../src/vendor/ops/contract.ts';
import type { Catalog, Command } from '../src/vendor/ops/contract.ts';
import { describe, expect, it } from 'vitest';
import {
  confirmationFor,
  defaultEnvironment,
  deployedProducts,
  commandMatches,
  describeError,
  filterCommands,
  findCommands,
  formatCatalog,
  formatFind,
  formatHeader,
  formatProducts,
  formatResult,
  isConfirmed,
  OPS_PRODUCTS,
  plain,
  resolveUrl,
  routeOps,
  runLine,
  runOps,
  searchWords,
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
    expect(h.asked[0]).toBe('Pick a command by number or id, or type words to filter (enter to quit): ');
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

describe('matching commands', () => {
  const [list, resync, purge] = CATALOG.commands as [Command, Command, Command];

  it('needs every word, in any case', () => {
    expect(filterCommands(CATALOG.commands, searchWords('RESYNC'))).toEqual([resync]);
    expect(filterCommands(CATALOG.commands, searchWords('accounts list'))).toEqual([list]);
    expect(filterCommands(CATALOG.commands, searchWords('accounts purge'))).toEqual([]);
    expect(filterCommands(CATALOG.commands, [])).toEqual(CATALOG.commands);
  });

  it('matches id, group, name, summary, field names and field descriptions', () => {
    expect(commandMatches(purge, ['cache'])).toBe(true);
    expect(commandMatches(purge, ['cache the'])).toBe(false);
    expect(commandMatches(resync, ['re-import'])).toBe(true);
    expect(commandMatches(resync, ['accountid'])).toBe(true);
    expect(commandMatches(resync, ['the', 'account'])).toBe(true);
    expect(commandMatches(list, ['accountid'])).toBe(false);
  });

  it('keeps catalog order when filtering', () => {
    expect(filterCommands(CATALOG.commands, ['a']).map((c) => c.id)).toEqual(['accounts.list', 'accounts.resync', 'cache.purge']);
  });
});

describe('the run line', () => {
  const field = (name: string, extra: Partial<Command['fields'][number]> = {}) => ({ name, type: 'string' as const, required: false, description: '', ...extra });
  const command = (fields: Command['fields']): Command => ({ id: 'creator.lookup', group: 'creator', name: 'lookup', summary: '', kind: 'read', dryRun: false, fields });

  it('shows positional fields as <name> and nothing else when there are none', () => {
    expect(runLine('creatrgrid', command([field('q', { positional: true, required: true })]), 'staging')).toBe('eng ops creatrgrid creator lookup <q> --env staging');
    expect(runLine('creatrgrid', command([]), 'production')).toBe('eng ops creatrgrid creator lookup --env production');
  });

  it('shows optional positionals as [name], required options as --name=<name>, and omits optional options', () => {
    const fields = [field('limit', { type: 'number' }), field('kind', { required: true, type: 'enum', values: ['a'] }), field('page', { positional: true })];
    expect(runLine('creatrgrid', command(fields), 'staging')).toBe('eng ops creatrgrid creator lookup [page] --kind=<kind> --env staging');
  });
});

describe('finding commands across products', () => {
  const cmd = (id: string, summary: string): Command => {
    const [group = '', name = ''] = id.split('.');
    return { id, group, name, summary, kind: 'read', dryRun: false, fields: [] };
  };

  it('orders by product, then command id, and drops products with no match', () => {
    const found = findCommands(
      [
        { product: 'pairflix', commands: [cmd('sync.run', 'Sync now'), cmd('app.sync', 'Sync app')] },
        { product: 'creatrgrid', commands: [cmd('z.sync', 'Sync z'), cmd('a.sync', 'Sync a')] },
        { product: 'other', commands: [cmd('x.y', 'nothing')] },
      ],
      ['sync'],
    );
    expect(found.map((m) => [m.product, m.commands.map((c) => c.id)])).toEqual([
      ['creatrgrid', ['a.sync', 'z.sync']],
      ['pairflix', ['app.sync', 'sync.run']],
    ]);
  });

  it('prints id, read or write, summary and the line to run', () => {
    const text = formatFind(findCommands([{ product: 'creatrgrid', commands: CATALOG.commands }], ['resync']), 'staging').join('\n');
    expect(text).toContain('creatrgrid');
    expect(text).toContain('accounts.resync  write  Re-import posts');
    expect(text).toContain('eng ops creatrgrid accounts resync <accountId> --env staging');
  });

  it('puts the searched environment on every run line, so a production result runs in production', () => {
    const text = formatFind(findCommands([{ product: 'creatrgrid', commands: CATALOG.commands }], ['resync']), 'production').join('\n');
    expect(text).toContain('eng ops creatrgrid accounts resync <accountId> --env production');
    expect(text).not.toContain('--env staging');
  });
});

describe('eng ops find', () => {
  const PAIRFLIX: Catalog = {
    version: 1,
    product: 'pairflix',
    environment: 'staging',
    commands: [{ id: 'households.resync', group: 'households', name: 'resync', summary: 'Resync a household', kind: 'write', dryRun: false, fields: [] }],
  };
  const env = {
    ENG_OPS_URL_CREATRGRID_STAGING: 'http://ops.test/creatrgrid',
    ENG_OPS_URL_PAIRFLIX_STAGING: 'http://ops.test/pairflix',
    ENG_OPS_URL_CREATRGRID_PRODUCTION: 'http://ops.test/prod',
  };

  it('routes find with words, and refuses it with none', () => {
    expect(routeOps(['find', 'sync', 'x'])).toEqual({ kind: 'find', environment: 'staging', words: ['sync', 'x'] });
    expect(routeOps(['find']).kind).toBe('error');
  });

  it('keeps the session lock for find', () => {
    expect(routeOps(['find', 'sync', '--env', 'production'], 'staging', 'staging').kind).toBe('error');
    expect(routeOps(['find', 'sync', '--env', 'staging'], 'staging', 'staging').kind).toBe('find');
  });

  it('searches every product with a URL in the session environment and prints matches by product', async () => {
    const h = harness([], { env });
    const base = h.deps.fetch;
    const urls: string[] = [];
    h.deps.fetch = async (input, init) => {
      urls.push(String(input));
      return String(input).includes('/pairflix/') ? Response.json(PAIRFLIX) : base!(input, init);
    };
    expect(await runOps(['find', 'RESYNC'], h.deps)).toBe(0);
    expect(urls.sort()).toEqual(['http://ops.test/creatrgrid/catalog', 'http://ops.test/pairflix/catalog']);
    const text = h.out.join('\n');
    expect(text.indexOf('creatrgrid')).toBeLessThan(text.indexOf('pairflix'));
    expect(text).toContain('eng ops creatrgrid accounts resync <accountId>');
    expect(text).toContain('eng ops pairflix households resync');
    expect(text).not.toContain('cache.purge');
    expect(JSON.stringify([h.out, h.err])).not.toContain('secret-token');
  });

  it('prints one muted line for a product that fails and still lists the others', async () => {
    const h = harness([], { env });
    const base = h.deps.fetch;
    h.deps.fetch = async (input, init) =>
      String(input).includes('/pairflix/') ? Response.json({ error: { code: 'forbidden', message: 'no' } }, { status: 403 }) : base!(input, init);
    expect(await runOps(['find', 'resync'], h.deps)).toBe(0);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain('pairflix');
    expect(h.out.join('\n')).toContain('accounts.resync');
  });

  it('says so and exits 0 when nothing matches', async () => {
    const h = harness([], { env });
    expect(await runOps(['find', 'nonexistent'], h.deps)).toBe(0);
    expect(h.out.join('\n')).toContain("No commands match 'nonexistent'");
  });

  it('exits 1 when no product could be searched', async () => {
    const h = harness([], { env, failWith: Response.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 }) });
    expect(await runOps(['find', 'x'], h.deps)).toBe(1);
  });

  it('exits 1 when gh is not signed in, without fetching', async () => {
    const h = harness([], { env, token: undefined });
    expect(await runOps(['find', 'x'], h.deps)).toBe(1);
    expect(h.calls).toEqual([]);
  });
});

describe('the picker filter', () => {
  it('filters by text, keeps whole-list numbers, and picks by number', async () => {
    const h = harness(['resync', '2', 'acct_9', 'y'], { interactive: true });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    const frames = h.out.join('\n');
    expect(frames.match(/accounts\.list/g)).toHaveLength(1);
    expect(frames).toContain('2. accounts.resync');
    expect(h.asked[1]).toContain('enter to show all');
    expect(runCalls(h)).toEqual(['preview', 'run']);
  });

  it('re-prompts on no match, and shows the whole list again on empty input after a filter', async () => {
    const h = harness(['zzz', 'cache', '', undefined], { interactive: true });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    const text = h.out.join('\n');
    expect(text).toContain("No command matches 'zzz'.");
    expect(h.asked).toHaveLength(4);
    expect(text.match(/accounts\.list/g)).toHaveLength(2);
  });

  it('still quits on empty input when the whole list is showing', async () => {
    const h = harness([''], { interactive: true });
    expect(await runOps(['creatrgrid'], h.deps)).toBe(0);
    expect(h.asked).toHaveLength(1);
  });
});

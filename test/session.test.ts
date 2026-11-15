import { describe, expect, it } from 'vitest';
import { homeMenu, isMenu, type Action, type Item, type Menu } from '../src/menu.ts';
import { envStyle, isProductionConfirmed, productionWarning, resolveEnvironment } from '../src/session.ts';
import { PALETTE } from '../src/theme.ts';

describe('startup flags', () => {
  it('defaults to staging', () => {
    expect(resolveEnvironment({})).toEqual({ ok: true, env: 'staging' });
  });

  it.each([
    [{ production: true }, 'production'],
    [{ env: 'production' }, 'production'],
    [{ env: 'staging' }, 'staging'],
    [{ production: true, env: 'production' }, 'production'],
  ] as const)('%j resolves to %s', (flags, env) => {
    expect(resolveEnvironment(flags)).toEqual({ ok: true, env });
  });

  it.each(['prod', 'qa', '', 'Production'])('rejects --env %j', (env) => {
    const result = resolveEnvironment({ env });
    expect(result.ok).toBe(false);
  });

  it('rejects contradictory flags', () => {
    expect(resolveEnvironment({ production: true, env: 'staging' }).ok).toBe(false);
  });
});

describe('the production confirmation', () => {
  it('continues only on the exact word production', () => {
    expect(isProductionConfirmed('production')).toBe(true);
    expect(isProductionConfirmed('production\n')).toBe(true);
  });

  it.each(['', 'yes', 'y', 'Production', 'PRODUCTION', 'prod', 'production now', 'staging'])('exits on %j', (answer) => {
    expect(isProductionConfirmed(answer)).toBe(false);
  });
});

describe('the production warning', () => {
  // eslint-disable-next-line no-control-regex
  const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');
  const render = (width: number) => productionWarning(width).split('\n').map(plain);

  it('renders exactly this at 120 columns, every row 120 wide', () => {
    const rows = render(120);
    expect(rows.every((r) => r.length === 120)).toBe(true);
    expect(rows.map((r) => r.trim())).toEqual([
      '',
      'PRODUCTION',
      '',
      'Commands in this session affect real users and real data.',
      '',
    ]);
  });

  it('renders exactly this at 40 columns, wrapping between words only', () => {
    const rows = render(40);
    expect(rows.every((r) => r.length === 40)).toBe(true);
    expect(rows.map((r) => r.trim())).toEqual([
      '',
      'PRODUCTION',
      '',
      'Commands in this session affect real',
      'users and real data.',
      '',
    ]);
  });

  it('keeps PRODUCTION whole even on a tiny or unknown width', () => {
    for (const width of [0, 12, 20]) expect(render(width)[1]?.trim()).toBe('PRODUCTION');
  });

  it('is drawn on the danger background', () => {
    expect(productionWarning(80).split('\n').every((l) => l.includes('48;2;248;113;113'))).toBe(true);
  });
});

describe('environment styling', () => {
  it('uses the danger colour and PRODUCTION badge in production, the accent and staging badge otherwise', () => {
    expect(envStyle('production')).toEqual({ color: PALETTE.danger, badge: 'PRODUCTION' });
    expect(envStyle('staging')).toEqual({ color: PALETTE.accent, badge: 'staging' });
  });
});

const child = (menu: Menu, label: string): Item => {
  const item = menu.items.find((i) => i.label === label);
  if (!item) throw new Error(`no ${label}`);
  return item;
};
const action = (menu: Menu, ...path: string[]): Action => {
  const next = path.reduce<Menu | Action>((m, label) => (isMenu(m) ? child(m, label).next : m), menu);
  if (isMenu(next)) throw new Error('not an action');
  return next;
};

describe.each(['staging', 'production'] as const)('the %s menu', (env) => {
  const menu = homeMenu(env);

  it('deploys to the session environment straight after the product', () => {
    expect(action(menu, 'Deploy', 'ads')).toEqual({ kind: 'run', command: 'ship', args: ['deploy', 'ads', env] });
  });

  it('redeploys to the session environment', () => {
    expect(action(menu, 'Redeploy', 'gaminginit')).toEqual({
      kind: 'run',
      command: 'ship',
      args: ['deploy', 'gaminginit', env, '--redeploy'],
    });
  });

  it('reads logs for the session environment', () => {
    expect(action(menu, 'Logs', 'pairflix')).toEqual({ kind: 'run', command: 'idea', args: ['logs', 'pairflix', '--env', env] });
  });

  it('never adds --yes', () => {
    const args = [action(menu, 'Deploy', 'ads'), action(menu, 'Redeploy', 'ads')].flatMap((a) => (a.kind === 'run' ? a.args : []));
    expect(args).not.toContain('--yes');
  });
});

import { describe, expect, it } from 'vitest';
import { complete, COMMAND_WORDS, prompt, route, type ShellState } from '../src/shell.ts';

const staging: ShellState = { env: 'staging' };
const production: ShellState = { env: 'production' };
const run = (command: 'eng' | 'ship' | 'idea', ...args: string[]) => ({ kind: 'run', command, args });

describe('routing a typed line', () => {
  it.each([
    ['deploy ads staging', run('ship', 'deploy', 'ads', 'staging')],
    ['redeploy ads staging', run('ship', 'deploy', 'ads', 'staging', '--redeploy')],
    ['rollback ads staging', run('ship', 'rollback', 'ads', 'staging')],
    ['status', run('ship', 'status')],
    ['logs ads', run('idea', 'logs', 'ads', '--env', 'staging')],
    ['runs ads', run('idea', 'runs', 'ads', '--failed')],
    ['doctor', run('eng', 'doctor')],
    ['update', run('eng', 'update')],
    ['theme', run('eng', 'theme')],
  ])('%s', (line, expected) => {
    expect(route(line, staging)).toEqual(expected);
  });

  it('uses the current environment when none is named', () => {
    expect(route('deploy ads', production)).toEqual(run('ship', 'deploy', 'ads', 'production'));
    expect(route('redeploy ads', production)).toEqual(run('ship', 'deploy', 'ads', 'production', '--redeploy'));
    expect(route('rollback ads', production)).toEqual(run('ship', 'rollback', 'ads', 'production'));
    expect(route('logs ads', production)).toEqual(run('idea', 'logs', 'ads', '--env', 'production'));
  });

  it('accepts a named environment that matches the session', () => {
    expect(route('deploy ads production', production)).toEqual(run('ship', 'deploy', 'ads', 'production'));
    expect(route('logs ads staging', staging)).toEqual(run('idea', 'logs', 'ads', '--env', 'staging'));
  });

  it.each([
    ['deploy ads staging', production],
    ['redeploy ads staging', production],
    ['rollback ads staging', production],
    ['logs ads staging', production],
    ['deploy ads production', staging],
    ['redeploy ads production', staging],
    ['rollback ads production', staging],
    ['logs ads production', staging],
  ])('refuses %s in a mismatched session instead of overriding', (line, state) => {
    const outcome = route(line, state);
    expect(outcome.kind).toBe('message');
    expect(outcome.kind === 'message' && outcome.text).toContain(`fixed to ${state.env}`);
  });

  it('passes the rest of an ops line through without assuming its shape', () => {
    expect(route('ops', staging)).toEqual(run('eng', 'ops'));
    expect(route('ops ads migrate --dry-run', staging)).toEqual(run('eng', 'ops', 'ads', 'migrate', '--dry-run'));
  });

  it('passes explicit ship and idea commands through unchanged', () => {
    expect(route('ship deploy ads staging --redeploy', staging)).toEqual(run('ship', 'deploy', 'ads', 'staging', '--redeploy'));
    expect(route('idea logs ads --env production', production)).toEqual(run('idea', 'logs', 'ads', '--env', 'production'));
  });

  it('ignores extra whitespace and letter case in the command word', () => {
    expect(route('  DEPLOY   ads   staging  ', staging)).toEqual(run('ship', 'deploy', 'ads', 'staging'));
  });

  it('does nothing on a blank line', () => {
    expect(route('   ', staging)).toEqual({ kind: 'empty' });
  });

  it('never adds --yes, even to production', () => {
    const lines = ['deploy ads production', 'redeploy ads production', 'rollback ads production', 'status', 'logs ads'];
    for (const line of lines) {
      const outcome = route(line, production);
      expect(outcome.kind === 'run' && outcome.args).not.toContain('--yes');
    }
  });
});

describe('incomplete or odd lines run nothing', () => {
  it.each([
    'deploy',
    'redeploy',
    'rollback',
    'logs',
    'runs',
    'deploy ads qa',
    'deploy ads staging extra',
    'logs ads qa',
    'runs ads extra',
    'status now',
    'doctor now',
  ])('%s gives a usage message', (line) => {
    const outcome = route(line, staging);
    expect(outcome.kind).toBe('message');
    expect(outcome.kind === 'message' && outcome.text).toMatch(/^usage: /);
  });

  it('treats shell metacharacters as plain words, so a chained command is refused', () => {
    expect(route('deploy ads; rm -rf /', staging).kind).toBe('message');
  });
});

describe('unknown words', () => {
  it('print a short hint and run nothing', () => {
    const outcome = route('frobnicate ads', staging);
    expect(outcome).toEqual({ kind: 'message', text: 'unknown command: frobnicate. Try help.' });
  });

  it('does not treat setup or shell as shell commands', () => {
    expect(route('setup', staging).kind).toBe('message');
    expect(route('shell', staging).kind).toBe('message');
  });
});

describe('ship and idea passthrough', () => {
  it.each([
    ['ship deploy ads staging', production],
    ['ship deploy ads staging --redeploy', production],
    ['ship rollback ads staging', production],
    ['idea logs ads --env staging', production],
    ['idea logs ads --env=staging', production],
    ['idea errors ads --env staging', production],
    ['ship deploy ads production', staging],
    ['ship rollback ads production', staging],
    ['idea logs ads --env production', staging],
    ['idea logs ads --env=production', staging],
    ['idea errors ads --env production', staging],
  ])('refuses %s in a mismatched session', (line, state) => {
    const outcome = route(line, state);
    expect(outcome.kind).toBe('message');
    expect(outcome.kind === 'message' && outcome.text).toContain(`Refused: this session is fixed to ${state.env}`);
  });

  it.each([
    ['ship deploy ads production', production, run('ship', 'deploy', 'ads', 'production')],
    ['ship rollback ads staging', staging, run('ship', 'rollback', 'ads', 'staging')],
    ['idea logs ads --env=production', production, run('idea', 'logs', 'ads', '--env=production')],
    ['idea errors ads --env staging', staging, run('idea', 'errors', 'ads', '--env', 'staging')],
    ['ship status', production, run('ship', 'status')],
    ['idea logs ads', staging, run('idea', 'logs', 'ads')],
  ])('still runs %s as typed', (line, state, expected) => {
    expect(route(line, state)).toEqual(expected);
  });
});

describe('environment', () => {
  it('shows the session environment with no argument', () => {
    expect(route('env', production)).toEqual({ kind: 'message', text: 'environment: production' });
    expect(route('env', staging)).toEqual({ kind: 'message', text: 'environment: staging' });
  });

  it('does not switch: env production says the session is fixed and how to restart', () => {
    const outcome = route('env production', staging);
    expect(outcome.kind).toBe('message');
    expect(outcome.kind === 'message' && outcome.text).toContain('fixed for this session (staging)');
    expect(outcome.kind === 'message' && outcome.text).toContain('eng --production');
  });

  it('does not switch away from production either', () => {
    const outcome = route('env staging', production);
    expect(outcome.kind === 'message' && outcome.text).toContain('fixed for this session (production)');
    expect(outcome.kind === 'message' && outcome.text).toContain('without --production');
  });
});

describe('help and leaving', () => {
  it('lists the commands', () => {
    const outcome = route('help', staging);
    expect(outcome.kind === 'message' && outcome.text).toContain('deploy <product> [env]');
    expect(outcome.kind === 'message' && outcome.text).toContain('eng ops');
  });

  it.each(['exit', 'quit'])('%s leaves', (line) => {
    expect(route(line, staging)).toEqual({ kind: 'exit' });
  });
});

describe('tab completion', () => {
  it('completes command words', () => {
    expect(complete('de')).toEqual([['deploy '], 'de']);
    expect(complete('r')[0]).toEqual(['redeploy ', 'rollback ', 'runs ']);
    expect(complete('')[0].map((w) => w.trim())).toEqual([...COMMAND_WORDS]);
    expect(complete('sta')[0]).toEqual(['status']);
  });

  it('completes product names after deploy, redeploy and rollback', () => {
    expect(complete('deploy ga')).toEqual([['gaminginit ', 'gaminginit-bot '], 'ga']);
    expect(complete('rollback ag')[0]).toEqual(['agent-idea ']);
    expect(complete('redeploy c')[0]).toEqual(['creatrgrid ']);
  });

  it('completes project names after logs and runs', () => {
    expect(complete('logs pa')[0]).toEqual(['pairflix ']);
    expect(complete('runs ')[0]).toContain('ads ');
  });

  it('completes environments after a product and after env', () => {
    expect(complete('deploy ads st')).toEqual([['staging'], 'st']);
    expect(complete('logs ads p')[0]).toEqual(['production']);
    expect(complete('env ')[0]).toEqual([]);
  });

  it('offers nothing further along', () => {
    expect(complete('deploy ads staging ')[0]).toEqual([]);
    expect(complete('status ')[0]).toEqual([]);
  });
});

describe('the prompt', () => {
  // eslint-disable-next-line no-control-regex
  const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

  it('shows one glyph and the current environment', () => {
    expect(plain(prompt(staging))).toBe('◆ staging › ');
    expect(plain(prompt(production))).toBe('◆ production › ');
  });

  it('draws production in the danger colour and staging in the accent', () => {
    expect(prompt(production)).toContain('248;113;113');
    expect(prompt(staging)).toContain('34;211;238');
    expect(prompt(staging)).not.toContain('248;113;113');
  });
});

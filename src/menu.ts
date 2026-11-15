import type { Environment } from './session.ts';

// What the eng app offers. Pure data: the app walks it, and the CLI runs the action it ends on.
export type Action = { kind: 'run'; command: 'eng' | 'ship' | 'idea'; args: string[] } | { kind: 'quit' };
export type Item = { label: string; hint?: string; next: Menu | Action };
export type Menu = { title: string; items: Item[] };

// Kept in step with shipper's PRODUCTS and agent-idea's projects.
export const SHIP_PRODUCTS: readonly string[] = ['ads', 'agent-idea', 'creatrgrid', 'gaminginit', 'gaminginit-bot', 'ideasquared-bot'];
export const IDEA_PROJECTS: readonly string[] = ['ads', 'creatrgrid', 'gaminginit', 'gaminginit-bot', 'ideasquared-bot', 'pairflix'];

const run = (command: 'eng' | 'ship' | 'idea', args: string[]): Action => ({ kind: 'run', command, args });

const pick = (title: string, names: readonly string[], next: (name: string) => Menu | Action): Menu => ({
  title,
  items: names.map((name) => ({ label: name, next: next(name) })),
});

// A redeploy ships the same commit again even when it is already live (ship deploy --redeploy). The environment is
// the session's, so there is no environment step; ship itself still asks for the product name in production.
const deployTo = (env: Environment, verb: 'Deploy' | 'Redeploy') => (product: string): Action =>
  run('ship', ['deploy', product, env, ...(verb === 'Redeploy' ? ['--redeploy'] : [])]);

export const homeMenu = (env: Environment): Menu => ({
  title: 'What do you want to do?',
  items: [
    { label: 'Status', hint: 'what is live in every product', next: run('ship', ['status']) },
    { label: 'Deploy', hint: `ship a product to ${env}`, next: pick('Deploy which product?', SHIP_PRODUCTS, deployTo(env, 'Deploy')) },
    {
      label: 'Redeploy',
      hint: `deploy to ${env} again, even if already live`,
      next: pick('Redeploy which product?', SHIP_PRODUCTS, deployTo(env, 'Redeploy')),
    },
    {
      label: 'Logs',
      hint: `sanitised ${env} logs from the last hour`,
      next: pick('Logs for', IDEA_PROJECTS, (p) => run('idea', ['logs', p, '--env', env])),
    },
    {
      label: 'Failed runs',
      hint: 'GitHub Actions failures, with their logs',
      next: pick('Failed runs for', IDEA_PROJECTS, (p) => run('idea', ['runs', p, '--failed'])),
    },
    { label: 'Shell', hint: `a prompt for deploy, logs, runs and ops (${env})`, next: run('eng', ['shell']) },
    { label: 'Doctor', hint: 'check what is missing or out of date', next: run('eng', ['doctor']) },
    { label: 'Update', hint: 'update the CLIs and pull every clean repo', next: run('eng', ['update']) },
    { label: 'Setup', hint: 'sign in, install and clone everything', next: run('eng', ['setup']) },
    { label: 'Terminal theme', hint: 'install the ideaSquared skin and prompt', next: run('eng', ['theme']) },
    { label: 'Quit', next: { kind: 'quit' } },
  ],
});

export const isMenu = (next: Menu | Action): next is Menu => 'items' in next;

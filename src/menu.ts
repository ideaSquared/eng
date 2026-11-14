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

const environments = (product: string): Menu => ({
  title: `Deploy ${product} to`,
  items: [
    { label: 'staging', next: run('ship', ['deploy', product, 'staging']) },
    { label: 'production', hint: 'asks you to type the product name', next: run('ship', ['deploy', product, 'production']) },
  ],
});

export const HOME: Menu = {
  title: 'What do you want to do?',
  items: [
    { label: 'Status', hint: 'what is live in every product', next: run('ship', ['status']) },
    { label: 'Deploy', hint: 'ship a product to staging or production', next: pick('Deploy which product?', SHIP_PRODUCTS, environments) },
    { label: 'Logs', hint: 'sanitised logs from the last hour', next: pick('Logs for', IDEA_PROJECTS, (p) => run('idea', ['logs', p])) },
    {
      label: 'Failed runs',
      hint: 'GitHub Actions failures, with their logs',
      next: pick('Failed runs for', IDEA_PROJECTS, (p) => run('idea', ['runs', p, '--failed'])),
    },
    { label: 'Doctor', hint: 'check what is missing or out of date', next: run('eng', ['doctor']) },
    { label: 'Update', hint: 'update the CLIs and pull every clean repo', next: run('eng', ['update']) },
    { label: 'Setup', hint: 'sign in, install and clone everything', next: run('eng', ['setup']) },
    { label: 'Terminal theme', hint: 'install the ideaSquared skin and prompt', next: run('eng', ['theme']) },
    { label: 'Quit', next: { kind: 'quit' } },
  ],
};

export const isMenu = (next: Menu | Action): next is Menu => 'items' in next;

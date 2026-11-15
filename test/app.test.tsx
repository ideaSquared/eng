import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import type { Action } from '../src/menu.ts';

const DOWN = '\u001B[B';
const ENTER = '\r';
const ESC = '\u001B';
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const open = () => {
  const chosen: Action[] = [];
  const app = render(<App onAction={(action) => chosen.push(action)} />);
  return { ...app, chosen };
};

const press = async (stdin: { write: (data: string) => void }, ...keys: string[]) => {
  await tick();
  for (const key of keys) {
    stdin.write(key);
    await tick();
  }
};

describe('the eng app', () => {
  it('shows the menu', () => {
    const { lastFrame } = open();
    expect(lastFrame()).toContain('What do you want to do?');
    expect(lastFrame()).toContain('Deploy');
    expect(lastFrame()).toContain('Failed runs');
  });

  it('runs ship status from the first item', async () => {
    const { stdin, chosen } = open();
    await press(stdin, ENTER);
    expect(chosen).toEqual([{ kind: 'run', command: 'ship', args: ['status'] }]);
  });

  it('walks to a deploy: product, then environment', async () => {
    const { stdin, chosen, lastFrame } = open();
    await press(stdin, '2');
    expect(lastFrame()).toContain('Deploy which product?');
    await press(stdin, '3');
    expect(lastFrame()).toContain('Deploy creatrgrid to');
    await press(stdin, DOWN, ENTER);
    expect(chosen).toEqual([{ kind: 'run', command: 'ship', args: ['deploy', 'creatrgrid', 'production'] }]);
  });

  it('walks to a redeploy, which deploys the live commit again', async () => {
    const { stdin, chosen, lastFrame } = open();
    await press(stdin, '3');
    expect(lastFrame()).toContain('Redeploy which product?');
    await press(stdin, '1');
    expect(lastFrame()).toContain('Redeploy ads to');
    await press(stdin, ENTER);
    expect(chosen).toEqual([{ kind: 'run', command: 'ship', args: ['deploy', 'ads', 'staging', '--redeploy'] }]);
  });

  it('goes back with esc', async () => {
    const { stdin, lastFrame } = open();
    await press(stdin, '4');
    expect(lastFrame()).toContain('Logs for');
    await press(stdin, ESC);
    expect(lastFrame()).toContain('What do you want to do?');
    expect(lastFrame()).not.toContain('Logs for');
  });

  it('opens the eng shell from the Shell item', async () => {
    const { stdin, chosen, lastFrame } = open();
    expect(lastFrame()).toContain('Shell');
    await press(stdin, '6');
    expect(chosen).toEqual([{ kind: 'run', command: 'eng', args: ['shell'] }]);
  });

  it('quits with q', async () => {
    const { stdin, chosen } = open();
    await press(stdin, 'q');
    expect(chosen).toEqual([{ kind: 'quit' }]);
  });
});

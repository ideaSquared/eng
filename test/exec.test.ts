import { describe, expect, it } from 'vitest';
import { releaseTerminal, windowsCommand } from '../src/exec.ts';

describe('windowsCommand', () => {
  it('runs a command through cmd.exe without the shell option', () => {
    const [file, args] = windowsCommand('pnpm', ['add', '-g', 'github:ideaSquared/eng']);
    expect(file.toLowerCase()).toContain('cmd');
    expect(args).toEqual(['/d', '/c', 'pnpm', 'add', '-g', 'github:ideaSquared/eng']);
  });
});

describe('releaseTerminal', () => {
  const fakeTerminal = (reading: boolean) => {
    const calls: string[] = [];
    const handle = { reading, readStop: () => calls.push('readStop') };
    const stdin = {
      isTTY: true,
      _handle: handle,
      pause: () => calls.push('pause'),
      setRawMode: (mode: boolean) => calls.push(`raw:${mode}`),
    };
    return { stdin, handle, calls };
  };

  it('stops the pending read before leaving raw mode, so the child gets every key', () => {
    const { stdin, handle, calls } = fakeTerminal(true);
    releaseTerminal(stdin);
    expect(calls).toEqual(['readStop', 'pause', 'raw:false']);
    expect(handle.reading).toBe(false);
  });

  it('leaves a terminal that is not reading alone apart from raw mode', () => {
    const { stdin, calls } = fakeTerminal(false);
    releaseTerminal(stdin);
    expect(calls).toEqual(['pause', 'raw:false']);
  });

  it('does not touch raw mode when input is not a terminal', () => {
    const calls: string[] = [];
    releaseTerminal({ isTTY: false, pause: () => calls.push('pause'), setRawMode: () => calls.push('raw') });
    expect(calls).toEqual(['pause']);
  });
});

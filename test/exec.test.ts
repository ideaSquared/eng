import { describe, expect, it } from 'vitest';
import { reclaimTerminal, releaseTerminal, windowsCommand } from '../src/exec.ts';

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
    const handle = { reading, readStop: () => calls.push('readStop'), readStart: () => calls.push('readStart') };
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

describe('reclaimTerminal', () => {
  const fakeTerminal = (reading: boolean) => {
    const calls: string[] = [];
    const handle = { reading, readStop: () => calls.push('readStop'), readStart: () => calls.push('readStart') };
    return { stdin: { isTTY: true, _handle: handle, pause: () => calls.push('pause') }, handle, calls };
  };

  it('restarts the read releaseTerminal stopped, so eng can wait for a key again', () => {
    const { stdin, handle, calls } = fakeTerminal(true);
    releaseTerminal(stdin);
    reclaimTerminal(stdin);
    expect(calls).toEqual(['readStop', 'pause', 'readStart']);
    expect(handle.reading).toBe(true);
  });

  it('leaves a terminal that is already reading alone', () => {
    const { stdin, calls } = fakeTerminal(true);
    reclaimTerminal(stdin);
    expect(calls).toEqual([]);
  });
});

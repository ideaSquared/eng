import { describe, expect, it } from 'vitest';
import { windowsCommand } from '../src/exec.ts';

describe('windowsCommand', () => {
  it('runs a command through cmd.exe without the shell option', () => {
    const [file, args] = windowsCommand('pnpm', ['add', '-g', 'github:ideaSquared/eng']);
    expect(file.toLowerCase()).toContain('cmd');
    expect(args).toEqual(['/d', '/c', 'pnpm', 'add', '-g', 'github:ideaSquared/eng']);
  });
});

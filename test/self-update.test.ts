import { describe, expect, it } from 'vitest';
import { listNames, parseLsRemote, shouldCheck, staleRepos } from '../src/self-update.ts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('parseLsRemote', () => {
  it('reads the default branch commit', () => {
    expect(parseLsRemote(`${A}\tHEAD\n`)).toBe(A);
  });

  it('gives nothing for empty or unexpected output', () => {
    expect(parseLsRemote('')).toBeUndefined();
    expect(parseLsRemote('fatal: repository not found')).toBeUndefined();
  });
});

describe('staleRepos', () => {
  it('lists repos with a newer commit than the one installed', () => {
    expect(staleRepos({ 'o/eng': A, 'o/shipper': A }, { 'o/eng': B, 'o/shipper': A })).toEqual(['o/eng']);
  });

  it('counts a repo never recorded as stale, so the first run updates once', () => {
    expect(staleRepos({}, { 'o/eng': A })).toEqual(['o/eng']);
  });

  it('leaves a repo alone when GitHub did not answer', () => {
    expect(staleRepos({}, { 'o/eng': undefined })).toEqual([]);
  });
});

describe('shouldCheck', () => {
  it('checks when a person runs eng', () => {
    expect(shouldCheck(undefined, {}, true)).toBe(true);
    expect(shouldCheck('doctor', {}, true)).toBe(true);
  });

  it('skips scripts, ENG_NO_UPDATE, and the commands that install the CLIs themselves', () => {
    expect(shouldCheck('doctor', {}, false)).toBe(false);
    expect(shouldCheck(undefined, { ENG_NO_UPDATE: '1' }, true)).toBe(false);
    expect(shouldCheck('update', {}, true)).toBe(false);
    expect(shouldCheck('setup', {}, true)).toBe(false);
  });
});

describe('listNames', () => {
  it('joins names for a message', () => {
    expect(listNames(['eng'])).toBe('eng');
    expect(listNames(['eng', 'ship', 'idea'])).toBe('eng, ship and idea');
  });
});

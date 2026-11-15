import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const PackageSchema = z.object({ dependencies: z.record(z.string(), z.string()) });

describe('eng as a global install', () => {
  // eng installs with `pnpm add -g github:ideaSquared/eng`, and pnpm refuses URL, git and file dependencies of a
  // package installed that way (blockExoticSubdeps). So every runtime dependency must come from the npm registry.
  it('has only registry dependencies', () => {
    const { dependencies } = PackageSchema.parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    const exotic = Object.entries(dependencies).filter(([, spec]) => /[:/]/.test(spec));
    expect(exotic).toEqual([]);
  });
});

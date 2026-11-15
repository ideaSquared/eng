import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';

// vitest.config.ts turns colour on; the danger red is matched as its 24-bit or its 16-colour code, whichever the terminal gets.
/* eslint-disable no-control-regex */
const DANGER_TEXT = /\x1b\[(?:91|38;2;248;113;113)m/;
const DANGER_BLOCK = /\x1b\[(?:101|48;2;248;113;113)m/;
const DANGER_BORDER = /\x1b\[(?:91|38;2;248;113;113)m╭/;
/* eslint-enable no-control-regex */

describe('the app colours', () => {
  it('draws the border, title and badge in the danger colour in production', () => {
    const frame = render(<App env="production" onAction={() => undefined} />).lastFrame() ?? '';
    expect(frame).toMatch(DANGER_BORDER);
    expect(frame).toMatch(DANGER_TEXT);
    expect(frame).toMatch(DANGER_BLOCK);
    expect(frame).toContain('PRODUCTION');
  });

  it('uses no danger colour in staging', () => {
    const frame = render(<App env="staging" onAction={() => undefined} />).lastFrame() ?? '';
    expect(frame).not.toMatch(DANGER_TEXT);
    expect(frame).not.toMatch(DANGER_BLOCK);
    expect(frame).toContain('[staging]');
  });
});

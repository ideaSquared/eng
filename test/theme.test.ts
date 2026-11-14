import { describe, expect, it } from 'vitest';
import { clinkScript, hasOtherStarship, paint, PROFILE_MARKER, SCHEME_NAME, starshipConfig, windowsTerminalFragment, withPrompt } from '../src/theme.ts';

describe('withPrompt', () => {
  it('adds the prompt to a bash or zsh profile', () => {
    const next = withPrompt('alias ll="ls -l"\n', 'zsh', '/home/me/.config/ideasquared/starship.toml');
    expect(next).toContain('alias ll="ls -l"');
    expect(next).toContain(PROFILE_MARKER);
    expect(next).toContain('export STARSHIP_CONFIG="/home/me/.config/ideasquared/starship.toml"');
    expect(next).toContain('eval "$(starship init zsh)"');
  });

  it('adds the PowerShell form to a PowerShell profile', () => {
    const next = withPrompt('', 'powershell', 'C:\\Users\\me\\.config\\ideasquared\\starship.toml');
    expect(next).toContain('$env:STARSHIP_CONFIG = "C:\\Users\\me\\.config\\ideasquared\\starship.toml"');
    expect(next).toContain('Invoke-Expression (&starship init powershell)');
  });

  it('adds it only once', () => {
    const once = withPrompt('', 'bash', '/x.toml');
    expect(withPrompt(once, 'bash', '/x.toml')).toBe(once);
  });

  it('keeps a profile without a trailing newline intact', () => {
    expect(withPrompt('export A=1', 'bash', '/x.toml').startsWith('export A=1\n\n')).toBe(true);
  });
});

describe('hasOtherStarship', () => {
  it('spots a Starship prompt the user set up themselves', () => {
    expect(hasOtherStarship('eval "$(starship init zsh)"\n')).toBe(true);
  });

  it('ignores ours and profiles without Starship', () => {
    expect(hasOtherStarship(withPrompt('', 'zsh', '/x.toml'))).toBe(false);
    expect(hasOtherStarship('alias ll="ls -l"\n')).toBe(false);
  });
});

describe('the skin', () => {
  it('gives the Windows Terminal profile the ideaSquared scheme and opens the eng app', () => {
    const fragment = windowsTerminalFragment('C:\\Users\\me\\ideasquared');
    expect(fragment.schemes.map((s) => s.name)).toEqual([SCHEME_NAME]);
    expect(fragment.profiles[0]).toMatchObject({
      name: 'ideaSquared',
      colorScheme: SCHEME_NAME,
      startingDirectory: 'C:\\Users\\me\\ideasquared',
    });
    expect(fragment.profiles[0]?.commandline).toContain('eng');
  });

  it('writes a Starship config with the ideaSquared colours', () => {
    expect(starshipConfig()).toContain('#8B5CF6');
    expect(starshipConfig()).toContain('[character]');
  });
});

describe('paint', () => {
  it('colours text with a palette hex', () => {
    expect(paint('#8B5CF6', 'hi')).toBe('\x1b[38;2;139;92;246mhi\x1b[0m');
  });
});

describe('clinkScript', () => {
  it('points Starship at the ideaSquared config and starts it in cmd', () => {
    const script = clinkScript('C:\\Users\\me\\.config\\ideasquared\\starship.toml');
    expect(script).toContain("os.setenv('STARSHIP_CONFIG', [[C:\\Users\\me\\.config\\ideasquared\\starship.toml]])");
    expect(script).toContain("io.popen('starship init cmd')");
  });
});

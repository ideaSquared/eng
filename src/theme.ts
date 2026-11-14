// The ideaSquared look: one palette, used by the eng app and by the terminal skin `eng theme` installs.
export const PALETTE = {
  background: '#0E0F1A',
  surface: '#1A1B2E',
  selection: '#2A2B45',
  foreground: '#E7E7F2',
  muted: '#8A8AA3',
  primary: '#8B5CF6',
  accent: '#22D3EE',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#60A5FA',
} as const;

export const SCHEME_NAME = 'ideaSquared';
export const PROFILE_MARKER = '# ideaSquared prompt (added by eng theme)';

// A Windows Terminal fragment: a colour scheme plus a profile that opens straight into the eng app.
// Fragments sit beside the user's settings.json and never change it.
export const windowsTerminalFragment = (startingDirectory: string) => ({
  profiles: [
    {
      name: 'ideaSquared',
      commandline: 'powershell.exe -NoLogo -NoExit -Command eng.cmd',
      colorScheme: SCHEME_NAME,
      startingDirectory,
      tabTitle: 'ideaSquared',
      cursorShape: 'bar',
    },
  ],
  schemes: [
    {
      name: SCHEME_NAME,
      background: PALETTE.background,
      foreground: PALETTE.foreground,
      cursorColor: PALETTE.accent,
      selectionBackground: PALETTE.selection,
      black: PALETTE.surface,
      red: PALETTE.danger,
      green: PALETTE.success,
      yellow: PALETTE.warning,
      blue: PALETTE.info,
      purple: PALETTE.primary,
      cyan: PALETTE.accent,
      white: '#D4D4E0',
      brightBlack: PALETTE.muted,
      brightRed: '#FCA5A5',
      brightGreen: '#6EE7B7',
      brightYellow: '#FDE68A',
      brightBlue: '#93C5FD',
      brightPurple: '#C4B5FD',
      brightCyan: '#67E8F9',
      brightWhite: '#FFFFFF',
    },
  ],
});

// The themed prompt, for Starship. Plain symbols only, so it needs no special font.
export const starshipConfig = (): string => `# ideaSquared prompt, written by eng theme. eng theme overwrites this file.
format = "[◆](bold ${PALETTE.primary}) $directory$git_branch$git_status$nodejs$line_break$character"
add_newline = true

[character]
success_symbol = "[›](bold ${PALETTE.accent})"
error_symbol = "[›](bold ${PALETTE.danger})"

[directory]
style = "bold ${PALETTE.foreground}"
truncation_length = 3

[git_branch]
format = "on [$branch]($style) "
style = "bold ${PALETTE.primary}"

[git_status]
style = "${PALETTE.warning}"

[nodejs]
format = "[node $version]($style) "
style = "${PALETTE.success}"
`;

export type Shell = 'bash' | 'zsh' | 'powershell';

const snippet = (shell: Shell, configPath: string): string =>
  shell === 'powershell'
    ? `${PROFILE_MARKER}\n$env:STARSHIP_CONFIG = "${configPath}"\nInvoke-Expression (&starship init powershell)\n`
    : `${PROFILE_MARKER}\nexport STARSHIP_CONFIG="${configPath}"\neval "$(starship init ${shell})"\n`;

// The profile with the prompt added once; unchanged when it is already there.
export const withPrompt = (profile: string, shell: Shell, configPath: string): string =>
  profile.includes(PROFILE_MARKER)
    ? profile
    : `${profile}${profile === '' || profile.endsWith('\n') ? '' : '\n'}\n${snippet(shell, configPath)}`;

// True when the profile already starts Starship some other way, so adding ours would replace that prompt.
export const hasOtherStarship = (profile: string): boolean =>
  !profile.includes(PROFILE_MARKER) && /starship init/.test(profile);

// Wraps text in a 24-bit colour for plain terminal output outside the app.
export const paint = (hex: string, text: string): string => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};

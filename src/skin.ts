// Installs the ideaSquared terminal skin: a Windows Terminal profile and scheme, and the themed Starship prompt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawn } from './exec.ts';
import { hasOtherStarship, starshipConfig, windowsTerminalFragment, withPrompt, type Shell } from './theme.ts';

const windows = process.platform === 'win32';
const STARSHIP_CONFIG = join(homedir(), '.config', 'ideasquared', 'starship.toml');

const ok = (command: string, args: string[]): boolean => spawn(command, args, { stdio: 'ignore' }).status === 0;
const live = (command: string, args: string[]): boolean => spawn(command, args, { stdio: 'inherit' }).status === 0;
const output = (command: string, args: string[]): string | undefined => {
  const r = spawn(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? String(r.stdout).trim() || undefined : undefined;
};

const confirm = async (question: string): Promise<boolean> => {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
};

const write = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const installWindowsTerminalProfile = (reposDir: string): void => {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return;
  const path = join(localAppData, 'Microsoft', 'Windows Terminal', 'Fragments', 'ideaSquared', 'ideasquared.json');
  write(path, `${JSON.stringify(windowsTerminalFragment(reposDir), null, 2)}\n`);
  console.log('✓ Windows Terminal: added the ideaSquared profile and colour scheme (restart Windows Terminal to see it)');
};

const installStarship = (): boolean => {
  if (ok('starship', ['--version'])) return true;
  console.log('\n→ Installing Starship (the prompt)');
  if (windows && ok('winget', ['--version'])) {
    const installed = live('winget', ['install', '--id', 'Starship.Starship', '--exact', '--silent', '--accept-source-agreements', '--accept-package-agreements']);
    if (installed) console.log('  Open a new terminal for starship to be on your PATH.');
    return installed;
  }
  if (ok('brew', ['--version'])) return live('brew', ['install', 'starship']);
  console.log('! Install Starship from https://starship.rs, then run eng theme again.');
  return false;
};

// The profile files each shell on this machine reads at start.
const profiles = (): { shell: Shell; path: string }[] => {
  if (windows) {
    return ['powershell', 'pwsh']
      .map((exe) => output(exe, ['-NoProfile', '-Command', '$PROFILE']))
      .filter((path): path is string => path !== undefined)
      .map((path) => ({ shell: 'powershell', path }));
  }
  const shell: Shell = basename(process.env.SHELL ?? 'bash') === 'zsh' ? 'zsh' : 'bash';
  return [{ shell, path: join(homedir(), shell === 'zsh' ? '.zshrc' : '.bashrc') }];
};

export const installTheme = async (reposDir: string): Promise<number> => {
  write(STARSHIP_CONFIG, starshipConfig());
  if (windows) installWindowsTerminalProfile(reposDir);
  console.log('✓ The eng app already uses the ideaSquared colours: run eng on its own to open it.');

  if (!(await confirm('\nUse the ideaSquared prompt (Starship) in your shell?'))) {
    console.log('Skipped the prompt. Run eng theme any time to add it.');
    return 0;
  }
  if (!installStarship()) return 1;
  for (const { shell, path } of profiles()) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (hasOtherStarship(current) && !(await confirm(`${path} already starts a Starship prompt. Replace it with ours?`))) continue;
    const next = withPrompt(current, shell, STARSHIP_CONFIG);
    if (next === current) {
      console.log(`✓ ${path}: already has the ideaSquared prompt`);
      continue;
    }
    write(path, next);
    console.log(`✓ ${path}: added the ideaSquared prompt`);
  }
  console.log('\nOpen a new terminal to see it.');
  return 0;
};

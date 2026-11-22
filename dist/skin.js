// Installs the ideaSquared terminal skin: a Windows Terminal profile and scheme, and the themed Starship prompt.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawn } from "./exec.js";
import { CLINK_SCRIPT_NAME, clinkScript, hasOtherStarship, starshipConfig, windowsTerminalFragment, withPrompt } from "./theme.js";
const windows = process.platform === 'win32';
const STARSHIP_CONFIG = join(homedir(), '.config', 'ideasquared', 'starship.toml');
const ok = (command, args) => spawn(command, args, { stdio: 'ignore' }).status === 0;
const live = (command, args) => spawn(command, args, { stdio: 'inherit' }).status === 0;
const output = (command, args) => {
    const r = spawn(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0 ? String(r.stdout).trim() || undefined : undefined;
};
const confirm = async (question) => {
    if (!process.stdin.isTTY)
        return false;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`${question} [y/N] `);
    rl.close();
    return /^y(es)?$/i.test(answer.trim());
};
const write = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
};
const installWindowsTerminalProfile = (reposDir) => {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData)
        return;
    const path = join(localAppData, 'Microsoft', 'Windows Terminal', 'Fragments', 'ideaSquared', 'ideasquared.json');
    write(path, `${JSON.stringify(windowsTerminalFragment(reposDir), null, 2)}\n`);
    console.log('✓ Windows Terminal: added the ideaSquared profile and colour scheme (restart Windows Terminal to see it)');
};
const installStarship = () => {
    if (ok('starship', ['--version']))
        return true;
    console.log('\n→ Installing Starship (the prompt)');
    if (windows && ok('winget', ['--version'])) {
        const installed = live('winget', [
            'install',
            '--id',
            'Starship.Starship',
            '--exact',
            '--silent',
            '--accept-source-agreements',
            '--accept-package-agreements',
        ]);
        if (installed)
            console.log('  Open a new terminal for starship to be on your PATH.');
        return installed;
    }
    if (ok('brew', ['--version']))
        return live('brew', ['install', 'starship']);
    console.log('! Install Starship from https://starship.rs, then run eng theme again.');
    return false;
};
// cmd.exe has no prompt hook of its own; Clink adds one. Its .bat is not always on PATH right after winget installs it.
const findClink = () => {
    if (ok('clink', ['--version']))
        return 'clink';
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')];
    return roots
        .filter((root) => Boolean(root))
        .map((root) => join(root, 'clink', 'clink.bat'))
        .find((path) => existsSync(path));
};
const installCmdPrompt = async () => {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData)
        return;
    if (!findClink()) {
        console.log('\n→ Installing Clink (gives cmd.exe a prompt hook)');
        if (!ok('winget', ['--version']) ||
            !live('winget', ['install', '--id', 'chrisant996.Clink', '--exact', '--silent', '--accept-source-agreements', '--accept-package-agreements'])) {
            console.log('! Could not install Clink. Install it from https://chrisant996.github.io/clink/, then run eng theme again.');
            return;
        }
    }
    const clink = findClink();
    if (!clink) {
        console.log('! Clink installed, but eng could not find it yet. Open a new terminal and run eng theme again.');
        return;
    }
    // Starts Clink in every cmd.exe window (a per-user registry setting; no admin needed).
    if (!ok(clink, ['autorun', 'install', '--', '--quiet']))
        console.log('! Could not turn on Clink for cmd.exe. Run: clink autorun install');
    const scripts = join(localAppData, 'clink');
    const others = existsSync(scripts)
        ? readdirSync(scripts).filter((f) => f.endsWith('.lua') && f !== CLINK_SCRIPT_NAME && /starship init/.test(readFileSync(join(scripts, f), 'utf8')))
        : [];
    if (others.length > 0 && !(await confirm(`${join(scripts, others[0] ?? '')} already starts a Starship prompt in cmd. Add ours as well?`)))
        return;
    write(join(scripts, CLINK_SCRIPT_NAME), clinkScript(STARSHIP_CONFIG));
    console.log(`✓ cmd.exe: added the ideaSquared prompt (${join(scripts, CLINK_SCRIPT_NAME)})`);
};
// The profile files each shell on this machine reads at start.
const profiles = () => {
    if (windows) {
        return ['powershell', 'pwsh']
            .map((exe) => output(exe, ['-NoProfile', '-Command', '$PROFILE']))
            .filter((path) => path !== undefined)
            .map((path) => ({ shell: 'powershell', path }));
    }
    const shell = basename(process.env.SHELL ?? 'bash') === 'zsh' ? 'zsh' : 'bash';
    return [{ shell, path: join(homedir(), shell === 'zsh' ? '.zshrc' : '.bashrc') }];
};
export const installTheme = async (reposDir) => {
    write(STARSHIP_CONFIG, starshipConfig());
    if (windows)
        installWindowsTerminalProfile(reposDir);
    console.log('✓ The eng app already uses the ideaSquared colours: run eng on its own to open it.');
    if (!(await confirm('\nUse the ideaSquared prompt (Starship) in your shell?'))) {
        console.log('Skipped the prompt. Run eng theme any time to add it.');
        return 0;
    }
    if (!installStarship())
        return 1;
    for (const { shell, path } of profiles()) {
        const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
        if (hasOtherStarship(current) && !(await confirm(`${path} already starts a Starship prompt. Replace it with ours?`)))
            continue;
        const next = withPrompt(current, shell, STARSHIP_CONFIG);
        if (next === current) {
            console.log(`✓ ${path}: already has the ideaSquared prompt`);
            continue;
        }
        write(path, next);
        console.log(`✓ ${path}: added the ideaSquared prompt`);
    }
    if (windows)
        await installCmdPrompt();
    console.log('\nOpen a new terminal to see it.');
    return 0;
};

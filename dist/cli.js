#!/usr/bin/env node
// eng: set up and update an ideaSquared developer machine. See the README for the commands.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chooseAction } from "./app.js";
import { BASE_TOOLS, checkGitHubLogin, checkTool, formatResults, TOOLS } from "./checks.js";
import { GLOBAL_PACKAGES, ORG, planRepo, REPOS } from "./repos.js";
import { installTheme } from "./skin.js";
import { paint, PALETTE } from "./theme.js";
const HELP = `eng: set up and update an ideaSquared developer machine

  eng                          open the eng app: status, deploys, logs and runs from one themed menu
  eng setup [--dir <folder>]   sign in to GitHub, install ship and idea, clone and install every repo
  eng update                   update ship, idea and eng, pull every clean repo on its default branch
  eng doctor                   check what is missing or out of date
  eng theme                    install the ideaSquared terminal skin and prompt

Repos live in ~/ideasquared unless you pass --dir to setup (it is remembered) or set ENG_DIR.`;
// Global pnpm commands are .cmd shims on Windows, which only start through a shell.
const shell = process.platform === 'win32';
const CONFIG = join(homedir(), '.config', 'eng', 'config.json');
const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'pipe'] });
    return result.status === 0 ? result.stdout.trim() : undefined;
};
const runIn = (cwd) => (command, args) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell, stdio: ['ignore', 'pipe', 'pipe'] });
    return result.status === 0 ? result.stdout.trim() : undefined;
};
// Runs with the terminal attached, for commands that ask questions or show progress.
const live = (command, args, cwd) => spawnSync(command, args, { cwd, shell, stdio: 'inherit' }).status === 0;
const savedDir = () => {
    try {
        const parsed = JSON.parse(readFileSync(CONFIG, 'utf8'));
        return typeof parsed === 'object' && parsed !== null && 'dir' in parsed && typeof parsed.dir === 'string'
            ? parsed.dir
            : undefined;
    }
    catch {
        return undefined;
    }
};
const saveDir = (dir) => {
    mkdirSync(dirname(CONFIG), { recursive: true });
    writeFileSync(CONFIG, `${JSON.stringify({ dir }, null, 2)}\n`);
};
const reposDir = () => process.env.ENG_DIR ?? savedDir() ?? join(homedir(), 'ideasquared');
const repoState = (dir, name) => {
    const path = join(dir, name);
    if (!existsSync(join(path, '.git')))
        return { name, cloned: false };
    const git = runIn(path);
    const branch = git('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    const remoteHead = git('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return {
        name,
        cloned: true,
        branch: branch === 'HEAD' ? undefined : branch,
        defaultBranch: remoteHead?.replace(/^origin\//, ''),
        // A failed status check counts as dirty: update must not pull when it cannot tell.
        dirty: git('git', ['status', '--porcelain']) !== '',
    };
};
const installDeps = (dir, name) => {
    const path = join(dir, name);
    if (!existsSync(join(path, 'package.json')))
        return true;
    console.log(`\n→ ${name}: pnpm install`);
    const ok = live('pnpm', ['install'], path);
    if (!ok)
        console.log(`! ${name}: pnpm install failed. Run it in ${path} to see why.`);
    return ok;
};
const installGlobals = () => {
    console.log('\n→ Installing ship, idea and eng');
    return live('pnpm', ['add', '-g', ...GLOBAL_PACKAGES]);
};
const doctor = (dir) => {
    const repoResults = REPOS.map((name) => existsSync(join(dir, name, '.git'))
        ? { name: `repo ${name}`, ok: true, required: false, detail: 'cloned' }
        : { name: `repo ${name}`, ok: false, required: false, detail: `not in ${dir}`, fix: 'Run: eng setup' });
    const { lines, ok } = formatResults([...TOOLS.map((t) => checkTool(t, run)), checkGitHubLogin(run), ...repoResults]);
    console.log(lines.join('\n'));
    console.log(ok ? '\nAll required tools are ready.' : '\nSome required tools are missing. Follow the fixes above.');
    return ok ? 0 : 1;
};
const setup = async (dir) => {
    const base = formatResults(TOOLS.filter((t) => BASE_TOOLS.includes(t.name)).map((t) => checkTool(t, run)));
    if (!base.ok) {
        console.log(`${base.lines.join('\n')}\n\nInstall the missing tools (the installer script does this), then run eng setup again.`);
        return 1;
    }
    if (!checkGitHubLogin(run).ok) {
        console.log('\n→ Signing in to GitHub');
        if (!live('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']))
            return 1;
    }
    live('gh', ['auth', 'setup-git']);
    if (!installGlobals())
        return 1;
    mkdirSync(dir, { recursive: true });
    const actions = REPOS.map((name) => planRepo(repoState(dir, name)));
    const cloned = actions
        .filter((a) => a.action === 'clone')
        .filter(({ name }) => {
        console.log(`\n→ Cloning ${ORG}/${name}`);
        const ok = live('gh', ['repo', 'clone', `${ORG}/${name}`, name], dir);
        if (!ok)
            console.log(`! ${name}: clone failed. Ask for access to ${ORG}/${name} if you need it.`);
        return ok;
    });
    // Existing clean checkouts get their dependencies too, so re-running setup finishes an interrupted one.
    const toInstall = [...cloned, ...actions.filter((a) => a.action === 'pull')];
    const installed = toInstall.map(({ name }) => installDeps(dir, name)).every(Boolean);
    console.log('');
    const status = doctor(dir);
    if (process.stdin.isTTY) {
        console.log('');
        await installTheme(dir);
    }
    return installed ? status : 1;
};
const update = (dir) => {
    const globalsOk = installGlobals();
    const actions = REPOS.map((name) => planRepo(repoState(dir, name)));
    const reposOk = actions
        .map((a) => {
        if (a.action === 'clone') {
            console.log(`! ${a.name}: not cloned. Run eng setup.`);
            return true;
        }
        if (a.action === 'skip') {
            console.log(`- ${a.name}: skipped, ${a.reason}`);
            return true;
        }
        console.log(`\n→ ${a.name}: git pull`);
        if (!live('git', ['pull', '--ff-only'], join(dir, a.name))) {
            console.log(`! ${a.name}: pull failed.`);
            return false;
        }
        return installDeps(dir, a.name);
    })
        .every(Boolean);
    console.log('');
    const status = doctor(dir);
    return globalsOk && reposOk ? status : 1;
};
// Each choice runs with the terminal attached; eng itself runs as this same script, installed or not.
const runAction = (action) => {
    console.clear();
    if (action.command === 'eng') {
        spawnSync(process.execPath, [process.argv[1] ?? 'eng', ...action.args], { stdio: 'inherit' });
        return;
    }
    if (!live(action.command, action.args))
        console.log(`\n! ${action.command} did not finish cleanly. Run eng doctor if it is missing.`);
};
const pressAnyKey = () => new Promise((done) => {
    process.stdout.write(`\n${paint(PALETTE.muted, 'Press any key to go back to the menu')}`);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        done();
    });
});
const launch = async () => {
    for (;;) {
        const action = await chooseAction();
        if (action.kind === 'quit')
            return 0;
        runAction(action);
        await pressAnyKey();
        console.clear();
    }
};
const main = async () => {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: { dir: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
    const [command] = positionals;
    if (!command && !values.help && process.stdin.isTTY && process.stdout.isTTY)
        return launch();
    if (values.help || !command) {
        console.log(HELP);
        return values.help ? 0 : 1;
    }
    const dir = values.dir ? resolve(values.dir) : reposDir();
    if (values.dir && command === 'setup')
        saveDir(dir);
    if (command === 'setup')
        return setup(dir);
    if (command === 'update')
        return update(dir);
    if (command === 'doctor')
        return doctor(dir);
    if (command === 'theme')
        return installTheme(dir);
    console.log(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
};
process.exitCode = await main();

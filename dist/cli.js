#!/usr/bin/env node
// eng: set up and update an ideaSquared developer machine. See the README for the commands.
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { chooseAction } from "./app.js";
import { BASE_TOOLS, checkGitHubLogin, checkTool, formatResults, TOOLS } from "./checks.js";
import { GLOBAL_CLIS, GLOBAL_PACKAGES, GLOBAL_REPOS, ORG, planRepo, REPOS } from "./repos.js";
import { listNames, parseLsRemote, shouldCheck, staleRepos } from "./self-update.js";
import { spawn } from "./exec.js";
import { installTheme } from "./skin.js";
import { paint, PALETTE } from "./theme.js";
const HELP = `eng: set up and update an ideaSquared developer machine

  eng                          open the eng app: status, deploys, logs and runs from one themed menu
  eng setup [--dir <folder>]   sign in to GitHub, install ship and idea, clone and install every repo
  eng update                   update ship, idea and eng, pull every clean repo on its default branch
  eng doctor                   check what is missing or out of date
  eng theme                    install the ideaSquared terminal skin and prompt

Repos live in ~/ideasquared unless you pass --dir to setup (it is remembered) or set ENG_DIR.
Every run first updates eng, ship and idea if GitHub has newer versions. ENG_NO_UPDATE=1 turns that off.`;
const CONFIG = join(homedir(), '.config', 'eng', 'config.json');
const runIn = (cwd) => (command, args) => {
    const result = spawn(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return result.status === 0 ? String(result.stdout).trim() : undefined;
};
const run = runIn();
// Runs with the terminal attached, for commands that ask questions or show progress.
const live = (command, args, cwd) => spawn(command, args, { cwd, stdio: 'inherit' }).status === 0;
const isRecord = (value) => typeof value === 'object' && value !== null;
const readConfig = () => {
    try {
        const parsed = JSON.parse(readFileSync(CONFIG, 'utf8'));
        if (!isRecord(parsed))
            return {};
        const installed = isRecord(parsed.installed)
            ? Object.fromEntries(Object.entries(parsed.installed).filter((e) => typeof e[1] === 'string'))
            : undefined;
        return { dir: typeof parsed.dir === 'string' ? parsed.dir : undefined, installed };
    }
    catch {
        return {};
    }
};
const saveConfig = (patch) => {
    mkdirSync(dirname(CONFIG), { recursive: true });
    writeFileSync(CONFIG, `${JSON.stringify({ ...readConfig(), ...patch }, null, 2)}\n`);
};
const reposDir = () => process.env.ENG_DIR ?? readConfig().dir ?? join(homedir(), 'ideasquared');
const execFileAsync = promisify(execFile);
const latestCommit = async (repo) => {
    try {
        const { stdout } = await execFileAsync('git', ['ls-remote', `https://github.com/${repo}`, 'HEAD'], { timeout: 5000 });
        return parseLsRemote(stdout);
    }
    catch {
        return undefined;
    }
};
const latestCommits = async () => Object.fromEntries(await Promise.all(GLOBAL_REPOS.map(async (repo) => [repo, await latestCommit(repo)])));
const recordInstalled = (latest) => saveConfig({
    installed: {
        ...readConfig().installed,
        ...Object.fromEntries(Object.entries(latest).filter((e) => e[1] !== undefined)),
    },
});
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
const installGlobals = async () => {
    const latest = await latestCommits();
    console.log('\n→ Installing ship, idea and eng');
    const ok = live('pnpm', ['add', '-g', ...GLOBAL_PACKAGES]);
    if (ok)
        recordInstalled(latest);
    return ok;
};
// Brings eng, ship and idea up to date before eng does anything else. True when eng itself changed.
const selfUpdate = async () => {
    const latest = await latestCommits();
    const stale = staleRepos(readConfig().installed ?? {}, latest);
    if (stale.length === 0)
        return false;
    console.log(paint(PALETTE.accent, `↻ Updating ${listNames(stale.map((repo) => GLOBAL_CLIS[repo] ?? repo))}...`));
    const result = spawn('pnpm', ['add', '-g', ...GLOBAL_PACKAGES], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) {
        console.log(paint(PALETTE.warning, '! The update failed. Run eng update to see why.'));
        return false;
    }
    recordInstalled(latest);
    console.log(paint(PALETTE.success, '✓ Up to date'));
    return stale.includes(`${ORG}/eng`);
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
    if (!(await installGlobals()))
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
const update = async (dir) => {
    const globalsOk = await installGlobals();
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
    // Ink unrefs stdin when the menu closes, so take it back or Node exits while waiting for the key.
    process.stdin.ref();
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
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    // When eng itself updated, run the new version for what was asked, without checking again.
    if (!values.help && shouldCheck(command, process.env, interactive) && (await selfUpdate())) {
        return spawn('eng', process.argv.slice(2), { stdio: 'inherit', env: { ...process.env, ENG_NO_UPDATE: '1' } }).status ?? 1;
    }
    if (!command && !values.help && process.stdin.isTTY && process.stdout.isTTY)
        return launch();
    if (values.help || !command) {
        console.log(HELP);
        return values.help ? 0 : 1;
    }
    const dir = values.dir ? resolve(values.dir) : reposDir();
    if (values.dir && command === 'setup')
        saveConfig({ dir });
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

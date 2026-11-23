#!/usr/bin/env node
// eng: set up and update an ideaSquared developer machine. See the README for the commands.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs, promisify } from 'node:util';
import { chooseAction } from "./app.js";
import { BASE_TOOLS, parseScopes, checkGitHubLogin, checkOpsAccess, checkTool, formatResults, OPS_TOKEN_URL, pythonTool, TOOLS, } from "./checks.js";
import { depsSteps, GLOBAL_CLIS, GLOBAL_PACKAGES, GLOBAL_REPOS, ORG, planRepo, pythonCommand, REPOS, venvPython } from "./repos.js";
import { listNames, parseLsRemote, shouldCheck, staleRepos } from "./self-update.js";
import { reclaimTerminal, releaseTerminal, spawn } from "./exec.js";
import { banner, complete, prompt, route } from "./shell.js";
import { CONFIRM_PROMPT, isProductionConfirmed, productionWarning, resolveEnvironment } from "./session.js";
import { colour, OPS_PRODUCTS, plain, runOps } from "./ops.js";
import { checkGlobalCli, foldersWith, isRunnable } from "./shims.js";
import { installTheme } from "./skin.js";
import { paint, PALETTE } from "./theme.js";
import { readVersion } from "./version.js";
const HELP = `eng: set up and update an ideaSquared developer machine

  eng [--production]           open the eng app: status, deploys, logs and runs from one themed menu
  eng setup [--dir <folder>]   sign in to GitHub, install ship and idea, clone and install every repo
  eng update                   update ship, idea and eng, pull every clean repo on its default branch
  eng doctor                   check what is missing or out of date, and your ops access per product
  eng theme                    install the ideaSquared terminal skin and prompt
  eng --version                print the eng version
  eng shell [--production]     a prompt for short commands: deploy, logs, runs, ops (type help inside)
  eng ops                      list the products whose ops commands eng can run
  eng ops <product> [<group> <name> [args...]] [--env staging|production] [--yes] [--json-output]
                               browse and run a product's ops commands (writes preview, then confirm);
                               in the picker, type words to filter the list
  eng ops find <words...>      search every product's commands (every word must match) and print how to run them

eng ops covers products that expose the ops contract (creatrgrid, pairflix, ads). Access is your GitHub team for
that product. For ads, unlocks and history stay in \`pnpm ops\`. The environment is ENG_ENV (staging unless set);
--env overrides it.

In the eng app press / to search every action; in eng shell, find <words...> runs eng ops find and help <words...>
prints only the help lines matching every word.

The app and the shell start in staging. --production (or --env production) starts in production after a warning and
you typing production; --env staging is the default spelled out. The environment is fixed for the session.
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
const windows = process.platform === 'win32';
const installDeps = (dir, name) => {
    const path = join(dir, name);
    // The repo's own Python, as an absolute path: the steps run inside the repo, so a relative ENG_DIR must not be
    // applied twice.
    const ownPython = resolve(path, venvPython(windows));
    // Ready means its interpreter runs and has pip. A .venv left half-made by an interrupted run is not ready, and
    // `python -m venv .venv` over it repairs it without deleting anything.
    const venvReady = run(ownPython, ['-m', 'pip', '--version']) !== undefined;
    const steps = depsSteps({
        packageJson: existsSync(join(path, 'package.json')),
        requirements: existsSync(join(path, 'requirements.txt')),
        venv: venvReady,
    }, windows);
    // Python is optional (doctor warns): without it the repo's Python packages are skipped, not failed. The version
    // that matters is the one that will run pip: the repo's own Python when it is ready, else the one that makes it.
    const python = !steps.some((step) => step.needsPython) || checkTool(pythonTool(venvReady ? ownPython : pythonCommand(windows)), run).ok;
    if (!python) {
        console.log(venvReady
            ? `! ${name}: Python packages skipped. Its .venv uses a Python older than 3.10: delete ${join(path, '.venv')}, then run eng update.`
            : `! ${name}: Python packages skipped. Install Python 3.10 or later, then run eng update.`);
    }
    return steps
        .filter((step) => python || !step.needsPython)
        .every((step) => {
        console.log(`\n→ ${name}: ${step.label}`);
        // A repo's own Python is a path inside it; anything else is found on PATH.
        const ok = live(step.command === venvPython(windows) ? ownPython : step.command, step.args, path);
        if (!ok)
            console.log(`! ${name}: ${step.label} failed. Run it in ${path} to see why.`);
        return ok;
    });
};
// ship, idea and eng as PATH resolves them: every PATH folder holding one, whether the first is pnpm's global bin,
// and whether it runs. pnpm 11 moved that bin, so shims left by pnpm 10 can shadow a fresh install.
const globalBin = () => run('pnpm', ['bin', '-g']);
const runnable = (file) => {
    try {
        const info = statSync(file);
        return isRunnable({ isFile: info.isFile(), mode: info.mode }, windows);
    }
    catch {
        return false;
    }
};
const globalCliResults = () => {
    const dirs = (process.env.PATH ?? '').split(delimiter);
    const binDir = globalBin();
    return Object.values(GLOBAL_CLIS).map((name) => checkGlobalCli({
        name,
        folders: foldersWith(name, dirs, runnable, windows, process.cwd()),
        binDir,
        windows,
        version: run(name, ['--version']),
    }));
};
// The problems with the installed CLIs, printed; true when there are none. Callers record an install only then.
const globalsVerified = () => {
    const problems = globalCliResults().filter((result) => !result.ok);
    problems.forEach((result) => console.log(`! ${result.name}: ${result.detail}${result.fix ? `\n    ${result.fix}` : ''}`));
    return problems.length === 0;
};
// The eng that pnpm just installed, by full path, so a stale shim earlier on PATH cannot run instead.
const installedEng = () => {
    const dir = globalBin();
    return dir ? join(dir, windows ? 'eng.cmd' : 'eng') : 'eng';
};
const installGlobals = async () => {
    const latest = await latestCommits();
    console.log('\n→ Installing ship, idea and eng');
    const ok = live('pnpm', ['add', '-g', ...GLOBAL_PACKAGES]);
    if (!ok)
        return false;
    if (!globalsVerified())
        return false;
    recordInstalled(latest);
    return true;
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
    if (!globalsVerified()) {
        console.log(paint(PALETTE.warning, '! Installed, but the commands PATH finds are not the new ones. Fix that, then run eng update.'));
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
    const login = checkGitHubLogin(run);
    const token = login.ok ? opsToken() : undefined;
    const opsResults = token === undefined ? [] : checkOpsAccess((_command, args) => opsGh(token, args), opsTokenFromEnv(), OPS_PRODUCTS);
    const globals = globalCliResults();
    const tools = [...TOOLS, pythonTool(pythonCommand(windows))].map((t) => globals.find((g) => g.name === t.command) ?? checkTool(t, run));
    const { lines, ok } = formatResults([...tools, ...globals.filter((g) => !TOOLS.some((t) => t.command === g.name)), login, ...opsResults, ...repoResults]);
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
    // eng ops sends ENG_OPS_TOKEN, never gh's login token (it can do more than read teams). Doctor checks it at the end.
    if (!opsTokenFromEnv()) {
        console.log(`\n! eng ops needs ENG_OPS_TOKEN: a classic token with only read:org. Create one at ${OPS_TOKEN_URL},\n  set ENG_OPS_TOKEN to it in your shell profile, and open a new terminal. Steps: "Set up eng ops" in the eng README.`);
    }
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
const OWN_COMMANDS = ['update', 'doctor', 'theme'];
// Runs one routed command from the shell. eng's own commands run in this process, as in the menu; anything else
// (ship, idea, eng ops) is a child. The terminal is handed over for both, so they can ask questions.
const runFromShell = async (command, args, env) => {
    releaseTerminal(process.stdin);
    if (command === 'eng' && OWN_COMMANDS.includes(args[0] ?? '')) {
        await runCommand(args[0] ?? '', reposDir(), env);
        return;
    }
    if (!live(command, args))
        console.log(paint(PALETTE.warning, `! ${command} did not finish cleanly. Run eng doctor if it is missing.`));
};
const shell = (env) => new Promise((done) => {
    const state = { env };
    const rl = createInterface({ input: process.stdin, output: process.stdout, completer: complete, prompt: prompt(state) });
    const ask = () => {
        rl.setPrompt(prompt(state));
        rl.prompt();
    };
    // Lines are handled one at a time: a command can be slow, and typed-ahead lines wait their turn.
    let queue = Promise.resolve();
    let closed = false;
    const handle = async (line) => {
        const outcome = route(line, state);
        if (outcome.kind === 'exit') {
            rl.close();
            return;
        }
        if (outcome.kind === 'message')
            console.log(paint(PALETTE.muted, outcome.text));
        if (outcome.kind === 'run') {
            rl.pause();
            await runFromShell(outcome.command, outcome.args, env);
            // readline needs the terminal raw (tab, history) and reading again; reclaimTerminal only restarts the read,
            // and releaseTerminal turned raw mode off for the child.
            process.stdin.ref();
            if (process.stdin.isTTY)
                process.stdin.setRawMode(true);
            reclaimTerminal(process.stdin);
            rl.resume();
        }
        if (!closed)
            ask();
    };
    rl.on('line', (line) => {
        queue = queue.then(() => handle(line));
    });
    rl.on('SIGINT', () => {
        process.stdout.write('\n');
        ask();
    });
    rl.on('close', () => {
        closed = true;
        void queue.then(() => {
            process.stdout.write('\n');
            done(0);
        });
    });
    console.log(banner(state));
    ask();
});
// ENG_OPS_TOKEN (a token with only read:org) when set, else `gh auth token`. Captured and never printed. eng ops
// refuses a token that can do more than read teams, so gh's own login token (repo scope) only works once narrowed.
const opsTokenFromEnv = () => Boolean(process.env.ENG_OPS_TOKEN?.trim());
const opsToken = () => process.env.ENG_OPS_TOKEN?.trim() || run('gh', ['auth', 'token']) || undefined;
// gh run as the ops token, so the scopes and teams checked are those of the token that will be sent.
const opsGh = (token, args) => {
    const result = spawn('gh', args, { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return result.status === 0 ? String(result.stdout).trim() : undefined;
};
const opsCredential = () => {
    const token = opsToken();
    return token === undefined ? undefined : { token, scopes: parseScopes(opsGh(token, ['api', '-i', 'user'])) };
};
const opsTeams = () => {
    const token = opsToken();
    const listed = token === undefined ? undefined : opsGh(token, ['api', 'user/teams', '--paginate', '--jq', '.[] | .organization.login + "/" + .slug']);
    return listed
        ?.split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean);
};
// One readline for the whole run: lines are queued, so piped input works and a closed input answers undefined
// instead of hanging. Prompts go to stderr, so stdout stays the result.
const ops = async (argv) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const lines = [];
    const waiting = [];
    let closed = false;
    rl.on('line', (line) => (waiting.shift() ?? ((l) => lines.push(l ?? '')))(line));
    rl.on('close', () => {
        closed = true;
        waiting.splice(0).forEach((resolve) => resolve(undefined));
    });
    const ask = (prompt) => new Promise((resolve) => {
        const queued = lines.shift();
        if (queued !== undefined)
            return resolve(queued);
        if (closed)
            return resolve(undefined);
        waiting.push(resolve);
        rl.setPrompt(prompt);
        rl.prompt();
    });
    // In a terminal readline takes Ctrl-C itself; without this the input closes but a pending request still runs.
    rl.on('SIGINT', () => process.exit(130));
    try {
        return await runOps(argv, {
            env: process.env,
            getToken: opsCredential,
            getTeams: opsTeams,
            ask,
            out: (line) => console.log(line),
            err: (line) => console.error(line),
            interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
            paint: process.stdout.isTTY && !process.env.NO_COLOR ? colour : plain,
        });
    }
    finally {
        rl.close();
    }
};
const runCommand = (command, dir, env, args = []) => {
    if (command === 'ops')
        return ops(args);
    if (command === 'setup')
        return setup(dir);
    if (command === 'update')
        return update(dir);
    if (command === 'doctor')
        return doctor(dir);
    if (command === 'theme')
        return installTheme(dir);
    if (command === 'shell')
        return shell(env);
    return undefined;
};
// Each choice runs with the terminal attached. eng's own commands run in this process: an update replaces the
// install folder this script was started from, so starting it again by path can fail.
const runAction = async (action, env) => {
    console.clear();
    // Ink unrefs stdin when the menu closes; take it back so a command can ask questions without Node exiting.
    process.stdin.ref();
    if (action.command === 'eng') {
        await runCommand(action.args[0] ?? '', reposDir(), env, action.args.slice(1));
        return;
    }
    // ship and idea read the same terminal. Hand it over cooked (echo on) and with no read pending in this
    // process: on Windows a pending console read here swallows the keys typed at their prompts.
    releaseTerminal(process.stdin);
    const ok = live(action.command, action.args);
    reclaimTerminal(process.stdin);
    if (!ok)
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
const launch = async (env) => {
    for (;;) {
        const action = await chooseAction(env);
        if (action.kind === 'quit')
            return 0;
        await runAction(action, env);
        await pressAnyKey();
        console.clear();
    }
};
// Shows the production warning and reads one line. Only the exact word production continues.
const confirmProduction = () => new Promise((done) => {
    console.log(`\n${productionWarning(process.stdout.columns || 80)}\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.question(CONFIRM_PROMPT, (answer) => {
        answered = true;
        rl.close();
        done(isProductionConfirmed(answer));
    });
    rl.on('close', () => {
        if (!answered)
            done(false);
    });
});
const main = async () => {
    // ops takes its own options (--env, --yes and each command's fields), which parseArgs here would reject.
    const isOps = process.argv[2] === 'ops';
    const { values, positionals } = isOps
        ? { values: { dir: undefined, help: false, version: false, production: undefined, env: undefined }, positionals: ['ops'] }
        : parseArgs({
            allowPositionals: true,
            options: {
                dir: { type: 'string' },
                help: { type: 'boolean', short: 'h' },
                version: { type: 'boolean' },
                production: { type: 'boolean' },
                env: { type: 'string' },
            },
        });
    const [command] = positionals;
    if (values.version) {
        console.log(readVersion(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
        return 0;
    }
    const startup = resolveEnvironment(values);
    if (!startup.ok) {
        console.error(`${startup.error}\n\n${HELP}`);
        return 1;
    }
    const { env } = startup;
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    // Update first: updating eng touches no product. When eng itself updated, the new version runs what was asked
    // (flags included) without checking again, so the production warning below is shown once, by that version.
    if (!values.help && shouldCheck(command, process.env, interactive) && (await selfUpdate())) {
        return spawn(installedEng(), process.argv.slice(2), { stdio: 'inherit', env: { ...process.env, ENG_NO_UPDATE: '1' } }).status ?? 1;
    }
    // The warning comes before anything that can reach a product. Anything but production exits quietly.
    if (!values.help && env === 'production' && !(await confirmProduction()))
        return 0;
    // eng ops keeps the session it was started from: ENG_ENV is only set by an eng that resolved its own flags.
    if (!isOps)
        process.env.ENG_ENV = env;
    if (!command && !values.help && process.stdin.isTTY && process.stdout.isTTY)
        return launch(env);
    if (values.help || !command) {
        (values.help ? console.log : console.error)(HELP);
        return values.help ? 0 : 1;
    }
    const dir = values.dir ? resolve(values.dir) : reposDir();
    if (values.dir && command === 'setup')
        saveConfig({ dir });
    const result = runCommand(command, dir, env, isOps ? process.argv.slice(3) : []);
    if (result !== undefined)
        return result;
    console.error(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
};
process.exitCode = await main();

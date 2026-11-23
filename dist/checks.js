export const TOOLS = [
    {
        name: 'Node',
        command: 'node',
        args: ['--version'],
        min: [24, 0, 0],
        showVersion: true,
        required: true,
        fix: 'Re-run the installer, or install Node 24 or later from https://nodejs.org',
    },
    {
        name: 'pnpm',
        command: 'pnpm',
        args: ['--version'],
        min: [10, 0, 0],
        showVersion: true,
        required: true,
        fix: 'Run: npm install -g pnpm@10',
    },
    {
        name: 'git',
        command: 'git',
        args: ['--version'],
        showVersion: true,
        required: true,
        fix: 'Install git from https://git-scm.com/downloads',
    },
    {
        name: 'GitHub CLI',
        command: 'gh',
        args: ['--version'],
        showVersion: true,
        required: true,
        fix: 'Install gh from https://cli.github.com',
    },
    { name: 'ship', command: 'ship', args: ['--version'], showVersion: true, required: true, fix: 'Run: eng update' },
    { name: 'idea', command: 'idea', args: ['--version'], showVersion: true, required: true, fix: 'Run: eng update' },
    {
        name: 'Docker',
        command: 'docker',
        args: ['--version'],
        showVersion: true,
        required: false,
        fix: 'Only adopt-dont-shop needs it: https://docs.docker.com/get-docker/',
    },
    {
        name: 'ffmpeg',
        command: 'ffmpeg',
        args: ['-version'],
        showVersion: false,
        required: false,
        fix: 'Only social-generator needs it: winget install ffmpeg, brew install ffmpeg or sudo apt install ffmpeg',
    },
];
// Python has a different command per platform, so its check is built for the machine it runs on.
export const pythonTool = (command) => ({
    name: 'Python',
    command,
    args: ['--version'],
    min: [3, 10, 0],
    showVersion: true,
    required: false,
    fix: 'Only social-generator needs it: install Python 3.10 or later from https://www.python.org/downloads/, then run eng update',
});
// The tools setup cannot install itself; the installer script does.
export const BASE_TOOLS = ['Node', 'pnpm', 'git', 'GitHub CLI'];
export const parseVersion = (text) => {
    const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined;
};
export const atLeast = (version, min) => {
    const i = version.findIndex((n, k) => n !== min[k]);
    return i === -1 || (version[i] ?? 0) > (min[i] ?? 0);
};
const show = (version) => version?.join('.') ?? 'unknown version';
export const checkTool = (tool, run) => {
    const base = { name: tool.name, required: tool.required };
    const out = run(tool.command, tool.args);
    if (out === undefined)
        return { ...base, ok: false, detail: 'not found', fix: tool.fix };
    const version = parseVersion(out);
    if (tool.min && !(version && atLeast(version, tool.min))) {
        return { ...base, ok: false, detail: `${show(version)}, need ${tool.min.join('.')} or later`, fix: tool.fix };
    }
    return { ...base, ok: true, detail: tool.showVersion ? show(version) : 'installed' };
};
export const checkGitHubLogin = (run) => {
    const ok = run('gh', ['auth', 'status', '--hostname', 'github.com']) !== undefined;
    return ok
        ? { name: 'GitHub login', ok, required: true, detail: 'signed in' }
        : { name: 'GitHub login', ok, required: true, detail: 'not signed in', fix: 'Run: gh auth login' };
};
export const formatResults = (results) => ({
    lines: results.map((r) => {
        const mark = r.ok ? '✓' : r.required ? '✗' : '!';
        return `${mark} ${r.name}: ${r.detail}${r.ok || !r.fix ? '' : `\n    ${r.fix}`}`;
    }),
    ok: results.every((r) => r.ok || !r.required),
});
// The scopes in `gh api -i user` output. undefined when there is no x-oauth-scopes header (gh failed, or a token that
// does not report scopes), so a caller can tell "no scopes" from "could not tell".
export const parseScopes = (headers) => {
    const line = headers?.split('\n').find((l) => /^x-oauth-scopes:/i.test(l));
    return line
        ?.slice(line.indexOf(':') + 1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};
export const ORG_NAME = 'ideaSquared';
// Where to create the eng ops token: a classic token with only read:org, pre-selected.
export const OPS_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=read:org&description=eng%20ops';
const OPS_TOKEN_FIX = `Create a classic token with only read:org at ${OPS_TOKEN_URL}, then set ENG_OPS_TOKEN to it (see "Set up eng ops" in the eng README).`;
// What is wrong with the token eng ops would send, or undefined when it may be sent and can read teams. eng ops sends
// ENG_OPS_TOKEN when set (`fromEnv`), else gh's login token; product servers replay it to GitHub, so it may carry
// read:org and nothing else.
const opsTokenProblem = (scopes, fromEnv) => {
    const name = fromEnv ? 'ENG_OPS_TOKEN' : 'ENG_OPS_TOKEN is not set, and your gh login token';
    if (scopes === undefined)
        return fromEnv ? 'could not read the scopes of ENG_OPS_TOKEN (use a classic token)' : `${name} reports no scopes`;
    const extra = scopes.filter((scope) => scope !== 'read:org');
    if (extra.length > 0)
        return `${name} can do more than read teams (${extra.join(', ')})`;
    return scopes.includes('read:org') ? undefined : `${name} cannot read your GitHub teams (it needs read:org)`;
};
// Whether you can use each product's `eng ops`. `opsRun` runs gh as the token eng ops would send, so the scopes and
// teams checked are that token's; `fromEnv` says whether it is ENG_OPS_TOKEN. Never prints the token.
export const checkOpsAccess = (opsRun, fromEnv, products) => {
    const problem = opsTokenProblem(parseScopes(opsRun('gh', ['api', '-i', 'user'])), fromEnv);
    if (problem !== undefined) {
        return [{ name: 'ops token', ok: false, required: false, detail: problem, fix: OPS_TOKEN_FIX }];
    }
    const listed = opsRun('gh', ['api', 'user/teams', '--paginate', '--jq', '.[] | .organization.login + "/" + .slug']);
    if (listed === undefined) {
        return [{ name: 'ops access', ok: false, required: false, detail: 'could not list your GitHub teams', fix: 'Run: gh auth status' }];
    }
    const teams = new Set(listed.split('\n').map((line) => line.trim().toLowerCase()));
    return products.map(({ name, team }) => teams.has(`${ORG_NAME}/${team}`.toLowerCase())
        ? { name: `ops ${name}`, ok: true, required: false, detail: `in the ${team} team` }
        : {
            name: `ops ${name}`,
            ok: false,
            required: false,
            detail: `not in the ${team} team`,
            fix: `Ask to be added: https://github.com/orgs/${ORG_NAME}/teams/${team}`,
        });
};

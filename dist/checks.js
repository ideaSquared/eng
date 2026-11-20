export const TOOLS = [
    {
        name: 'Node',
        command: 'node',
        args: ['--version'],
        min: [22, 18, 0],
        showVersion: true,
        required: true,
        fix: 'Re-run the installer, or install Node 22.18 or later from https://nodejs.org',
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
    { name: 'ship', command: 'ship', args: ['--help'], showVersion: false, required: true, fix: 'Run: eng update' },
    { name: 'idea', command: 'idea', args: ['--help'], showVersion: false, required: true, fix: 'Run: eng update' },
    {
        name: 'Docker',
        command: 'docker',
        args: ['--version'],
        showVersion: true,
        required: false,
        fix: 'Only adopt-dont-shop needs it: https://docs.docker.com/get-docker/',
    },
];
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
// Whether a GitHub token may read team membership, which every product's ops server checks. `headers` is the output
// of `gh api -i user`; undefined (gh failed) counts as no.
export const canReadTeams = (headers) => {
    const line = headers?.split('\n').find((l) => /^x-oauth-scopes:/i.test(l));
    const scopes = line?.slice(line.indexOf(':') + 1).split(',').map((s) => s.trim()) ?? [];
    return ['read:org', 'write:org', 'admin:org'].some((scope) => scopes.includes(scope));
};
const ORG_NAME = 'ideaSquared';
// Whether you can use each product's `eng ops`: gh must be able to read teams, and you must be in the product's team.
export const checkOpsAccess = (run, products) => {
    if (!canReadTeams(run('gh', ['api', '-i', 'user']))) {
        return [
            {
                name: 'ops access',
                ok: false,
                required: false,
                detail: 'gh cannot read your GitHub teams',
                fix: 'Run: gh auth refresh --hostname github.com --scopes read:org (or eng setup)',
            },
        ];
    }
    const listed = run('gh', ['api', 'user/teams', '--paginate', '--jq', '.[] | .organization.login + "/" + .slug']);
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

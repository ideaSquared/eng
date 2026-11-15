// eng ops: a client for every product that exposes the @ideasquared/ops contract. All the logic lives here, with the
// terminal, the token and the network passed in, so it is tested without any of them. src/cli.ts wires them up.
import { parseArgs } from "./vendor/ops/args.js";
import { fetchCatalog, invoke } from "./vendor/ops/client.js";
import { OpsError } from "./vendor/ops/contract.js";
import { paint, PALETTE } from "./theme.js";
export const OPS_ENVIRONMENTS = ['staging', 'production'];
// adopt-dont-shop is not here: it keeps its own `pnpm ops` for now. pairflix has no deployed URL yet; point it
// anywhere with ENG_OPS_URL_PAIRFLIX_STAGING (or _PRODUCTION) until it has one.
export const OPS_PRODUCTS = [
    {
        name: 'creatrgrid',
        repo: 'ideaSquared/creatrgrid',
        urls: {
            staging: 'https://api-staging.creatrgrid.com/api/v1/ops',
            production: 'https://api.creatrgrid.com/api/v1/ops',
        },
    },
    { name: 'pairflix', repo: 'ideaSquared/pairflix', urls: {} },
];
export const overrideVar = (product, environment) => `ENG_OPS_URL_${product.toUpperCase().replace(/-/g, '_')}_${environment.toUpperCase()}`;
export const resolveUrl = (product, environment, env) => env[overrideVar(product.name, environment)]?.trim() || product.urls[environment];
export const configuredEnvironments = (product, env) => OPS_ENVIRONMENTS.filter((environment) => resolveUrl(product, environment, env) !== undefined);
export const deployedProducts = (env) => OPS_PRODUCTS.filter((product) => configuredEnvironments(product, env).length > 0);
export const colour = (role, text) => paint(PALETTE[role], text);
export const plain = (_role, text) => text;
const isEnvironment = (value) => OPS_ENVIRONMENTS.some((e) => e === value);
// Pulls --env, --yes and --json-output out of the words, wherever they stand, and leaves everything else (and all
// that follows a bare `--`) for the command's own parseArgs.
const extractFlags = (argv) => {
    const flags = { rest: [], env: undefined, yes: false, jsonOutput: false, missingEnv: false };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i] ?? '';
        if (token === '--') {
            flags.rest.push(...argv.slice(i));
            break;
        }
        if (token === '--yes')
            flags.yes = true;
        else if (token === '--json-output')
            flags.jsonOutput = true;
        else if (token.startsWith('--env='))
            flags.env = token.slice('--env='.length);
        else if (token === '--env') {
            const value = argv[i + 1];
            if (value === undefined)
                flags.missingEnv = true;
            else
                flags.env = value;
            i += 1;
        }
        else
            flags.rest.push(token);
    }
    return flags;
};
// The session's environment (ENG_ENV) when it is a valid one, else staging.
export const defaultEnvironment = (env) => {
    const value = env.ENG_ENV;
    return value !== undefined && isEnvironment(value) ? value : 'staging';
};
// session: the environment an eng session fixed (ENG_ENV). Inside one, --env may only repeat it.
export const routeOps = (argv, fallback = 'staging', session) => {
    const { rest, env, yes, jsonOutput, missingEnv } = extractFlags(argv);
    if (missingEnv)
        return { kind: 'error', message: '--env needs a value: staging or production' };
    const environment = env ?? fallback;
    if (!isEnvironment(environment))
        return { kind: 'error', message: `--env must be staging or production, not '${environment}'` };
    if (session !== undefined && environment !== session) {
        return {
            kind: 'error',
            message: `This eng session is fixed to ${session}, so --env ${environment} is refused. Start eng${environment === 'production' ? ' --production' : ''} for ${environment}.`,
        };
    }
    const [product, second, third] = rest;
    if (product === undefined || product === '--help' || product === '-h')
        return { kind: 'products' };
    if (product.startsWith('-'))
        return { kind: 'error', message: `Unknown option ${product}. Usage: eng ops <product> [<group> <name>] [args...]` };
    if (second === undefined)
        return { kind: 'catalog', product: product.toLowerCase(), environment, jsonOutput };
    if (second.startsWith('-')) {
        return { kind: 'error', message: `Put the command before its options: eng ops ${product} <group> <name> ${second}` };
    }
    const dotted = second.includes('.');
    if (!dotted && (third === undefined || third.startsWith('-'))) {
        return { kind: 'error', message: `Missing the command name: eng ops ${product} ${second} <name>` };
    }
    return {
        kind: 'command',
        product: product.toLowerCase(),
        environment,
        commandId: dotted ? second : `${second}.${third}`,
        args: rest.slice(dotted ? 2 : 3),
        yes,
        jsonOutput,
    };
};
// Staging asks y/N, which --yes skips. Production always asks for the product name: --yes never skips that.
export const confirmationFor = (environment, product, commandId, yes) => {
    if (environment === 'production') {
        return {
            kind: 'typed',
            warning: `WARNING: ${commandId} will run on ${product} PRODUCTION.`,
            prompt: `Type ${product} to continue: `,
            expected: product,
        };
    }
    return yes ? undefined : { kind: 'yesno', prompt: `Run ${commandId} on ${product} staging? [y/N] ` };
};
// An empty or missing answer (input closed) never confirms.
export const isConfirmed = (confirmation, answer) => {
    const text = (answer ?? '').trim();
    return confirmation.kind === 'typed' ? text === confirmation.expected : /^y(es)?$/i.test(text);
};
// ---- output --------------------------------------------------------------------------------------------------
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const scalar = (value) => {
    if (value === null || value === undefined)
        return '-';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
};
const isRecordList = (value) => Array.isArray(value) && value.length > 0 && value.every(isRecord);
const formatTable = (rows, p) => {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => scalar(row[column]).length)));
    const line = (cells, role) => cells
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join('  ')
        .trimEnd()
        .replace(/^.*$/, (text) => (role ? p(role, text) : text));
    return [line(columns, 'muted'), ...rows.map((row) => line(columns.map((column) => scalar(row[column]))))];
};
const indentAll = (lines, by) => lines.map((l) => `${by}${l}`);
// key: value lines, arrays of records as small tables, nested records indented.
export const formatResult = (result, p = plain) => {
    if (isRecordList(result))
        return formatTable(result, p);
    if (Array.isArray(result))
        return result.length === 0 ? ['(none)'] : result.map((item) => `- ${scalar(item)}`);
    if (!isRecord(result))
        return [scalar(result)];
    return Object.entries(result).flatMap(([key, value]) => {
        const label = p('muted', `${key}:`);
        if (isRecordList(value))
            return [label, ...indentAll(formatTable(value, p), '  ')];
        if (isRecord(value))
            return Object.keys(value).length === 0 ? [`${label} (none)`] : [label, ...indentAll(formatResult(value, p), '  ')];
        if (Array.isArray(value))
            return [`${label} ${value.length === 0 ? '(none)' : value.map(scalar).join(', ')}`];
        return [`${label} ${scalar(value)}`];
    });
};
// The summary line first, then the result.
export const formatResponse = (response, p = plain) => [
    ...(response.summary === undefined ? [] : [p('success', response.summary)]),
    ...formatResult(response.result, p),
];
export const formatHeader = (product, environment, commandId, p = plain) => [
    p('primary', `ops ${product}`),
    p(environment === 'production' ? 'danger' : 'info', environment),
    ...(commandId === undefined ? [] : [commandId]),
].join(' · ');
const commandLine = (command, idWidth, number, p) => `  ${number}${command.id.padEnd(idWidth)}  ${p(command.kind === 'write' ? 'warning' : 'muted', command.kind.padEnd(5))}  ${command.summary}`;
const groupsOf = (commands) => {
    const groups = [...new Set(commands.map((c) => c.group))];
    return groups.map((group) => [group, commands.filter((c) => c.group === group)]);
};
// Commands grouped by group: id, read or write, summary. `numbered` adds the numbers the picker asks for.
export const formatCatalog = (catalog, p = plain, numbered = false) => {
    const idWidth = Math.max(0, ...catalog.commands.map((c) => c.id.length));
    const numberWidth = String(catalog.commands.length).length + 2;
    return groupsOf(catalog.commands).flatMap(([group, commands]) => [
        '',
        p('accent', group),
        ...commands.map((command) => commandLine(command, idWidth, numbered ? `${String(catalog.commands.indexOf(command) + 1)}.`.padEnd(numberWidth) : '', p)),
    ]);
};
export const formatProducts = (env, p = plain) => {
    const nameWidth = Math.max(...OPS_PRODUCTS.map((product) => product.name.length));
    return [
        ...OPS_PRODUCTS.map((product) => {
            const environments = configuredEnvironments(product, env);
            const detail = environments.length > 0 ? environments.join(', ') : p('muted', 'not deployed yet');
            return `${p('primary', product.name.padEnd(nameWidth))}  ${detail}`;
        }),
        '',
        p('muted', 'Usage: eng ops <product> [--env staging|production]'),
        p('muted', '       eng ops <product> <group> <name> [args...] [--yes] [--json-output]'),
        p('muted', 'adopt-dont-shop keeps its own `pnpm ops` and is not listed here.'),
        p('muted', 'The environment is ENG_ENV (staging unless eng --production); --env overrides it.'),
        p('muted', 'Point a product anywhere with ENG_OPS_URL_<PRODUCT>_<STAGING|PRODUCTION>.'),
    ];
};
// ---- errors --------------------------------------------------------------------------------------------------
export const describeError = (error, product, url) => {
    if (!(error instanceof OpsError)) {
        return `Could not reach ${url}: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
    switch (error.code) {
        case 'unauthenticated':
            return 'GitHub did not accept your sign-in. Run: gh auth login (or eng setup)';
        case 'forbidden':
            return `You need write access to ${product?.repo ?? 'the product repo'} on GitHub`;
        case 'not_found':
            return `The product does not know that command. Run: eng ops ${product?.name ?? '<product>'} to list its commands`;
        case 'invalid_argument':
            return `Invalid arguments: ${error.message}`;
        case 'internal':
            return `The ops server failed: ${error.message}`;
    }
};
export const NOT_SIGNED_IN = 'Not signed in to GitHub. Run: gh auth login (or eng setup)';
const fieldPrompt = (field, p) => {
    const kind = field.type === 'enum' ? `one of: ${(field.values ?? []).join(' | ')}` : field.type === 'boolean' ? 'y/n' : field.type;
    const need = field.required ? 'required' : 'optional, enter to skip';
    return `${field.name} ${p('muted', `(${kind}; ${need})`)}${field.description === '' ? '' : ` ${p('muted', field.description)}`}: `;
};
const toWord = (field, answer) => {
    if (field.type !== 'boolean')
        return answer;
    return /^(y|yes|true)$/i.test(answer) ? 'true' : /^(n|no|false)$/i.test(answer) ? 'false' : answer;
};
// Asks for a field until a required one is answered. undefined: skipped, or the input closed (closed is true).
const askField = async (field, deps) => {
    const answer = await deps.ask(fieldPrompt(field, deps.paint));
    if (answer === undefined)
        return { closed: true };
    const text = answer.trim();
    if (text !== '')
        return { word: `--${field.name}=${toWord(field, text)}` };
    return field.required ? askField(field, deps) : {};
};
const askFields = async (fields, deps) => {
    const words = [];
    for (const field of fields) {
        const { word, closed } = await askField(field, deps);
        if (closed)
            return undefined;
        if (word !== undefined)
            words.push(word);
    }
    return words;
};
const findCommand = (catalog, answer) => {
    const text = answer.trim().replace(/\s+/g, '.');
    const byNumber = /^\d+$/.test(text) ? catalog.commands[Number(text) - 1] : undefined;
    return byNumber ?? catalog.commands.find((command) => command.id === text);
};
// Numbered list, then one prompt per field. Blank or closed input quits.
export const pickCommand = async (catalog, deps) => {
    deps.out(formatCatalog(catalog, deps.paint, true).join('\n'));
    deps.out('');
    for (;;) {
        const answer = await deps.ask('Pick a command by number or id (enter to quit): ');
        if (answer === undefined || answer.trim() === '')
            return undefined;
        const command = findCommand(catalog, answer);
        if (command) {
            const words = await askFields(command.fields, deps);
            return words === undefined ? undefined : { command, words };
        }
        deps.out(deps.paint('warning', `No command '${answer.trim()}'.`));
    }
};
const executeCommand = async (target, command, words, deps) => {
    const { product, environment, url, token, yes, jsonOutput } = target;
    const p = deps.paint;
    const args = parseArgs(command, words);
    // Human lines go to stderr under --json-output, so stdout is only the JSON result.
    const note = jsonOutput ? deps.err : deps.out;
    const show = (response) => deps.out(jsonOutput ? JSON.stringify(response.result, null, 2) : formatResponse(response, p).join('\n'));
    const call = (mode) => invoke(url, token, { command: command.id, args, mode }, deps.fetch);
    note(formatHeader(product.name, environment, command.id, p));
    if (command.kind === 'read') {
        show(await call('run'));
        return 0;
    }
    if (command.dryRun) {
        note(p('warning', 'Preview (nothing has changed yet):'));
        show(await call('preview'));
    }
    else {
        note(p('warning', `No preview available for ${command.id}.`));
    }
    const confirmation = confirmationFor(environment, product.name, command.id, yes);
    if (confirmation) {
        if (confirmation.kind === 'typed')
            note(p('danger', confirmation.warning));
        if (!isConfirmed(confirmation, await deps.ask(confirmation.prompt))) {
            note(p('muted', 'Aborted. Nothing was run.'));
            return 1;
        }
    }
    show(await call('run'));
    return 0;
};
export const runOps = async (argv, deps) => {
    const p = deps.paint;
    const session = deps.env.ENG_ENV !== undefined && isEnvironment(deps.env.ENG_ENV) ? deps.env.ENG_ENV : undefined;
    const route = routeOps(argv, defaultEnvironment(deps.env), session);
    if (route.kind === 'error') {
        deps.err(route.message);
        return 1;
    }
    if (route.kind === 'products') {
        deps.out(formatProducts(deps.env, p).join('\n'));
        return 0;
    }
    const product = OPS_PRODUCTS.find((candidate) => candidate.name === route.product);
    if (!product) {
        deps.err(`Unknown product '${route.product}'. Products: ${OPS_PRODUCTS.map((candidate) => candidate.name).join(', ')}`);
        return 1;
    }
    const url = resolveUrl(product, route.environment, deps.env);
    if (url === undefined) {
        const hint = `set ${overrideVar(product.name, route.environment)} to point it somewhere`;
        deps.err(`${product.name} is not deployed to ${route.environment} yet: ${hint}`);
        return 1;
    }
    const token = deps.getToken();
    if (token === undefined) {
        deps.err(NOT_SIGNED_IN);
        return 1;
    }
    const yes = route.kind === 'command' && route.yes;
    const target = { product, environment: route.environment, url, token, yes, jsonOutput: route.jsonOutput };
    try {
        const catalog = await fetchCatalog(url, token, deps.fetch);
        if (route.kind === 'command') {
            const command = catalog.commands.find((candidate) => candidate.id === route.commandId);
            if (!command) {
                deps.err(`${product.name} has no command '${route.commandId}'. Run: eng ops ${product.name} to list its commands`);
                return 1;
            }
            return await executeCommand(target, command, route.args, deps);
        }
        if (route.jsonOutput) {
            deps.out(JSON.stringify(catalog, null, 2));
            return 0;
        }
        deps.out(formatHeader(product.name, route.environment, undefined, p));
        if (!deps.interactive) {
            deps.out(formatCatalog(catalog, p).join('\n'));
            return 0;
        }
        const picked = await pickCommand(catalog, deps);
        return picked ? await executeCommand(target, picked.command, picked.words, deps) : 0;
    }
    catch (error) {
        deps.err(describeError(error, product, url));
        return 1;
    }
};

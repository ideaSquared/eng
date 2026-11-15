// eng ops: a client for every product that exposes the @ideasquared/ops contract. All the logic lives here, with the
// terminal, the token and the network passed in, so it is tested without any of them. src/cli.ts wires them up.
import { parseArgs } from './vendor/ops/args.ts';
import { fetchCatalog, invoke } from './vendor/ops/client.ts';
import type { Fetch } from './vendor/ops/client.ts';
import { OpsError } from './vendor/ops/contract.ts';
import type { Catalog, Command, Field, InvokeResponse } from './vendor/ops/contract.ts';
import { paint, PALETTE } from './theme.ts';

export const OPS_ENVIRONMENTS = ['staging', 'production'] as const;
export type OpsEnvironment = (typeof OPS_ENVIRONMENTS)[number];

// `team` is the ideaSquared GitHub team the product's server checks every request against.
export type OpsProduct = { name: string; repo: string; team: string; urls: Partial<Record<OpsEnvironment, string>> };

// pairflix has no deployed URL yet; point it anywhere with ENG_OPS_URL_PAIRFLIX_STAGING (or _PRODUCTION) until it
// has one. ads serves only the shared contract here; unlocks and history stay in adopt-dont-shop's `pnpm ops`.
export const OPS_PRODUCTS: readonly OpsProduct[] = [
  {
    name: 'creatrgrid',
    repo: 'ideaSquared/creatrgrid',
    team: 'creatrgrid',
    urls: {
      staging: 'https://api-staging.creatrgrid.com/api/v1/ops',
      production: 'https://api.creatrgrid.com/api/v1/ops',
    },
  },
  { name: 'pairflix', repo: 'ideaSquared/pairflix', team: 'pairflix', urls: {} },
  {
    name: 'ads',
    repo: 'ideaSquared/adopt-dont-shop',
    team: 'adoptdontshop',
    urls: {
      staging: 'https://staging-api.adoptdontshop.app/ops/v1',
      production: 'https://api.adoptdontshop.app/ops/v1',
    },
  },
];

export type Env = Readonly<Record<string, string | undefined>>;

export const overrideVar = (product: string, environment: OpsEnvironment): string =>
  `ENG_OPS_URL_${product.toUpperCase().replace(/-/g, '_')}_${environment.toUpperCase()}`;

export const resolveUrl = (product: OpsProduct, environment: OpsEnvironment, env: Env): string | undefined =>
  env[overrideVar(product.name, environment)]?.trim() || product.urls[environment];

export const configuredEnvironments = (product: OpsProduct, env: Env): OpsEnvironment[] =>
  OPS_ENVIRONMENTS.filter((environment) => resolveUrl(product, environment, env) !== undefined);

export const deployedProducts = (env: Env): OpsProduct[] =>
  OPS_PRODUCTS.filter((product) => configuredEnvironments(product, env).length > 0);

// Colours come from PALETTE only. `plain` is for pipes and NO_COLOR.
type Role = 'primary' | 'accent' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
export type Painter = (role: Role, text: string) => string;
export const colour: Painter = (role, text) => paint(PALETTE[role], text);
export const plain: Painter = (_role, text) => text;

// ---- argv routing --------------------------------------------------------------------------------------------

export type OpsRoute =
  | { kind: 'products' }
  | { kind: 'catalog'; product: string; environment: OpsEnvironment; jsonOutput: boolean }
  | { kind: 'find'; environment: OpsEnvironment; words: string[] }
  | { kind: 'command'; product: string; environment: OpsEnvironment; commandId: string; args: string[]; yes: boolean; jsonOutput: boolean }
  | { kind: 'error'; message: string };

const isEnvironment = (value: string): value is OpsEnvironment => OPS_ENVIRONMENTS.some((e) => e === value);

type Flags = { rest: string[]; env: string | undefined; yes: boolean; jsonOutput: boolean; missingEnv: boolean };

// Pulls --env, --yes and --json-output out of the words, wherever they stand, and leaves everything else (and all
// that follows a bare `--`) for the command's own parseArgs.
const extractFlags = (argv: readonly string[]): Flags => {
  const flags: Flags = { rest: [], env: undefined, yes: false, jsonOutput: false, missingEnv: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (token === '--') {
      flags.rest.push(...argv.slice(i));
      break;
    }
    if (token === '--yes') flags.yes = true;
    else if (token === '--json-output') flags.jsonOutput = true;
    else if (token.startsWith('--env=')) flags.env = token.slice('--env='.length);
    else if (token === '--env') {
      const value = argv[i + 1];
      if (value === undefined) flags.missingEnv = true;
      else flags.env = value;
      i += 1;
    } else flags.rest.push(token);
  }
  return flags;
};

// The session's environment (ENG_ENV) when it is a valid one, else staging.
export const defaultEnvironment = (env: Env): OpsEnvironment => {
  const value = env.ENG_ENV;
  return value !== undefined && isEnvironment(value) ? value : 'staging';
};

// session: the environment an eng session fixed (ENG_ENV). Inside one, --env may only repeat it.
export const routeOps = (argv: readonly string[], fallback: OpsEnvironment = 'staging', session?: OpsEnvironment): OpsRoute => {
  const { rest, env, yes, jsonOutput, missingEnv } = extractFlags(argv);
  if (missingEnv) return { kind: 'error', message: '--env needs a value: staging or production' };
  const environment = env ?? fallback;
  if (!isEnvironment(environment)) return { kind: 'error', message: `--env must be staging or production, not '${environment}'` };
  if (session !== undefined && environment !== session) {
    return {
      kind: 'error',
      message: `This eng session is fixed to ${session}, so --env ${environment} is refused. Start eng${environment === 'production' ? ' --production' : ''} for ${environment}.`,
    };
  }
  const [product, second, third] = rest;
  if (product === undefined || product === '--help' || product === '-h') return { kind: 'products' };
  if (product.startsWith('-')) return { kind: 'error', message: `Unknown option ${product}. Usage: eng ops <product> [<group> <name>] [args...]` };
  if (product === 'find') {
    const words = rest.slice(1);
    return words.length === 0 ? { kind: 'error', message: 'Usage: eng ops find <words...>' } : { kind: 'find', environment, words };
  }
  if (second === undefined) return { kind: 'catalog', product: product.toLowerCase(), environment, jsonOutput };
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

// ---- confirmation --------------------------------------------------------------------------------------------

export type Confirmation =
  | { kind: 'yesno'; prompt: string }
  | { kind: 'typed'; warning: string; prompt: string; expected: string };

// Staging asks y/N, which --yes skips. Production always asks for the product name: --yes never skips that.
export const confirmationFor = (environment: OpsEnvironment, product: string, commandId: string, yes: boolean): Confirmation | undefined => {
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
export const isConfirmed = (confirmation: Confirmation, answer: string | undefined): boolean => {
  const text = (answer ?? '').trim();
  return confirmation.kind === 'typed' ? text === confirmation.expected : /^y(es)?$/i.test(text);
};

// ---- search --------------------------------------------------------------------------------------------------

export const searchWords = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

const searchText = (command: Command): string =>
  [command.id, command.group, command.name, command.summary, ...command.fields.flatMap((field) => [field.name, field.description])]
    .join('\n')
    .toLowerCase();

// A command matches when every word appears (any case) in its id, group, name, summary, or field names and descriptions.
export const commandMatches = (command: Command, words: readonly string[]): boolean => {
  const text = searchText(command);
  return words.every((word) => text.includes(word.toLowerCase()));
};

export const filterCommands = (commands: readonly Command[], words: readonly string[]): Command[] =>
  commands.filter((command) => commandMatches(command, words));

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type ProductCommands = { product: string; commands: readonly Command[] };

// Matches grouped by product, ordered by product then command id. Products with no match are left out.
export const findCommands = (entries: readonly ProductCommands[], words: readonly string[]): ProductCommands[] =>
  [...entries]
    .sort((a, b) => byText(a.product, b.product))
    .map(({ product, commands }) => ({ product, commands: [...filterCommands(commands, words)].sort((a, b) => byText(a.id, b.id)) }))
    .filter(({ commands }) => commands.length > 0);

const fieldWord = (field: Field): string | undefined => {
  if (field.positional) return field.required ? `<${field.name}>` : `[${field.name}]`;
  return field.required ? `--${field.name}=<${field.name}>` : undefined;
};

// The line that runs a command: positional fields as <name> ([name] when optional), required options as --name=<name>,
// then the environment that was searched, so copying the line never lands somewhere else (staging by default).
export const runLine = (product: string, command: Command, environment: OpsEnvironment): string => {
  const words = [...command.fields.filter((f) => f.positional), ...command.fields.filter((f) => !f.positional)].flatMap((f) => fieldWord(f) ?? []);
  return ['eng', 'ops', product, command.group, command.name, ...words, '--env', environment].join(' ');
};

export const formatFind = (matches: readonly ProductCommands[], environment: OpsEnvironment, p: Painter = plain): string[] =>
  matches.flatMap(({ product, commands }) => {
    const idWidth = Math.max(...commands.map((command) => command.id.length));
    return [
      '',
      p('accent', product),
      ...commands.flatMap((command) => [
        `  ${command.id.padEnd(idWidth)}  ${p(command.kind === 'write' ? 'warning' : 'muted', command.kind.padEnd(5))}  ${command.summary}`,
        `    ${runLine(product, command, environment)}`,
      ]),
    ];
  });

// ---- output --------------------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const scalar = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const isRecordList = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.length > 0 && value.every(isRecord);

const formatTable = (rows: readonly Record<string, unknown>[], p: Painter): string[] => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => scalar(row[column]).length)));
  const line = (cells: readonly string[], role?: Role) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd()
      .replace(/^.*$/, (text) => (role ? p(role, text) : text));
  return [line(columns, 'muted'), ...rows.map((row) => line(columns.map((column) => scalar(row[column]))))];
};

const indentAll = (lines: readonly string[], by: string): string[] => lines.map((l) => `${by}${l}`);

// key: value lines, arrays of records as small tables, nested records indented.
export const formatResult = (result: unknown, p: Painter = plain): string[] => {
  if (isRecordList(result)) return formatTable(result, p);
  if (Array.isArray(result)) return result.length === 0 ? ['(none)'] : result.map((item) => `- ${scalar(item)}`);
  if (!isRecord(result)) return [scalar(result)];
  return Object.entries(result).flatMap(([key, value]): string[] => {
    const label = p('muted', `${key}:`);
    if (isRecordList(value)) return [label, ...indentAll(formatTable(value, p), '  ')];
    if (isRecord(value)) return Object.keys(value).length === 0 ? [`${label} (none)`] : [label, ...indentAll(formatResult(value, p), '  ')];
    if (Array.isArray(value)) return [`${label} ${value.length === 0 ? '(none)' : value.map(scalar).join(', ')}`];
    return [`${label} ${scalar(value)}`];
  });
};

// The summary line first, then the result.
export const formatResponse = (response: InvokeResponse, p: Painter = plain): string[] => [
  ...(response.summary === undefined ? [] : [p('success', response.summary)]),
  ...formatResult(response.result, p),
];

export const formatHeader = (product: string, environment: OpsEnvironment, commandId: string | undefined, p: Painter = plain): string =>
  [
    p('primary', `ops ${product}`),
    p(environment === 'production' ? 'danger' : 'info', environment),
    ...(commandId === undefined ? [] : [commandId]),
  ].join(' · ');

const commandLine = (command: Command, idWidth: number, number: string, p: Painter): string =>
  `  ${number}${command.id.padEnd(idWidth)}  ${p(command.kind === 'write' ? 'warning' : 'muted', command.kind.padEnd(5))}  ${command.summary}`;

const groupsOf = (commands: readonly Command[]): Array<[string, Command[]]> => {
  const groups = [...new Set(commands.map((c) => c.group))];
  return groups.map((group) => [group, commands.filter((c) => c.group === group)]);
};

// Commands grouped by group: id, read or write, summary. `numbered` adds the numbers the picker asks for.
// `shown` limits the list to some of the commands; they keep their numbers in the whole catalog.
export const formatCatalog = (catalog: Catalog, p: Painter = plain, numbered = false, shown: readonly Command[] = catalog.commands): string[] => {
  const idWidth = Math.max(0, ...catalog.commands.map((c) => c.id.length));
  const numberWidth = String(catalog.commands.length).length + 2;
  return groupsOf(shown).flatMap(([group, commands]) => [
    '',
    p('accent', group),
    ...commands.map((command) =>
      commandLine(command, idWidth, numbered ? `${String(catalog.commands.indexOf(command) + 1)}.`.padEnd(numberWidth) : '', p),
    ),
  ]);
};

export const formatProducts = (env: Env, p: Painter = plain): string[] => {
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
    p('muted', '       eng ops find <words...>   search every product\'s commands'),
    p('muted', 'ads: unlocks and history stay in `pnpm ops` in adopt-dont-shop.'),
    p('muted', 'The environment is ENG_ENV (staging unless eng --production); --env overrides it.'),
    p('muted', 'Point a product anywhere with ENG_OPS_URL_<PRODUCT>_<STAGING|PRODUCTION>.'),
  ];
};

// ---- errors --------------------------------------------------------------------------------------------------

export const describeError = (error: unknown, product: OpsProduct | undefined, url: string): string => {
  if (!(error instanceof OpsError)) {
    return `Could not reach ${url}: ${error instanceof Error ? error.message : 'unknown error'}`;
  }
  switch (error.code) {
    case 'unauthenticated':
      return 'GitHub did not accept your sign-in. Run: gh auth login (or eng setup)';
    case 'forbidden':
      return product === undefined
        ? 'You need to be in the product team on GitHub'
        : `You need to be in the ${product.team} team on GitHub: https://github.com/orgs/ideaSquared/teams/${product.team}`;
    case 'not_found':
      return `The product does not know that command. Run: eng ops ${product?.name ?? '<product>'} to list its commands`;
    case 'invalid_argument':
      return `Invalid arguments: ${error.message}`;
    case 'internal':
      return `The ops server failed: ${error.message}`;
  }
};

export const NOT_SIGNED_IN = 'Not signed in to GitHub. Run: gh auth login (or eng setup)';

// ---- the flow ------------------------------------------------------------------------------------------------

export type OpsDeps = {
  env: Env;
  fetch?: Fetch;
  // The GitHub token (`gh auth token`), or undefined when gh is not signed in. Never printed.
  getToken: () => string | undefined;
  // Asks one question. undefined means the input is closed.
  ask: (prompt: string) => Promise<string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  interactive: boolean;
  paint: Painter;
};

const fieldPrompt = (field: Field, p: Painter): string => {
  const kind = field.type === 'enum' ? `one of: ${(field.values ?? []).join(' | ')}` : field.type === 'boolean' ? 'y/n' : field.type;
  const need = field.required ? 'required' : 'optional, enter to skip';
  return `${field.name} ${p('muted', `(${kind}; ${need})`)}${field.description === '' ? '' : ` ${p('muted', field.description)}`}: `;
};

const toWord = (field: Field, answer: string): string => {
  if (field.type !== 'boolean') return answer;
  return /^(y|yes|true)$/i.test(answer) ? 'true' : /^(n|no|false)$/i.test(answer) ? 'false' : answer;
};

// Asks for a field until a required one is answered. undefined: skipped, or the input closed (closed is true).
const askField = async (field: Field, deps: OpsDeps): Promise<{ word?: string; closed?: true }> => {
  const answer = await deps.ask(fieldPrompt(field, deps.paint));
  if (answer === undefined) return { closed: true };
  const text = answer.trim();
  if (text !== '') return { word: `--${field.name}=${toWord(field, text)}` };
  return field.required ? askField(field, deps) : {};
};

const askFields = async (fields: readonly Field[], deps: OpsDeps): Promise<string[] | undefined> => {
  const words: string[] = [];
  for (const field of fields) {
    const { word, closed } = await askField(field, deps);
    if (closed) return undefined;
    if (word !== undefined) words.push(word);
  }
  return words;
};

const findCommand = (catalog: Catalog, answer: string): Command | undefined => {
  const text = answer.trim().replace(/\s+/g, '.');
  const byNumber = /^\d+$/.test(text) ? catalog.commands[Number(text) - 1] : undefined;
  return byNumber ?? catalog.commands.find((command) => command.id === text);
};

// Numbered list, then one prompt per field. The prompt takes a number or id, or words that filter the list: the
// matches are shown with their numbers in the whole list, and a single match is shown the same way (enter its
// number to pick it). Enter on a filtered list shows the whole list again; enter on the whole list, or closed input, quits.
export const pickCommand = async (catalog: Catalog, deps: OpsDeps): Promise<{ command: Command; words: string[] } | undefined> => {
  const show = (shown: readonly Command[]) => deps.out(formatCatalog(catalog, deps.paint, true, shown).join('\n') + '\n');
  show(catalog.commands);
  for (let filtered = false; ; ) {
    const answer = await deps.ask(
      filtered
        ? 'Pick a number or id, type words to filter again (enter to show all): '
        : 'Pick a command by number or id, or type words to filter (enter to quit): ',
    );
    if (answer === undefined) return undefined;
    if (answer.trim() === '') {
      if (!filtered) return undefined;
      show(catalog.commands);
      filtered = false;
      continue;
    }
    const command = findCommand(catalog, answer);
    if (command) {
      const words = await askFields(command.fields, deps);
      return words === undefined ? undefined : { command, words };
    }
    const matches = filterCommands(catalog.commands, searchWords(answer));
    if (matches.length === 0) {
      deps.out(deps.paint('warning', `No command matches '${answer.trim()}'.`));
      continue;
    }
    show(matches);
    filtered = true;
  }
};

type Target = { product: OpsProduct; environment: OpsEnvironment; url: string; token: string; yes: boolean; jsonOutput: boolean };

const executeCommand = async (target: Target, command: Command, words: readonly string[], deps: OpsDeps): Promise<number> => {
  const { product, environment, url, token, yes, jsonOutput } = target;
  const p = deps.paint;
  const args = parseArgs(command, words);
  // Human lines go to stderr under --json-output, so stdout is only the JSON result.
  const note = jsonOutput ? deps.err : deps.out;
  const show = (response: InvokeResponse) =>
    deps.out(jsonOutput ? JSON.stringify(response.result, null, 2) : formatResponse(response, p).join('\n'));
  const call = (mode: 'run' | 'preview') => invoke(url, token, { command: command.id, args, mode }, deps.fetch);

  note(formatHeader(product.name, environment, command.id, p));
  if (command.kind === 'read') {
    show(await call('run'));
    return 0;
  }
  if (command.dryRun) {
    note(p('warning', 'Preview (nothing has changed yet):'));
    show(await call('preview'));
  } else {
    note(p('warning', `No preview available for ${command.id}.`));
  }
  const confirmation = confirmationFor(environment, product.name, command.id, yes);
  if (confirmation) {
    if (confirmation.kind === 'typed') note(p('danger', confirmation.warning));
    if (!isConfirmed(confirmation, await deps.ask(confirmation.prompt))) {
      note(p('muted', 'Aborted. Nothing was run.'));
      return 1;
    }
  }
  show(await call('run'));
  return 0;
};

// eng ops find: every product with a URL for the environment, fetched in parallel. A product that fails costs one
// muted line (on stderr) and does not stop the others.
const findAcross = async (environment: OpsEnvironment, words: readonly string[], deps: OpsDeps): Promise<number> => {
  const p = deps.paint;
  const targets = OPS_PRODUCTS.flatMap((product) => {
    const url = resolveUrl(product, environment, deps.env);
    return url === undefined ? [] : [{ product, url }];
  });
  if (targets.length === 0) {
    deps.err(`No product has an ops URL for ${environment} yet.`);
    return 1;
  }
  const token = deps.getToken();
  if (token === undefined) {
    deps.err(NOT_SIGNED_IN);
    return 1;
  }
  const loaded = await Promise.all(
    targets.map(async ({ product, url }) => {
      try {
        return { entry: { product: product.name, commands: (await fetchCatalog(url, token, deps.fetch)).commands } };
      } catch (error) {
        return { failure: `${product.name}: ${describeError(error, product, url)}` };
      }
    }),
  );
  loaded.forEach((result) => result.failure !== undefined && deps.err(p('muted', result.failure)));
  const entries = loaded.flatMap((result) => result.entry ?? []);
  if (entries.length === 0) {
    deps.err('Could not search any product.');
    return 1;
  }
  const matches = findCommands(entries, words);
  deps.out(formatHeader('find', environment, words.join(' '), p));
  if (matches.length === 0) {
    deps.out(`No commands match '${words.join(' ')}' in ${entries.map((entry) => entry.product).join(', ')}.`);
    return 0;
  }
  deps.out(formatFind(matches, environment, p).join('\n'));
  return 0;
};

export const runOps = async (argv: readonly string[], deps: OpsDeps): Promise<number> => {
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
  if (route.kind === 'find') return findAcross(route.environment, route.words, deps);
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
  const target: Target = { product, environment: route.environment, url, token, yes, jsonOutput: route.jsonOutput };

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
  } catch (error) {
    deps.err(describeError(error, product, url));
    return 1;
  }
};

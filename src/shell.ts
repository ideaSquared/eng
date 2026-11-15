// The logic behind `eng shell`: a prompt where short words route to ship, idea and eng. Pure: src/cli.ts wires it to
// the terminal. Nothing here starts a process, and nothing here ever adds --yes: production safety stays with ship.
import { IDEA_PROJECTS, SHIP_PRODUCTS } from './menu.ts';
import { ENVIRONMENTS, envStyle, fixedMessage, isEnvironment, mismatchMessage, namedEnvironments, type Environment } from './session.ts';
import { paint, PALETTE } from './theme.ts';

export type ShellState = { readonly env: Environment };

export type Outcome =
  | { kind: 'run'; command: 'eng' | 'ship' | 'idea'; args: string[] }
  | { kind: 'message'; text: string }
  | { kind: 'empty' }
  | { kind: 'exit' };

const message = (text: string): Outcome => ({ kind: 'message', text });
const run = (command: 'eng' | 'ship' | 'idea', args: string[]): Outcome => ({ kind: 'run', command, args });

export const HELP_TEXT = `  deploy <product> [env]      ship deploy <product> <env>
  redeploy <product> [env]    ship deploy <product> <env> --redeploy
  rollback <product> [env]    ship rollback <product> <env>
  status                      ship status
  logs <project> [env]        idea logs <project> --env <env>
  runs <project>              idea runs <project> --failed
  ops <...>                   eng ops <...>
  doctor | update | theme     eng's own commands
  ship <...> | idea <...>     run that tool as typed
  env                         show the session's environment (fixed at startup)
  help                        this list
  exit | quit | Ctrl-D        leave the shell

The environment is fixed for the session: eng starts in staging, eng --production starts in production.
When a command names no env, the session's is used; naming a different one is refused. Production deploys still ask you to type the product name.`;

const usage = (text: string): Outcome => message(`usage: ${text}`);

// deploy | redeploy | rollback: <product> [env], with env defaulting to the current one.
const shipProduct = (verb: string, rest: string[], state: ShellState): Outcome => {
  const [product, env, ...extra] = rest;
  const form = `${verb} <product> [staging|production]`;
  if (!product || extra.length > 0) return usage(form);
  if (env !== undefined && !isEnvironment(env)) return usage(form);
  if (env !== undefined && env !== state.env) return message(mismatchMessage(state.env, env));
  const target = state.env;
  if (verb === 'rollback') return run('ship', ['rollback', product, target]);
  return run('ship', ['deploy', product, target, ...(verb === 'redeploy' ? ['--redeploy'] : [])]);
};

const logs = (rest: string[], state: ShellState): Outcome => {
  const [project, env, ...extra] = rest;
  const form = 'logs <project> [staging|production]';
  if (!project || extra.length > 0) return usage(form);
  if (env !== undefined && !isEnvironment(env)) return usage(form);
  if (env !== undefined && env !== state.env) return message(mismatchMessage(state.env, env));
  return run('idea', ['logs', project, '--env', state.env]);
};

const runs = (rest: string[]): Outcome => {
  const [project, ...extra] = rest;
  if (!project || extra.length > 0) return usage('runs <project>');
  return run('idea', ['runs', project, '--failed']);
};

// The environment cannot be switched: any argument gets the fixed-session message.
const showEnv = (rest: string[], state: ShellState): Outcome =>
  message(rest.length === 0 ? `environment: ${state.env}` : fixedMessage(state.env));

// ship and idea lines run as typed, unless they name the other environment.
const passthrough = (command: 'ship' | 'idea', rest: string[], state: ShellState): Outcome => {
  const other = namedEnvironments(rest).find((env) => env !== state.env);
  return other ? message(mismatchMessage(state.env, other)) : run(command, rest);
};

const noArgs = (word: string, rest: string[], outcome: Outcome): Outcome =>
  rest.length > 0 ? usage(word) : outcome;

// On Windows every command starts through cmd.exe, which rewrites ^, %VAR%, quotes and !, and treats & | < > ( ) as
// operators. A word with any of those could reach the tool as something other than what the environment check saw
// (`produc^tion` becomes `production`), or start a second command. So a line may only hold plain words.
const PLAIN_WORD = /^[A-Za-z0-9._:/=@+,-]+$/;

// One typed line plus the current state becomes one outcome. Words are split on whitespace and passed to the tool
// as separate arguments, so a line cannot run anything its first word did not route to.
export const route = (line: string, state: ShellState): Outcome => {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const [word, ...rest] = words;
  if (word === undefined) return { kind: 'empty' };
  if (!words.every((w) => PLAIN_WORD.test(w))) {
    return message('Refused: use only letters, digits and . _ : / = @ + , - in a line (no quotes, ^, %, !, &, |, <, >, brackets).');
  }
  const command = word.toLowerCase();
  switch (command) {
    case 'deploy':
    case 'redeploy':
    case 'rollback':
      return shipProduct(command, rest, state);
    case 'status':
      return noArgs('status', rest, run('ship', ['status']));
    case 'logs':
      return logs(rest, state);
    case 'runs':
      return runs(rest);
    case 'ops':
      return run('eng', ['ops', ...rest]);
    case 'doctor':
    case 'update':
    case 'theme':
      return noArgs(command, rest, run('eng', [command]));
    case 'ship':
    case 'idea':
      return passthrough(command, rest, state);
    case 'env':
      return showEnv(rest, state);
    case 'help':
    case '?':
      return message(HELP_TEXT);
    case 'exit':
    case 'quit':
      return { kind: 'exit' };
    default:
      return message(`unknown command: ${word}. Try help.`);
  }
};

export const COMMAND_WORDS: readonly string[] = [
  'deploy', 'redeploy', 'rollback', 'status', 'logs', 'runs', 'ops', 'doctor', 'update', 'theme',
  'ship', 'idea', 'env', 'help', 'exit', 'quit',
];

// A completed word that is followed by an argument gets a trailing space, so the next word can be typed straight away.
const TAKES_ARGUMENT: readonly string[] = [...SHIP_PRODUCTS, ...IDEA_PROJECTS, 'deploy', 'redeploy', 'rollback', 'logs', 'runs', 'ops', 'ship', 'idea'];

const completeFrom = (candidates: readonly string[], partial: string): [string[], string] => [
  candidates.filter((c) => c.startsWith(partial)).map((c) => (TAKES_ARGUMENT.includes(c) ? `${c} ` : c)),
  partial,
];

// node:readline completer: command words first, then product or project names, then environments.
export const complete = (line: string): [string[], string] => {
  const words = line.split(/\s+/);
  const partial = words[words.length - 1] ?? '';
  const [first, , third] = words;
  const position = words.length;
  if (position === 1) return completeFrom(COMMAND_WORDS, partial);
  const verb = (first ?? '').toLowerCase();
  if (position === 2 && ['deploy', 'redeploy', 'rollback'].includes(verb)) return completeFrom(SHIP_PRODUCTS, partial);
  if (position === 2 && ['logs', 'runs'].includes(verb)) return completeFrom(IDEA_PROJECTS, partial);
  if (position === 3 && ['deploy', 'redeploy', 'rollback', 'logs'].includes(verb) && third !== undefined) {
    return completeFrom(ENVIRONMENTS, partial);
  }
  return [[], partial];
};

export const GLYPH = '◆';

// e.g. "◆ staging › ". Production is drawn in the danger colour so it stands out.
export const prompt = (state: ShellState): string => {
  const { color } = envStyle(state.env);
  return `${paint(color, GLYPH)} ${paint(color, state.env)} ${paint(PALETTE.muted, '›')} `;
};

export const banner = (state: ShellState): string =>
  `${paint(envStyle(state.env).color, GLYPH)} eng shell, ${state.env}. Type help for commands, exit to leave.`;

// The logic behind `eng shell`: a prompt where short words route to ship, idea and eng. Pure: src/cli.ts wires it to
// the terminal. Nothing here starts a process, and nothing here ever adds --yes: production safety stays with ship.
import { IDEA_PROJECTS, SHIP_PRODUCTS } from "./menu.js";
import { paint, PALETTE } from "./theme.js";
export const ENVIRONMENTS = ['staging', 'production'];
export const INITIAL_STATE = { env: 'staging' };
const message = (text) => ({ kind: 'message', text });
const run = (command, args) => ({ kind: 'run', command, args });
const isEnvironment = (word) => ENVIRONMENTS.some((e) => e === word);
export const HELP_TEXT = `  deploy <product> [env]      ship deploy <product> <env>
  redeploy <product> [env]    ship deploy <product> <env> --redeploy
  rollback <product> [env]    ship rollback <product> <env>
  status                      ship status
  logs <project> [env]        idea logs <project> --env <env>
  runs <project>              idea runs <project> --failed
  ops <...>                   eng ops <...>
  doctor | update | theme     eng's own commands
  ship <...> | idea <...>     run that tool as typed
  env [staging|production]    show or switch the current environment (starts as staging)
  help                        this list
  exit | quit | Ctrl-D        leave the shell

When a command names no env, the current one is used. Production deploys still ask you to type the product name.`;
const usage = (text) => message(`usage: ${text}`);
// deploy | redeploy | rollback: <product> [env], with env defaulting to the current one.
const shipProduct = (verb, rest, state) => {
    const [product, env, ...extra] = rest;
    const form = `${verb} <product> [staging|production]`;
    if (!product || extra.length > 0)
        return usage(form);
    if (env !== undefined && !isEnvironment(env))
        return usage(form);
    const target = env ?? state.env;
    if (verb === 'rollback')
        return run('ship', ['rollback', product, target]);
    return run('ship', ['deploy', product, target, ...(verb === 'redeploy' ? ['--redeploy'] : [])]);
};
const logs = (rest, state) => {
    const [project, env, ...extra] = rest;
    const form = 'logs <project> [staging|production]';
    if (!project || extra.length > 0)
        return usage(form);
    if (env !== undefined && !isEnvironment(env))
        return usage(form);
    return run('idea', ['logs', project, '--env', env ?? state.env]);
};
const runs = (rest) => {
    const [project, ...extra] = rest;
    if (!project || extra.length > 0)
        return usage('runs <project>');
    return run('idea', ['runs', project, '--failed']);
};
const switchEnv = (rest, state) => {
    const [env, ...extra] = rest;
    if (env === undefined)
        return message(`environment: ${state.env}`);
    if (!isEnvironment(env) || extra.length > 0)
        return usage('env [staging|production]');
    return { kind: 'env', env, text: `environment: ${env}` };
};
const noArgs = (word, rest, outcome) => rest.length > 0 ? usage(word) : outcome;
// One typed line plus the current state becomes one outcome. Words are split on whitespace and passed to the tool
// as separate arguments (never through a shell), so a line cannot run anything its first word did not route to.
export const route = (line, state) => {
    const [word, ...rest] = line.trim().split(/\s+/).filter(Boolean);
    if (word === undefined)
        return { kind: 'empty' };
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
            return run(command, rest);
        case 'env':
            return switchEnv(rest, state);
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
export const COMMAND_WORDS = [
    'deploy', 'redeploy', 'rollback', 'status', 'logs', 'runs', 'ops', 'doctor', 'update', 'theme',
    'ship', 'idea', 'env', 'help', 'exit', 'quit',
];
// A completed word that is followed by an argument gets a trailing space, so the next word can be typed straight away.
const TAKES_ARGUMENT = [...SHIP_PRODUCTS, ...IDEA_PROJECTS, 'deploy', 'redeploy', 'rollback', 'logs', 'runs', 'ops', 'ship', 'idea', 'env'];
const completeFrom = (candidates, partial) => [
    candidates.filter((c) => c.startsWith(partial)).map((c) => (TAKES_ARGUMENT.includes(c) ? `${c} ` : c)),
    partial,
];
// node:readline completer: command words first, then product or project names, then environments.
export const complete = (line) => {
    const words = line.split(/\s+/);
    const partial = words[words.length - 1] ?? '';
    const [first, , third] = words;
    const position = words.length;
    if (position === 1)
        return completeFrom(COMMAND_WORDS, partial);
    const verb = (first ?? '').toLowerCase();
    if (position === 2 && ['deploy', 'redeploy', 'rollback'].includes(verb))
        return completeFrom(SHIP_PRODUCTS, partial);
    if (position === 2 && ['logs', 'runs'].includes(verb))
        return completeFrom(IDEA_PROJECTS, partial);
    if (position === 2 && verb === 'env')
        return completeFrom(ENVIRONMENTS, partial);
    if (position === 3 && ['deploy', 'redeploy', 'rollback', 'logs'].includes(verb) && third !== undefined) {
        return completeFrom(ENVIRONMENTS, partial);
    }
    return [[], partial];
};
export const GLYPH = '◆';
// e.g. "◆ staging › ". Production is drawn in the warning colour so it stands out.
export const prompt = (state) => `${paint(PALETTE.primary, GLYPH)} ${paint(state.env === 'production' ? PALETTE.warning : PALETTE.accent, state.env)} ${paint(PALETTE.muted, '›')} `;
export const BANNER = `${paint(PALETTE.primary, GLYPH)} eng shell. Type help for commands, exit to leave.`;

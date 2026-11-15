// The environment an eng session is fixed to: staging unless started with --production, and never switched after.
// Pure: src/cli.ts reads the flags and the typed answer, and wires this to the terminal.
import { paint, PALETTE } from "./theme.js";
export const ENVIRONMENTS = ['staging', 'production'];
export const isEnvironment = (word) => ENVIRONMENTS.some((e) => e === word);
// --production and --env production mean the same; --env staging is the default spelled out. Nothing else is accepted.
export const resolveEnvironment = ({ production = false, env }) => {
    if (env !== undefined && !isEnvironment(env))
        return { ok: false, error: `--env must be staging or production, not '${env}'` };
    if (production && env === 'staging')
        return { ok: false, error: '--production and --env staging contradict each other' };
    return { ok: true, env: production || env === 'production' ? 'production' : 'staging' };
};
// Only the exact word continues. Surrounding whitespace (the newline) is ignored; case is not.
export const isProductionConfirmed = (answer) => answer.trim() === 'production';
export const restartHint = (env) => env === 'production' ? 'To use staging, restart eng without --production.' : 'To use production, restart with: eng --production';
export const fixedMessage = (env) => `The environment is fixed for this session (${env}). ${restartHint(env)}`;
export const mismatchMessage = (session, named) => `Refused: this session is fixed to ${session}, and that line names ${named}. ${restartHint(session)}`;
// Colours and badge for each environment, shared by the app and the shell prompt.
export const envStyle = (env) => env === 'production'
    ? { color: PALETTE.danger, badge: 'PRODUCTION' }
    : { color: PALETTE.accent, badge: 'staging' };
const wrap = (text, width) => text.split(' ').reduce((lines, word) => {
    const last = lines[lines.length - 1];
    if (last === undefined || `${last} ${word}`.length > width)
        return [...lines, word];
    return [...lines.slice(0, -1), `${last} ${word}`];
}, []);
// A full-width red block. Every row is padded to the terminal width, and the sentence wraps between words, so
// PRODUCTION is never split and the background spans the whole row.
export const productionWarning = (width) => {
    const w = Math.max(width, 20);
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(PALETTE.danger.slice(i, i + 2), 16));
    const [fr, fg, fb] = [1, 3, 5].map((i) => Number.parseInt(PALETTE.background.slice(i, i + 2), 16));
    const row = (text) => `\x1b[1;38;2;${fr};${fg};${fb};48;2;${r};${g};${b}m${text.padEnd(w)}\x1b[0m`;
    const centre = (text) => `${' '.repeat(Math.max(0, Math.floor((w - text.length) / 2)))}${text}`;
    return [
        row(''),
        row(centre('PRODUCTION')),
        row(''),
        ...wrap('Commands in this session affect real users and real data.', w).map((l) => row(centre(l))),
        row(''),
    ].join('\n');
};
// Environments a ship or idea argument list names: a bare staging/production word (which also covers --env <x>) or --env=<x>.
export const namedEnvironments = (args) => args.flatMap((arg) => {
    const value = arg.startsWith('--env=') ? arg.slice('--env='.length) : arg;
    return isEnvironment(value) ? [value] : [];
});
export const CONFIRM_PROMPT = `Type ${paint(PALETTE.danger, 'production')} to continue, anything else exits: `;

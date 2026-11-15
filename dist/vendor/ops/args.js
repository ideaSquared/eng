// Vendored from ideaSquared/agent-idea packages/ops/src/args.ts at ops-v0.1.1. Do not edit here: change it there,
// release it, then copy it again. eng installs globally from GitHub, and pnpm refuses URL or git dependencies there.
import { OpsError } from "./contract.js";
const ID = /^\S{1,128}$/;
function checkValue(field, value) {
    const bad = (what) => {
        throw new OpsError('invalid_argument', `field '${field.name}' must be ${what}`);
    };
    switch (field.type) {
        case 'string':
            return typeof value === 'string' ? value : bad('a string');
        case 'number':
            return typeof value === 'number' && Number.isFinite(value) ? value : bad('a number');
        case 'boolean':
            return typeof value === 'boolean' ? value : bad('true or false');
        case 'id':
            return typeof value === 'string' && ID.test(value) ? value : bad('an id: 1 to 128 characters, no spaces');
        case 'enum':
            return typeof value === 'string' && (field.values ?? []).includes(value)
                ? value
                : bad(`one of: ${(field.values ?? []).join(', ')}`);
    }
}
// The one validation both sides use: the server before running a handler, the client before calling. Strict, with no
// coercion: a number field takes a JSON number. Throws OpsError('invalid_argument') naming the field, never the value.
export function validateArgs(fields, args) {
    const known = new Set(fields.map((field) => field.name));
    const unknown = Object.keys(args).find((key) => !known.has(key));
    if (unknown !== undefined) {
        throw new OpsError('invalid_argument', `unknown field '${unknown.slice(0, 64)}'`);
    }
    const entries = fields.flatMap((field) => {
        const value = args[field.name];
        if (value === undefined) {
            if (field.required)
                throw new OpsError('invalid_argument', `field '${field.name}' is required`);
            return [];
        }
        return [[field.name, checkValue(field, value)]];
    });
    return Object.fromEntries(entries);
}
function fail(message) {
    throw new OpsError('invalid_argument', message);
}
function fromText(field, text) {
    if (field.type === 'number')
        return text.trim() === '' ? fail(`field '${field.name}' must be a number`) : Number(text);
    if (field.type === 'boolean') {
        if (text === 'true')
            return true;
        if (text === 'false')
            return false;
        return fail(`field '${field.name}' must be true or false`);
    }
    return text;
}
function parseJsonArgs(text) {
    const parsed = (() => {
        try {
            return JSON.parse(text);
        }
        catch {
            return fail('--json must be valid JSON');
        }
    })();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return fail('--json must be an object');
    return Object.fromEntries(Object.entries(parsed));
}
// Maps CLI words to args, then validates them with validateArgs.
//   --field value | --field=value   any field (a number or enum value is text on the command line)
//   --flag                          a boolean field, true; --flag=false for false
//   word word                       positional fields, in declared order, among those not given as options
//   --json '{...}'                  the args as JSON; options and words given as well override it
//   --                              everything after it is a positional word
// Throws OpsError('invalid_argument').
export function parseArgs(command, argv) {
    const byName = new Map(command.fields.map((field) => [field.name, field]));
    const given = {};
    const options = new Set();
    const words = [];
    let json = {};
    const set = (field, value) => {
        if (options.has(field.name))
            fail(`option --${field.name} was given twice`);
        options.add(field.name);
        given[field.name] = value;
    };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === undefined)
            break;
        if (token === '--') {
            words.push(...argv.slice(i + 1));
            break;
        }
        if (!token.startsWith('--')) {
            words.push(token);
            continue;
        }
        const equals = token.indexOf('=');
        const name = token.slice(2, equals === -1 ? undefined : equals);
        const inline = equals === -1 ? undefined : token.slice(equals + 1);
        if (name === 'json') {
            const text = inline ?? argv[++i];
            if (text === undefined)
                fail('--json needs a value');
            json = parseJsonArgs(text);
            continue;
        }
        const field = byName.get(name);
        if (!field)
            fail(`unknown option --${name.slice(0, 64)}`);
        if (field.type === 'boolean' && inline === undefined) {
            set(field, true);
            continue;
        }
        const text = inline ?? argv[++i];
        if (text === undefined)
            fail(`option --${name} needs a value`);
        set(field, fromText(field, text));
    }
    const open = command.fields.filter((field) => field.positional && !options.has(field.name));
    if (words.length > open.length)
        fail(`expected at most ${open.length} positional value(s), got ${words.length}`);
    words.forEach((word, index) => {
        const field = open[index];
        if (field)
            given[field.name] = fromText(field, word);
    });
    return validateArgs(command.fields, { ...json, ...given });
}

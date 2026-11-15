// Vendored from ideaSquared/agent-idea packages/ops/src/contract.ts at ops-v0.1.1. Do not edit here: change it there,
// release it, then copy it again. eng installs globally from GitHub, and pnpm refuses URL or git dependencies there.
import { z } from 'zod';
// Contract v1. Every ideaSquared product that exposes ops speaks exactly this.
export const OPS_CONTRACT_VERSION = 1;
export const FIELD_TYPES = ['string', 'number', 'boolean', 'enum', 'id'];
export const OPS_ERROR_CODES = ['unauthenticated', 'forbidden', 'not_found', 'invalid_argument', 'internal'];
const SEGMENT = /^[a-z][a-z0-9-]*$/;
export const FieldSchema = z
    .object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]*$/),
    type: z.enum(FIELD_TYPES),
    required: z.boolean(),
    description: z.string(),
    // Allowed values of an enum field.
    values: z.array(z.string()).min(1).optional(),
    // Filled from bare CLI words, in the order the fields are declared.
    positional: z.boolean().optional(),
})
    .refine((field) => field.name !== 'json', "a field cannot be called 'json': the CLI uses --json")
    .refine((field) => field.type !== 'enum' || field.values !== undefined, 'an enum field needs values');
export const CommandSchema = z
    .object({
    // "group.name", for example "accounts.resync"
    id: z.string(),
    group: z.string().regex(SEGMENT),
    name: z.string().regex(SEGMENT),
    summary: z.string(),
    kind: z.enum(['read', 'write']),
    fields: z.array(FieldSchema),
    // Writes: whether the command can preview what it would do.
    dryRun: z.boolean(),
})
    .refine((command) => command.id === `${command.group}.${command.name}`, 'id must be "<group>.<name>"')
    .refine((command) => new Set(command.fields.map((field) => field.name)).size === command.fields.length, 'field names must be unique');
export const CatalogSchema = z.object({
    version: z.literal(OPS_CONTRACT_VERSION),
    product: z.string(),
    environment: z.string(),
    commands: z.array(CommandSchema),
});
export const ModeSchema = z.enum(['run', 'preview']);
export const InvokeRequestSchema = z.object({
    command: z.string(),
    args: z.record(z.string(), z.unknown()),
    mode: ModeSchema,
});
// `mode` is what was actually done: a read asked to preview still runs, and says so.
export const InvokeResponseSchema = z.object({
    command: z.string(),
    mode: ModeSchema,
    result: z.unknown(),
    summary: z.string().optional(),
});
export const OpsErrorCodeSchema = z.enum(OPS_ERROR_CODES);
export const ErrorResponseSchema = z.object({
    error: z.object({ code: OpsErrorCodeSchema, message: z.string() }),
});
export const OPS_ERROR_STATUS = {
    unauthenticated: 401,
    forbidden: 403,
    not_found: 404,
    invalid_argument: 400,
    internal: 500,
};
// Thrown by command handlers (and by the client) to answer with a specific error code. The message is sent to
// the caller as it is: never put a token, a request body or personal data in it.
export class OpsError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'OpsError';
        this.code = code;
    }
}

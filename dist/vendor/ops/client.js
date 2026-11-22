import { CatalogSchema, ErrorResponseSchema, InvokeResponseSchema, OpsError } from "./contract.js";
const defaultFetch = (input, init) => fetch(input, init);
async function call(baseUrl, path, token, fetcher, init) {
    const response = await fetcher(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        method: init.method,
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
    });
    const body = await response.json().catch(() => null);
    if (response.ok)
        return body;
    const failure = ErrorResponseSchema.safeParse(body);
    if (failure.success)
        throw new OpsError(failure.data.error.code, failure.data.error.message);
    throw new OpsError('internal', `the ops server answered ${response.status} with an unreadable body`);
}
function unreadable() {
    throw new OpsError('internal', 'the ops server sent a response that does not match contract v1');
}
// Both helpers throw OpsError: with the server's code and message when it sent the error shape, and with code
// 'internal' when the response is not valid contract v1. A failed network call rejects as fetch does.
export async function fetchCatalog(baseUrl, token, fetcher = defaultFetch) {
    const parsed = CatalogSchema.safeParse(await call(baseUrl, '/catalog', token, fetcher, { method: 'GET' }));
    return parsed.success ? parsed.data : unreadable();
}
export async function invoke(baseUrl, token, request, fetcher = defaultFetch) {
    const body = JSON.stringify(request);
    const parsed = InvokeResponseSchema.safeParse(await call(baseUrl, '/invoke', token, fetcher, { method: 'POST', body }));
    return parsed.success ? parsed.data : unreadable();
}

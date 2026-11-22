// Vendored from ideaSquared/agent-idea packages/ops/src/client.ts at ops-v0.1.1. Do not edit here: change it there,
// release it, then copy it again. eng installs globally from GitHub, and pnpm refuses URL or git dependencies there.
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
import { CatalogSchema, ErrorResponseSchema, InvokeResponseSchema, OpsError } from './contract.ts';
import type { Catalog, InvokeRequest, InvokeResponse } from './contract.ts';

const defaultFetch: Fetch = (input, init) => fetch(input, init);

async function call(baseUrl: string, path: string, token: string, fetcher: Fetch, init: { method: string; body?: string }): Promise<unknown> {
  const response = await fetcher(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body;
  const failure = ErrorResponseSchema.safeParse(body);
  if (failure.success) throw new OpsError(failure.data.error.code, failure.data.error.message);
  throw new OpsError('internal', `the ops server answered ${response.status} with an unreadable body`);
}

function unreadable(): never {
  throw new OpsError('internal', 'the ops server sent a response that does not match contract v1');
}

// Both helpers throw OpsError: with the server's code and message when it sent the error shape, and with code
// 'internal' when the response is not valid contract v1. A failed network call rejects as fetch does.
export async function fetchCatalog(baseUrl: string, token: string, fetcher: Fetch = defaultFetch): Promise<Catalog> {
  const parsed = CatalogSchema.safeParse(await call(baseUrl, '/catalog', token, fetcher, { method: 'GET' }));
  return parsed.success ? parsed.data : unreadable();
}

export async function invoke(baseUrl: string, token: string, request: InvokeRequest, fetcher: Fetch = defaultFetch): Promise<InvokeResponse> {
  const body = JSON.stringify(request);
  const parsed = InvokeResponseSchema.safeParse(await call(baseUrl, '/invoke', token, fetcher, { method: 'POST', body }));
  return parsed.success ? parsed.data : unreadable();
}

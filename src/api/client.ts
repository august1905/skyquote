import { BACKEND_BASE_URL } from '../config';

export function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// Thrown for every non-2xx response. `status` lets a caller distinguish a
// permanent failure (404 — the thing this request targets is gone, retrying
// can never succeed) from a transient one worth retrying, and 409 in
// particular carries the optimistic-concurrency conflict the editor's
// autosave has to handle rather than clobber.
export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

/**
 * GETs that are already in flight, keyed by URL. A second identical GET issued
 * before the first resolves gets that same promise instead of a second request.
 *
 * This is not a cache — an entry is removed the moment its request settles, so
 * nothing is ever served stale, and a GET issued after the first completes still
 * hits the network. It only collapses *concurrent* duplicates.
 *
 * Which turns out to be most of them. React's StrictMode double-invokes every
 * mount effect in development, so an editor page load that issues 7 requests was
 * measured issuing 14 — every fetch, twice, microseconds apart. Every one of
 * those is a real Data Store round trip against a billed account. Deduping here
 * rather than by removing StrictMode is deliberate: the double-mount has caught
 * three real bugs in this codebase, and it's the duplicated *network* cost we
 * want gone, not the duplicated render.
 *
 * GET only. A duplicate POST/PUT/DELETE is a second intentional write and must
 * never be silently collapsed into one.
 */
const inFlightGets = new Map<string, Promise<unknown>>();

export default async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const method = (options.method ?? 'GET').toUpperCase();
	const url = joinUrl(BACKEND_BASE_URL, path);

	if (method === 'GET') {
		const existing = inFlightGets.get(url);
		if (existing) return existing as Promise<T>;
		const pending = performFetch<T>(url, options).finally(() => {
			inFlightGets.delete(url);
		});
		inFlightGets.set(url, pending);
		return pending;
	}

	return performFetch<T>(url, options);
}

async function performFetch<T>(url: string, options: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...options,
		// Cross-origin requests to spqbackend need this for the session cookie to travel.
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	const contentType = response.headers.get('content-type') || '';
	const body: unknown = contentType.includes('application/json')
		? await response.json()
		: await response.text();

	if (!response.ok) {
		const message =
			typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
				? body.error
				: response.statusText;
		throw new ApiError(message, response.status);
	}

	return body as T;
}

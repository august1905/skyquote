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

export default async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(joinUrl(BACKEND_BASE_URL, path), {
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

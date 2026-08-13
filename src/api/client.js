import { BACKEND_BASE_URL } from '../config';

function joinUrl(base, path) {
	return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export default async function apiFetch(path, options = {}) {
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
	const body = contentType.includes('application/json') ? await response.json() : await response.text();

	if (!response.ok) {
		const error = new Error((body && body.error) || response.statusText);
		// Lets a caller distinguish a permanent failure (404 — the document
		// this request targets is gone, retrying can never succeed) from a
		// transient one worth retrying.
		error.status = response.status;
		throw error;
	}

	return body;
}

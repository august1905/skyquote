export const PROJECT_ID = '56318000000435234';

// Base URL of the skyquote_function Advanced I/O function (spqbackend).
// VITE_BACKEND_BASE_URL lets local/test runs point at the `catalyst serve`
// backend (via the /api dev proxy in vite.config.js) without touching this
// default.
export const BACKEND_BASE_URL =
	import.meta.env.VITE_BACKEND_BASE_URL ||
	'https://skyquote-906452360.catalystserverless.com/server/skyquote_function/';

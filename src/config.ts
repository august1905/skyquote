export const PROJECT_ID = '56318000000435234';

// Base URL of the skyquote_function Advanced I/O function (spqbackend).
//
// The `.development.` segment is not optional: the project has only a
// Development environment so far, and that's the environment's own hostname.
// The shorter skyquote-906452360.catalystserverless.com form (which is what
// skycamone uses) 404s here — it only resolves once a Production environment
// exists. Revisit this when one is created.
//
// VITE_BACKEND_BASE_URL lets local/test runs point at the `catalyst serve`
// backend (via the /api dev proxy in vite.config.js) without touching this
// default.
export const BACKEND_BASE_URL =
	import.meta.env.VITE_BACKEND_BASE_URL ||
	'https://skyquote-906452360.development.catalystserverless.com/server/skyquote_function/';

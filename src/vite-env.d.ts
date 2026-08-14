/// <reference types="vite/client" />

// Only the vars this app actually reads. Declared explicitly rather than
// falling back to Vite's `any`-typed catch-all, so a typo in an env name is
// a compile error rather than a silent undefined at runtime.
interface ImportMetaEnv {
	readonly VITE_BACKEND_BASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

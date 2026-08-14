import { defineConfig } from '@playwright/test';
import { STORAGE_STATE_PATH } from './tests/auth-storage-state';

// Requires the backend running locally via `catalyst serve` (see spqbackend)
// in addition to this dev server — there's no mocked backend, tests run
// against the real Data Store.
export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	// One shared login for the whole run (see global-setup.ts) instead of
	// every test logging in itself — Data Store calls are billed, and login
	// is by far the biggest per-test cost. Tests that need their own login
	// (or a second, distinct identity) opt out per-file/per-test with
	// `test.use({ storageState: {...} })`.
	globalSetup: './tests/global-setup.ts',
	use: {
		baseURL: 'http://localhost:5173',
		channel: 'chrome',
		storageState: STORAGE_STATE_PATH,
	},
	webServer: {
		command: 'npm run dev -- --port 5173 --strictPort',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 30000,
		// CATALYST_SERVE_PORT has to be forwarded explicitly — webServer.env
		// replaces the child's environment rather than extending it, so the
		// dev server would otherwise proxy to the default 3000.
		env: { VITE_BACKEND_BASE_URL: '/api/', CATALYST_SERVE_PORT: process.env.CATALYST_SERVE_PORT || '3000' },
	},
});

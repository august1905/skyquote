import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test-account passwords are NOT committed — this repo is public, and these
// are real, working logins against the Skyquote Data Store (TEST_ADMIN is an
// actual admin). They're read from tests/.env.local instead, which is
// gitignored. Hand-rolled rather than pulling in dotenv: it's eight lines and
// this is the only place that needs it.
function loadEnvLocal(): void {
	const envPath = path.join(__dirname, '.env.local');
	if (!fs.existsSync(envPath)) return;
	for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		// Never clobber a value already exported in the shell — an explicit
		// override on the command line should win over the file.
		if (match?.[1] && !process.env[match[1]]) process.env[match[1]] = match[2];
	}
}

loadEnvLocal();

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set — copy tests/.env.local.example to tests/.env.local (see README.md, "Test setup").`);
	}
	return value;
}

export interface TestAccount {
	email: string;
	password: string;
}

// One real account, reused for the whole suite via a saved session cookie
// (see global-setup.ts) instead of every login being paid for — those are
// real Data Store calls against Catalyst's (billed) free tier, and almost no
// test actually needs a distinct identity. Tests that DO need their own login
// (the auth flow itself, or a genuinely separate identity) opt out with
// `test.use({ storageState: { cookies: [], origins: [] } })`.
export const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'shared-user.json');

export const SHARED_USER: TestAccount & { firstName: string; lastName: string } = {
	email: process.env.TEST_SHARED_USER_EMAIL || 'playwright-shared-user@example.com',
	password: requiredEnv('TEST_SHARED_USER_PASSWORD'),
	firstName: 'Shared',
	lastName: 'Tester',
};

// There's no self-serve signup (accounts are admin-created only — see
// routes/users.js and src/pages/AdminUsers.tsx), so global-setup.ts logs in
// as this account and uses POST /admin/users to create SHARED_USER. Unlike
// SHARED_USER, this row can't be created by the test run itself — see "Test
// setup" in ../README.md for how to seed it once per environment.
export const TEST_ADMIN: TestAccount = {
	email: process.env.TEST_ADMIN_EMAIL || 'playwright-admin@example.com',
	password: requiredEnv('TEST_ADMIN_PASSWORD'),
};

// Password for the disposable accounts individual specs create and abandon
// (admin-created-*, admin-deactivate-*). Safe to keep in the repo: these
// accounts are made and discarded within a single test. It's deliberately
// NOT the password of the seeded TEST_ADMIN — this file is public, and
// reusing one string would hand out a hint for a real admin login.
export const FIXTURE_PASSWORD = 'fixture-account-not-a-real-login';

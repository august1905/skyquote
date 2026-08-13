import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { STORAGE_STATE_PATH, SHARED_USER, TEST_ADMIN } from './auth-storage-state.js';

// Signs the shared test user in once per full suite run and saves the
// session cookie to disk, instead of every test doing its own login (a real
// Data Store call). There's no self-serve signup — if the shared user
// doesn't exist yet (e.g. a fresh Data Store), it's created via the admin
// API, logging in as TEST_ADMIN first. See "Test setup" in README.md for how
// TEST_ADMIN itself gets seeded (that one step can't be automated — an admin
// is required to create anyone, including the first one).
export default async function globalSetup() {
	const baseURL = 'http://localhost:5173';
	const ctx = await request.newContext({ baseURL });

	try {
		let loginRes = await ctx.post('/api/auth/login', {
			data: { email: SHARED_USER.email, password: SHARED_USER.password },
		});

		if (!loginRes.ok()) {
			const adminLoginRes = await ctx.post('/api/auth/login', {
				data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
			});
			if (!adminLoginRes.ok()) {
				throw new Error(
					`global-setup: TEST_ADMIN login failed (${adminLoginRes.status()}) — has it been seeded? See "Test setup" in README.md.`
				);
			}

			const createRes = await ctx.post('/api/admin/users', {
				data: {
					email: SHARED_USER.email,
					password: SHARED_USER.password,
					first_name: SHARED_USER.firstName,
					last_name: SHARED_USER.lastName,
					role: 'member',
				},
			});
			// 409 (already exists) is fine here — a concurrent/prior run could
			// have created it between our failed login above and this call.
			if (!createRes.ok() && createRes.status() !== 409) {
				throw new Error(`global-setup: shared user creation failed (${createRes.status()})`);
			}

			loginRes = await ctx.post('/api/auth/login', {
				data: { email: SHARED_USER.email, password: SHARED_USER.password },
			});
		}

		if (!loginRes.ok()) {
			throw new Error(`global-setup: shared user login failed (${loginRes.status()})`);
		}

		fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
		await ctx.storageState({ path: STORAGE_STATE_PATH });
	} finally {
		await ctx.dispose();
	}
}

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { AuthProvider, useAuth } from './AuthContext';

// The one thing that must never regress here: a session check that *fails* is
// not a session check that came back negative. Collapsing the two sent people to
// the login page on any backend hiccup — telling them something false, asking for
// a password that was never the problem, and losing the URL they were on. It also
// produced an intermittent e2e failure whose only symptom was one test landing on
// the login screen while every later test in the same run stayed signed in.

const me = vi.hoisted(() => vi.fn());
vi.mock('../api/auth', () => ({ me }));

function StatusProbe() {
	const { status } = useAuth();
	return <span data-testid="status">{status}</span>;
}

async function statusAfter(result: Promise<unknown>): Promise<string> {
	me.mockReturnValue(result);
	render(
		<AuthProvider>
			<StatusProbe />
		</AuthProvider>,
	);
	// The provider fires me() from an effect on mount; the status settles once
	// that promise resolves.
	return (await screen.findByText(/authenticated|unauthenticated|unreachable/)).textContent ?? '';
}

describe('AuthProvider status', () => {
	afterEach(() => {
		cleanup();
		me.mockReset();
	});

	it('is authenticated when the check succeeds', async () => {
		await expect(statusAfter(Promise.resolve({ email: 'a@b.co', role: 'member' }))).resolves.toBe('authenticated');
	});

	it('is unauthenticated on a 401 — the server actually answered', async () => {
		await expect(statusAfter(Promise.reject(new ApiError('Not authenticated', 401)))).resolves.toBe('unauthenticated');
	});

	it('is unreachable on a 503, not unauthenticated', async () => {
		// This is the case the backend now returns when it can't *check* a session
		// (see utils/requireAuth.js) — being unable to verify is not being signed out.
		await expect(statusAfter(Promise.reject(new ApiError('Could not verify your session. Try again.', 503)))).resolves.toBe('unreachable');
	});

	it('is unreachable on a 500', async () => {
		await expect(statusAfter(Promise.reject(new ApiError('Internal Server Error', 500)))).resolves.toBe('unreachable');
	});

	it('is unreachable when the request never got an answer at all', async () => {
		// A dropped connection throws a bare TypeError from fetch, with no status.
		await expect(statusAfter(Promise.reject(new TypeError('Failed to fetch')))).resolves.toBe('unreachable');
	});
});

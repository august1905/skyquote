import apiFetch from './client';
import type { Role } from '../auth/permissions';

// The shape GET /auth/me returns — snake_case because it mirrors the Data
// Store columns the backend's normalizeUser allowlist emits, and renaming at
// the boundary would just be a second place to keep in sync.
export interface CurrentUser {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	role: Role;
}

interface OkResponse {
	ok: true;
}

// There's deliberately no signup() here — accounts are admin-created only
// (see src/pages/AdminUsers.tsx / src/api/adminUsers.ts).

export function login(credentials: { email: string; password: string }): Promise<OkResponse> {
	return apiFetch<OkResponse>('/auth/login', {
		method: 'POST',
		body: JSON.stringify(credentials),
	});
}

export function logout(): Promise<OkResponse> {
	return apiFetch<OkResponse>('/auth/logout', { method: 'POST' });
}

// Session-check — resolves with the current user if the session cookie is
// valid, rejects otherwise.
export function me(): Promise<CurrentUser> {
	return apiFetch<CurrentUser>('/auth/me');
}

// Resolves the same way whether or not the address has an account — the
// backend won't say, so the UI can't either.
export function requestPasswordReset(input: { email: string }): Promise<OkResponse> {
	return apiFetch<OkResponse>('/auth/password-reset/request', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

export function confirmPasswordReset(input: { token: string; password: string }): Promise<OkResponse> {
	return apiFetch<OkResponse>('/auth/password-reset/confirm', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

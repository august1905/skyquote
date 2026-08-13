import apiFetch from './client';

// There's deliberately no signup() here — accounts are admin-created only
// (see src/pages/AdminUsers.jsx / src/api/adminUsers.js).

export function login({ email, password }) {
	return apiFetch('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});
}

export function logout() {
	return apiFetch('/auth/logout', { method: 'POST' });
}

// Session-check — resolves with the current user if the session cookie is
// valid, rejects otherwise.
export function me() {
	return apiFetch('/auth/me');
}

// Resolves the same way whether or not the address has an account — the
// backend won't say, so the UI can't either.
export function requestPasswordReset({ email }) {
	return apiFetch('/auth/password-reset/request', {
		method: 'POST',
		body: JSON.stringify({ email }),
	});
}

export function confirmPasswordReset({ token, password }) {
	return apiFetch('/auth/password-reset/confirm', {
		method: 'POST',
		body: JSON.stringify({ token, password }),
	});
}

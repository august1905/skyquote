import apiFetch from './client';

export function listUsers() {
	return apiFetch('/admin/users');
}

export function createUser({ email, password, firstName, lastName, role }) {
	return apiFetch('/admin/users', {
		method: 'POST',
		body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, role }),
	});
}

export function deactivateUser(id) {
	return apiFetch(`/admin/users/${id}/deactivate`, { method: 'POST' });
}

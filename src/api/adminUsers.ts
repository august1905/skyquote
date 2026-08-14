import apiFetch from './client';
import type { Role } from '../auth/permissions';

// What GET /admin/users returns per row — the backend's normalizeUser
// allowlist, which deliberately never emits password, failed_login_count, or
// lockout_until.
export interface AdminUser {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	role: Role;
	is_active: boolean;
	created_time: string;
}

export interface CreateUserInput {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	role: Role;
}

export function listUsers(): Promise<AdminUser[]> {
	return apiFetch<AdminUser[]>('/admin/users');
}

export function createUser({ email, password, firstName, lastName, role }: CreateUserInput): Promise<AdminUser> {
	return apiFetch<AdminUser>('/admin/users', {
		method: 'POST',
		body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName, role }),
	});
}

export function deactivateUser(id: string): Promise<{ ok: true }> {
	return apiFetch<{ ok: true }>(`/admin/users/${id}/deactivate`, { method: 'POST' });
}

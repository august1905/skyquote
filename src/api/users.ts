import apiFetch from './client';

/**
 * An active teammate, as the assignable-people list returns them — name and
 * email only. Deliberately thinner than `AdminUser` (src/api/adminUsers.ts):
 * this list exists so any member can pick a countersigner, and it comes from
 * `GET /users`, which any authenticated session may call, not the admin-gated
 * `GET /admin/users`.
 */
export interface AppUser {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
}

export function listAppUsers(): Promise<{ users: AppUser[] }> {
	return apiFetch<{ users: AppUser[] }>('/users');
}

export function appUserDisplayName(user: AppUser): string {
	return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

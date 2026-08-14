// Mirrors spqbackend's utils/roles.js — the backend is the real enforcement
// point (every admin route checks the role server-side too), this just drives
// which controls the UI shows so a member isn't presented with buttons that
// would 403 anyway.
export const ROLES = ['admin', 'member'] as const;

export type Role = (typeof ROLES)[number];

export function isAdmin(role: Role | undefined): boolean {
	return role === 'admin';
}

export const ROLE_LABELS: Record<Role, string> = {
	admin: 'Admin',
	member: 'Member',
};

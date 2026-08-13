// Mirrors spqbackend's utils/roles.js — the backend is the real enforcement
// point (every admin route checks the role server-side too), this just drives
// which controls the UI shows so a member isn't presented with buttons that
// would 403 anyway.
export function isAdmin(role) {
	return role === 'admin';
}

export const ROLE_LABELS = {
	admin: 'Admin',
	member: 'Member',
};

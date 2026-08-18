import type { Draft } from 'immer';
import type { Role, RoleId, TemplateBody } from '../types';
import type { Command } from './types';
import { snapshot } from './blockTree';

/**
 * §2.2/§3's Recipients/Roles panel. `Role` has no nested containers the way
 * blocks do, so this is a much smaller version of `pageCommands.ts`'s
 * splice/reindex pattern — one flat array, ordered by array position, with
 * `order` kept as a denormalized mirror of that position (same convention as
 * `Page.order`/`reindexPageOrder`).
 */

const ROLE_COLOR_PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

export function defaultRoleColor(existingRoles: Role[]): string {
	return ROLE_COLOR_PALETTE[existingRoles.length % ROLE_COLOR_PALETTE.length]!;
}

/** "Role 1", "Role 2", ... — first name not already in use, so Add Role never collides. */
export function nextRoleName(existingRoles: Role[]): string {
	const used = new Set(existingRoles.map((r) => r.name));
	let n = 1;
	while (used.has(`Role ${n}`)) n++;
	return `Role ${n}`;
}

export function createRole(params: { name: string; color: string; isSender?: boolean }): Role {
	return {
		id: crypto.randomUUID(),
		name: params.name,
		color: params.color,
		order: 0, // corrected by reindexRoleOrder once inserted
		isSender: params.isSender ?? false,
	};
}

function findRoleIndex(body: Draft<TemplateBody>, roleId: RoleId): number {
	const index = body.roles.findIndex((r) => r.id === roleId);
	if (index === -1) throw new Error(`findRoleIndex: no role with id ${roleId}`);
	return index;
}

function roleAt(body: Draft<TemplateBody>, index: number): Draft<Role> {
	const role = body.roles[index];
	if (!role) throw new Error(`roleAt: no role at index ${index}`);
	return role;
}

function reindexRoleOrder(body: Draft<TemplateBody>): void {
	body.roles.forEach((role, index) => {
		role.order = index;
	});
}

export function addRole(role: Role, index?: number): Command {
	return {
		name: 'addRole',
		apply(draft: Draft<TemplateBody>) {
			const insertAt = index ?? draft.roles.length;
			draft.roles.splice(insertAt, 0, role as Draft<Role>);
			reindexRoleOrder(draft);
			return removeRole(role.id);
		},
	};
}

// No "can't remove a role that fields still reference" guard here — that's
// enforced at the call site (the Recipients panel prompts reassign-or-delete
// first), matching `deletePage`'s "commands do exactly what they're told"
// convention. See BUILD_STATUS.md for where that prompt is wired once
// fillable fields exist.
export function removeRole(roleId: RoleId): Command {
	return {
		name: 'removeRole',
		apply(draft: Draft<TemplateBody>) {
			const index = findRoleIndex(draft, roleId);
			const removed = snapshot<Role>(roleAt(draft, index));
			draft.roles.splice(index, 1);
			reindexRoleOrder(draft);
			return addRole(removed, index);
		},
	};
}

export function renameRole(roleId: RoleId, name: string): Command {
	return {
		name: 'renameRole',
		apply(draft: Draft<TemplateBody>) {
			const role = roleAt(draft, findRoleIndex(draft, roleId));
			const previousName = role.name;
			role.name = name;
			return renameRole(roleId, previousName);
		},
	};
}

export function recolorRole(roleId: RoleId, color: string): Command {
	return {
		name: 'recolorRole',
		apply(draft: Draft<TemplateBody>) {
			const role = roleAt(draft, findRoleIndex(draft, roleId));
			const previousColor = role.color;
			role.color = color;
			return recolorRole(roleId, previousColor);
		},
	};
}

export function setIsSender(roleId: RoleId, isSender: boolean): Command {
	return {
		name: 'setIsSender',
		apply(draft: Draft<TemplateBody>) {
			const role = roleAt(draft, findRoleIndex(draft, roleId));
			const previous = role.isSender;
			role.isSender = isSender;
			return setIsSender(roleId, previous);
		},
	};
}

/** `undefined` clears sequential signing for this role — see `Role.signingOrder`'s `?:`. */
export function setSigningOrder(roleId: RoleId, signingOrder: number | undefined): Command {
	return {
		name: 'setSigningOrder',
		apply(draft: Draft<TemplateBody>) {
			const role = roleAt(draft, findRoleIndex(draft, roleId));
			const previous = role.signingOrder;
			if (signingOrder === undefined) delete role.signingOrder;
			else role.signingOrder = signingOrder;
			return setSigningOrder(roleId, previous);
		},
	};
}

/** Moves a role to `toIndex` in the list (clamped in range); reorders, does not resize. */
export function moveRole(roleId: RoleId, toIndex: number): Command {
	return {
		name: 'moveRole',
		apply(draft: Draft<TemplateBody>) {
			const fromIndex = findRoleIndex(draft, roleId);
			const clamped = Math.max(0, Math.min(toIndex, draft.roles.length - 1));
			const [moved] = draft.roles.splice(fromIndex, 1);
			draft.roles.splice(clamped, 0, moved!);
			reindexRoleOrder(draft);
			return moveRole(roleId, fromIndex);
		},
	};
}

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import {
	addRole,
	createRole,
	defaultRoleColor,
	moveRole,
	nextRoleName,
	recolorRole,
	removeRole,
	renameRole,
	setIsSender,
	setSigningOrder,
} from './roleCommands';
import { makeBody } from './testFixtures';

describe('createRole / nextRoleName / defaultRoleColor', () => {
	it('nextRoleName picks the first unused "Role N", not just a count', () => {
		expect(nextRoleName([])).toBe('Role 1');
		expect(nextRoleName([createRole({ name: 'Role 1', color: '#000' })])).toBe('Role 2');
		expect(nextRoleName([createRole({ name: 'Client', color: '#000' })])).toBe('Role 1');
		// Gap in the middle: "Role 1" removed, "Role 2" still present — must not reuse "Role 2".
		expect(nextRoleName([createRole({ name: 'Role 2', color: '#000' })])).toBe('Role 1');
	});

	it('defaultRoleColor rotates through the palette rather than repeating the first color', () => {
		const roles = [createRole({ name: 'a', color: defaultRoleColor([]) })];
		const second = defaultRoleColor(roles);
		expect(second).not.toBe(roles[0]!.color);
	});
});

describe('addRole / removeRole', () => {
	it('addRole appends by default and reindexes order; its inverse removes it and restores order', () => {
		const original = makeBody();
		const role = createRole({ name: 'Client', color: '#2563eb' });
		let inverse!: Command;

		const afterAdd = produce(original, (draft) => {
			inverse = addRole(role).apply(draft);
		});
		expect(afterAdd.roles.map((r) => r.id)).toEqual([role.id]);
		expect(afterAdd.roles.map((r) => r.order)).toEqual([0]);

		const afterUndo = produce(afterAdd, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('addRole at an explicit index inserts there; removeRole removes and reindexes; its inverse restores the exact role at the same index', () => {
		const roleA = createRole({ name: 'A', color: '#111' });
		const roleB = createRole({ name: 'B', color: '#222' });
		const withA = produce(makeBody(), (draft) => {
			addRole(roleA).apply(draft);
		});
		const withBoth = produce(withA, (draft) => {
			addRole(roleB, 0).apply(draft);
		});
		expect(withBoth.roles.map((r) => r.id)).toEqual([roleB.id, roleA.id]);
		expect(withBoth.roles.map((r) => r.order)).toEqual([0, 1]);

		let inverse!: Command;
		const afterRemove = produce(withBoth, (draft) => {
			inverse = removeRole(roleB.id).apply(draft);
		});
		expect(afterRemove.roles.map((r) => r.id)).toEqual([roleA.id]);

		const afterUndo = produce(afterRemove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(withBoth);
	});
});

describe('renameRole / recolorRole / setIsSender / setSigningOrder', () => {
	function bodyWithRole() {
		const role = createRole({ name: 'Client', color: '#2563eb' });
		return { role, body: produce(makeBody(), (draft) => void addRole(role).apply(draft)) };
	}

	it('renameRole renames; its inverse restores the previous name', () => {
		const { role, body } = bodyWithRole();
		let inverse!: Command;
		const after = produce(body, (draft) => {
			inverse = renameRole(role.id, 'Sales Rep').apply(draft);
		});
		expect(after.roles[0]?.name).toBe('Sales Rep');
		const undone = produce(after, (draft) => void inverse.apply(draft));
		expect(undone).toEqual(body);
	});

	it('recolorRole recolors; its inverse restores the previous color', () => {
		const { role, body } = bodyWithRole();
		let inverse!: Command;
		const after = produce(body, (draft) => {
			inverse = recolorRole(role.id, '#ff0000').apply(draft);
		});
		expect(after.roles[0]?.color).toBe('#ff0000');
		const undone = produce(after, (draft) => void inverse.apply(draft));
		expect(undone).toEqual(body);
	});

	it('setIsSender toggles; its inverse restores the previous value', () => {
		const { role, body } = bodyWithRole();
		let inverse!: Command;
		const after = produce(body, (draft) => {
			inverse = setIsSender(role.id, true).apply(draft);
		});
		expect(after.roles[0]?.isSender).toBe(true);
		const undone = produce(after, (draft) => void inverse.apply(draft));
		expect(undone).toEqual(body);
	});

	it('setSigningOrder sets and clears (undefined) it; its inverse restores the previous state either way', () => {
		const { role, body } = bodyWithRole();
		let inverse!: Command;
		const withOrder = produce(body, (draft) => {
			inverse = setSigningOrder(role.id, 2).apply(draft);
		});
		expect(withOrder.roles[0]?.signingOrder).toBe(2);

		let clearInverse!: Command;
		const cleared = produce(withOrder, (draft) => {
			clearInverse = setSigningOrder(role.id, undefined).apply(draft);
		});
		expect(cleared.roles[0]?.signingOrder).toBeUndefined();

		const restoredOrder = produce(cleared, (draft) => void clearInverse.apply(draft));
		expect(restoredOrder.roles[0]?.signingOrder).toBe(2);

		const restoredNone = produce(withOrder, (draft) => void inverse.apply(draft));
		expect(restoredNone.roles[0]?.signingOrder).toBeUndefined();
	});

	it('two edit+undo cycles in a row do not touch a revoked draft proxy (same regression class as blockCommands.test.ts)', () => {
		const { role, body: initial } = bodyWithRole();
		let body = initial;
		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			body = produce(body, (draft) => {
				inverse = renameRole(role.id, `Name ${cycle}`).apply(draft);
			});
			expect(body.roles[0]?.name).toBe(`Name ${cycle}`);
			body = produce(body, (draft) => void inverse.apply(draft));
		}
	});
});

describe('moveRole', () => {
	it('reorders and reindexes; its inverse restores the original order', () => {
		const roleA = createRole({ name: 'A', color: '#111' });
		const roleB = createRole({ name: 'B', color: '#222' });
		const roleC = createRole({ name: 'C', color: '#333' });
		let body = makeBody();
		body = produce(body, (draft) => void addRole(roleA).apply(draft));
		body = produce(body, (draft) => void addRole(roleB).apply(draft));
		body = produce(body, (draft) => void addRole(roleC).apply(draft));

		let inverse!: Command;
		const moved = produce(body, (draft) => {
			inverse = moveRole(roleC.id, 0).apply(draft);
		});
		expect(moved.roles.map((r) => r.id)).toEqual([roleC.id, roleA.id, roleB.id]);
		expect(moved.roles.map((r) => r.order)).toEqual([0, 1, 2]);

		const undone = produce(moved, (draft) => void inverse.apply(draft));
		expect(undone).toEqual(body);
	});

	it('clamps an out-of-range target index into bounds', () => {
		const roleA = createRole({ name: 'A', color: '#111' });
		const roleB = createRole({ name: 'B', color: '#222' });
		let body = makeBody();
		body = produce(body, (draft) => void addRole(roleA).apply(draft));
		body = produce(body, (draft) => void addRole(roleB).apply(draft));

		const moved = produce(body, (draft) => {
			moveRole(roleA.id, 99).apply(draft);
		});
		expect(moved.roles.map((r) => r.id)).toEqual([roleB.id, roleA.id]);
	});
});

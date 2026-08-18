import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { defaultTheme, setTheme } from './themeCommands';
import { makeBody } from './testFixtures';

describe('setTheme', () => {
	it('replaces the template-wide theme wholesale; its inverse restores the original', () => {
		const original = makeBody();
		const newTheme = { ...defaultTheme(), primaryColor: '#ff00ff', baseSpacing: 24 };
		let inverse!: Command;

		const afterEdit = produce(original, (draft) => {
			inverse = setTheme(newTheme).apply(draft);
		});
		expect(afterEdit.settings.theme).toEqual(newTheme);

		const afterUndo = produce(afterEdit, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('two edit+undo cycles in a row do not touch a revoked draft proxy', () => {
		// Same regression class as blockCommands.test.ts's identical-purpose
		// test — see its comment for why the *second* cycle, not the first,
		// is where a captured-by-reference (rather than snapshotted) previous
		// value would throw.
		let body = makeBody();

		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			const theme = { ...defaultTheme(), baseSpacing: 10 + cycle };
			body = produce(body, (draft) => {
				inverse = setTheme(theme).apply(draft);
			});
			expect(body.settings.theme.baseSpacing).toBe(10 + cycle);

			body = produce(body, (draft) => {
				inverse.apply(draft);
			});
		}
	});
});

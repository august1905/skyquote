import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { addVariable, removeVariable, updateVariable } from './variableCommands';
import { makeBody } from './testFixtures';

function customVariable() {
	return { key: 'Custom.Discount', label: 'Discount', source: 'custom' as const, defaultValue: '10%' };
}

describe('addVariable / removeVariable', () => {
	it('addVariable appends by default; its inverse removes it', () => {
		const original = makeBody();
		const variable = customVariable();
		let inverse!: Command;

		const afterAdd = produce(original, (draft) => {
			inverse = addVariable(variable).apply(draft);
		});
		expect(afterAdd.variables).toEqual([variable]);

		const afterUndo = produce(afterAdd, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(original);
	});

	it('removeVariable removes at any index; its inverse restores the exact variable at the same index', () => {
		const varA = { key: 'Custom.A', label: 'A', source: 'custom' as const };
		const varB = { key: 'Custom.B', label: 'B', source: 'custom' as const };
		let body = produce(makeBody(), (draft) => void addVariable(varA).apply(draft));
		body = produce(body, (draft) => void addVariable(varB).apply(draft));

		let inverse!: Command;
		const afterRemove = produce(body, (draft) => {
			inverse = removeVariable(varA.key).apply(draft);
		});
		expect(afterRemove.variables).toEqual([varB]);

		const afterUndo = produce(afterRemove, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(body);
	});
});

describe('updateVariable', () => {
	it('patches only the given fields; its inverse restores the exact previous state', () => {
		const variable = customVariable();
		const body = produce(makeBody(), (draft) => void addVariable(variable).apply(draft));

		let inverse!: Command;
		const afterUpdate = produce(body, (draft) => {
			inverse = updateVariable(variable.key, { label: 'New label', format: 'currency' }).apply(draft);
		});
		expect(afterUpdate.variables[0]).toEqual({ ...variable, label: 'New label', format: 'currency' });

		const afterUndo = produce(afterUpdate, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(body);
	});

	it('can explicitly clear an optional field (defaultValue) via undefined, and undo restores it', () => {
		const variable = customVariable();
		const body = produce(makeBody(), (draft) => void addVariable(variable).apply(draft));

		let inverse!: Command;
		const cleared = produce(body, (draft) => {
			inverse = updateVariable(variable.key, { defaultValue: undefined }).apply(draft);
		});
		expect(cleared.variables[0]?.defaultValue).toBeUndefined();

		const restored = produce(cleared, (draft) => void inverse.apply(draft));
		expect(restored.variables[0]?.defaultValue).toBe(variable.defaultValue);
	});

	it('two edit+undo cycles in a row do not touch a revoked draft proxy', () => {
		const variable = customVariable();
		let body = produce(makeBody(), (draft) => void addVariable(variable).apply(draft));

		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			body = produce(body, (draft) => {
				inverse = updateVariable(variable.key, { label: `Label ${cycle}` }).apply(draft);
			});
			expect(body.variables[0]?.label).toBe(`Label ${cycle}`);
			body = produce(body, (draft) => void inverse.apply(draft));
		}
	});
});

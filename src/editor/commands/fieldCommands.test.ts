import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { createField, deleteFieldsForRole, nextFieldName, reassignFieldsRole, setFieldConfig } from './fieldCommands';
import { collectAllFields } from '../fields/collectFields';
import { makeBodyWithFields, makeField, makeFieldBlock } from './testFixtures';
import { makeBody } from './testFixtures';

describe('nextFieldName / createField', () => {
	it('nextFieldName picks the first unused "{Label} N" for the given type', () => {
		expect(nextFieldName('signature', [])).toBe('Signature 1');
		expect(nextFieldName('signature', [makeField('a', 'r', { type: 'signature', name: 'Signature 1' })])).toBe('Signature 2');
		// Different types don't collide with each other's counters.
		expect(nextFieldName('initials', [makeField('a', 'r', { type: 'signature', name: 'Signature 1' })])).toBe('Initials 1');
	});

	it('createField auto-names and assigns the given role, starting unrequired', () => {
		const field = createField('checkbox', 'role-a', []);
		expect(field.name).toBe('Checkbox 1');
		expect(field.roleId).toBe('role-a');
		expect(field.required).toBe(false);
		expect(field.type).toBe('checkbox');
	});
});

describe('setFieldConfig', () => {
	it('patches a standalone FieldBlock\'s field; its inverse restores the exact previous state', () => {
		const field = makeField('field-1', 'role-a', { name: 'Text field 1' });
		const body = produce(makeBody(), (draft) => {
			draft.pages[0]!.blocks.push(makeFieldBlock('block-field', field));
		});

		let inverse!: Command;
		const afterPatch = produce(body, (draft) => {
			inverse = setFieldConfig('page-1', 'block-field', { name: 'Renamed', required: true, placeholder: 'Type here' }).apply(draft);
		});
		const patchedBlock = afterPatch.pages[0]?.blocks.find((b) => b.id === 'block-field');
		expect(patchedBlock).toMatchObject({ field: { name: 'Renamed', required: true, placeholder: 'Type here' } });

		const afterUndo = produce(afterPatch, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(body);
	});

	it('can explicitly clear an optional field (placeholder) via undefined, and undo restores it', () => {
		const field = makeField('field-1', 'role-a', { placeholder: 'Type here' });
		const body = produce(makeBody(), (draft) => {
			draft.pages[0]!.blocks.push(makeFieldBlock('block-field', field));
		});

		let inverse!: Command;
		const cleared = produce(body, (draft) => {
			inverse = setFieldConfig('page-1', 'block-field', { placeholder: undefined }).apply(draft);
		});
		const clearedBlock = cleared.pages[0]?.blocks.find((b) => b.id === 'block-field');
		expect(clearedBlock).toMatchObject({ field: { placeholder: undefined } });

		const restored = produce(cleared, (draft) => void inverse.apply(draft));
		const restoredBlock = restored.pages[0]?.blocks.find((b) => b.id === 'block-field');
		expect(restoredBlock).toMatchObject({ field: { placeholder: 'Type here' } });
	});
});

describe('reassignFieldsRole', () => {
	it('moves every field on the "from" role (inline and standalone, anywhere in the template) to the "to" role, leaving others untouched', () => {
		const body = makeBodyWithFields();
		let inverse!: Command;

		const afterReassign = produce(body, (draft) => {
			inverse = reassignFieldsRole('role-a', 'role-b').apply(draft);
		});
		const byId = new Map(collectAllFields(afterReassign).map((f) => [f.id, f]));
		expect(byId.get('field-text')?.roleId).toBe('role-b'); // was role-a
		expect(byId.get('field-standalone')?.roleId).toBe('role-b'); // was role-a
		expect(byId.get('field-cell')?.roleId).toBe('role-b'); // was already role-b, untouched
		expect(byId.get('field-column')?.roleId).toBe('role-b'); // was already role-b, untouched

		const afterUndo = produce(afterReassign, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(body);
	});

	it('two edit+undo cycles in a row do not touch a revoked draft proxy', () => {
		let body = makeBodyWithFields();
		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			body = produce(body, (draft) => {
				inverse = reassignFieldsRole('role-a', 'role-b').apply(draft);
			});
			body = produce(body, (draft) => void inverse.apply(draft));
		}
		expect(collectAllFields(body).find((f) => f.id === 'field-text')?.roleId).toBe('role-a');
	});
});

describe('deleteFieldsForRole', () => {
	it('removes every field on the given role (inline and standalone) from wherever it lives, leaving other-role fields and their surrounding content intact', () => {
		const body = makeBodyWithFields();
		let inverse!: Command;

		const afterDelete = produce(body, (draft) => {
			inverse = deleteFieldsForRole('role-a').apply(draft);
		});
		const remainingIds = collectAllFields(afterDelete)
			.map((f) => f.id)
			.sort();
		expect(remainingIds).toEqual(['field-cell', 'field-column']);
		// The standalone FieldBlock itself is gone, not just emptied.
		expect(afterDelete.pages[0]?.blocks.some((b) => b.id === 'block-field')).toBe(false);
		// The text block that only ever held the removed inline field still
		// exists, just with an empty paragraph now.
		const textBlock = afterDelete.pages[0]?.blocks.find((b) => b.id === 'block-text');
		expect(textBlock).toBeDefined();

		const afterUndo = produce(afterDelete, (draft) => void inverse.apply(draft));
		expect(afterUndo).toEqual(body);
	});
});

import { describe, expect, it } from 'vitest';
import { collectAllFields } from './collectFields';
import { makeBodyWithFields, makeFieldBlock, makeField, makeSmartContentBlock } from '../commands/testFixtures';

describe('collectAllFields', () => {
	it('finds fields inline in a text block, inline in a table cell, standalone, and inline nested inside a columns block', () => {
		const body = makeBodyWithFields();
		const ids = collectAllFields(body)
			.map((f) => f.id)
			.sort();
		expect(ids).toEqual(['field-cell', 'field-column', 'field-standalone', 'field-text']);
	});

	it('returns an empty array for a body with no fields', () => {
		expect(collectAllFields({ pages: [{ id: 'p', name: 'P', order: 0, blocks: [] }], roles: [], variables: [], settings: makeBodyWithFields().settings })).toEqual([]);
	});

	it('finds a field nested inside a SmartContentBlock, same whole-tree walk every other cross-cutting feature uses', () => {
		const field = makeField('field-smart', 'role-a');
		const smartContent = makeSmartContentBlock('smart-1', [makeFieldBlock('block-field', field)]);
		const body = { pages: [{ id: 'p', name: 'P', order: 0, blocks: [smartContent] }], roles: [], variables: [], settings: makeBodyWithFields().settings };
		expect(collectAllFields(body).map((f) => f.id)).toEqual(['field-smart']);
	});
});

import { describe, expect, it } from 'vitest';
import { collectAllFields } from './collectFields';
import { makeBodyWithFields } from '../commands/testFixtures';

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
});

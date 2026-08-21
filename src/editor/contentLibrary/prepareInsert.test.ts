import { describe, expect, it } from 'vitest';
import type { Block, FieldBlock, FillableField, Role, TextBlock } from '../types';
import { collectAllFields } from '../fields/collectFields';
import { makeBodyWithFields, makeColumnsBlock, makeField, makeFieldBlock, makeFieldNode, makeTextBlock } from '../commands/testFixtures';
import { prepareLibraryBlocksForInsert } from './prepareInsert';

const ROLES: Role[] = [
	{ id: 'role-a', name: 'Role A', color: '#111', order: 0, isSender: false },
	{ id: 'role-b', name: 'Role B', color: '#222', order: 1, isSender: false },
];

/** Every field anywhere in a set of blocks, reusing the production walker so these tests can't drift from it. */
function fieldsIn(blocks: Block[]): FillableField[] {
	return collectAllFields({
		pages: [{ id: 'p', name: 'P', order: 0, blocks }],
		roles: [],
		variables: [],
		settings: makeBodyWithFields().settings,
	});
}

describe('prepareLibraryBlocksForInsert', () => {
	it('gives every inserted block a fresh id and stamps contentLibraryRef on the top level', () => {
		const saved = [makeTextBlock('saved-1', 'hello'), makeTextBlock('saved-2', 'world')];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		expect(inserted.map((b) => b.id)).not.toContain('saved-1');
		expect(inserted.map((b) => b.id)).not.toContain('saved-2');
		expect(new Set(inserted.map((b) => b.id)).size).toBe(2);
		for (const block of inserted) expect(block.contentLibraryRef).toBe('lib-item-1');
		// Content is preserved verbatim — only identity changes.
		expect((inserted[0] as TextBlock).doc).toEqual((saved[0] as TextBlock).doc);
	});

	it('never mutates the payload it was given, so the cached library item stays reusable', () => {
		const saved = [makeFieldBlock('saved-field-block', makeField('field-original', 'role-a'))];
		const before = structuredClone(saved);

		prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		expect(saved).toEqual(before);
	});

	it('re-ids fields, because a document keys its submitted values by field id', () => {
		const saved = [makeFieldBlock('saved-field-block', makeField('field-original', 'role-a'))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		const field = (inserted[0] as FieldBlock).field;
		expect(field.id).not.toBe('field-original');
	});

	it('renames inserted fields so they never collide with fields already in the template (§6.1 rule 2)', () => {
		const existing = [makeField('existing-1', 'role-a', { type: 'text', name: 'Text field 1' })];
		const saved = [makeFieldBlock('saved-block', makeField('saved-1', 'role-a', { type: 'text', name: 'Text field 1' }))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', existing, ROLES);

		expect((inserted[0] as FieldBlock).field.name).toBe('Text field 2');
	});

	it('keeps two inserted fields of the same type from colliding with each other, not just with the template', () => {
		const saved = [
			makeFieldBlock('saved-a', makeField('a', 'role-a', { type: 'text', name: 'Text field 1' })),
			makeFieldBlock('saved-b', makeField('b', 'role-a', { type: 'text', name: 'Text field 1' })),
		];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		const names = fieldsIn(inserted).map((f) => f.name);
		expect(new Set(names).size).toBe(2);
	});

	it('remaps a field whose role does not exist here onto the first role by order', () => {
		const saved = [makeFieldBlock('saved-block', makeField('saved-1', 'role-from-another-template'))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		expect((inserted[0] as FieldBlock).field.roleId).toBe('role-a');
	});

	it('picks the first role by `order`, not by array position', () => {
		const outOfOrder: Role[] = [
			{ id: 'role-second', name: 'Second', color: '#111', order: 5, isSender: false },
			{ id: 'role-first', name: 'First', color: '#222', order: 1, isSender: false },
		];
		const saved = [makeFieldBlock('saved-block', makeField('saved-1', 'role-missing'))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], outOfOrder);

		expect((inserted[0] as FieldBlock).field.roleId).toBe('role-first');
	});

	it('keeps a field on its original role when that role does exist here', () => {
		const saved = [makeFieldBlock('saved-block', makeField('saved-1', 'role-b'))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		expect((inserted[0] as FieldBlock).field.roleId).toBe('role-b');
	});

	it('leaves the role id dangling when the target template has no roles at all — the validation surface reports it rather than content being silently changed', () => {
		const saved = [makeFieldBlock('saved-block', makeField('saved-1', 'role-from-another-template'))];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], []);

		expect((inserted[0] as FieldBlock).field.roleId).toBe('role-from-another-template');
	});

	it('remaps fields nested inside a container and inline inside rich text, not just standalone field blocks', () => {
		const inlineField = makeField('inline-original', 'role-missing');
		const textWithInlineField: TextBlock = {
			...makeTextBlock('text-block'),
			doc: { type: 'doc', content: [{ type: 'paragraph', content: [makeFieldNode(inlineField)] }] },
		};
		const saved = [makeColumnsBlock('cols', [[textWithInlineField], []])];

		const inserted = prepareLibraryBlocksForInsert(saved, 'lib-item-1', [], ROLES);

		const fields = fieldsIn(inserted);
		expect(fields).toHaveLength(1);
		expect(fields[0]?.id).not.toBe('inline-original');
		expect(fields[0]?.roleId).toBe('role-a');
	});
});

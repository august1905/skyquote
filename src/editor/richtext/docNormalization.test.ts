import { describe, expect, it } from 'vitest';
import type { RichTextDoc } from '../types';
import { docsEqual, normalizeDoc } from './docNormalization';

describe('docsEqual', () => {
	// The regression this whole module exists for. Adding the TextAlign
	// extension (§2's toolbar) made ProseMirror serialize `textAlign: null` on
	// every paragraph, so a doc stored before that differed textually from the
	// same doc round-tripped through the editor. Every text block then pushed a
	// setBlockDoc the moment it mounted: templates went dirty on load, and the
	// undo stack filled with entries that changed nothing.
	it('treats a null global attribute as equivalent to no attrs at all', () => {
		const stored: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
		const fromEditor: RichTextDoc = {
			type: 'doc',
			content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'Hi' }] }],
		};
		expect(docsEqual(stored, fromEditor)).toBe(true);
	});

	it('treats an empty content array as equivalent to no content key', () => {
		const stored: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
		const fromEditor: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] };
		expect(docsEqual(stored, fromEditor)).toBe(true);
	});

	it('still reports a real difference — a set alignment is not the same as an unset one', () => {
		const left: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] };
		const right: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' } }] };
		expect(docsEqual(left, right)).toBe(false);
	});

	it('still reports differing text', () => {
		const left: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] };
		const right: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] };
		expect(docsEqual(left, right)).toBe(false);
	});

	it('is insensitive to the key order the two docs happened to arrive in', () => {
		const left = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } as RichTextDoc;
		// Same node, keys written in the opposite order.
		const right = { type: 'doc', content: [{ content: [{ text: 'x', type: 'text' }], type: 'paragraph' }] } as unknown as RichTextDoc;
		expect(docsEqual(left, right)).toBe(true);
	});

	it('normalizes nested content, not just the top level', () => {
		const stored: RichTextDoc = {
			type: 'doc',
			content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'i' }] }] }] }],
		};
		const fromEditor: RichTextDoc = {
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'i' }] }] },
					],
				},
			],
		};
		expect(docsEqual(stored, fromEditor)).toBe(true);
	});
});

describe('normalizeDoc', () => {
	it('strips null attrs, empty content and empty marks so stored docs stay clean', () => {
		const noisy: RichTextDoc = {
			type: 'doc',
			content: [{ type: 'paragraph', attrs: { textAlign: null }, marks: [], content: [{ type: 'text', text: 'kept', marks: [] }] }],
		};
		expect(normalizeDoc(noisy)).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kept' }] }] });
	});

	it('keeps attrs that carry a real value', () => {
		const doc: RichTextDoc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2, textAlign: null } }] };
		expect(normalizeDoc(doc)).toEqual({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 } }] });
	});

	it('keeps marks that are actually present', () => {
		const doc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b', marks: [{ type: 'bold' }] }] }] };
		expect(normalizeDoc(doc).content[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
	});

	it('preserves an empty string of text rather than dropping it as falsy', () => {
		const doc: RichTextDoc = { type: 'doc', content: [{ type: 'text', text: '' }] };
		expect(normalizeDoc(doc).content[0]).toEqual({ type: 'text', text: '' });
	});
});

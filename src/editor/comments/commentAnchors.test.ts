import { describe, expect, it } from 'vitest';
import type { Comment, MentionableUser } from '../../api/comments';
import type { Block, Page } from '../types';
import {
	groupIntoThreads,
	hasTextAnchor,
	isAnchorInBounds,
	parseMentions,
	richTextDocSize,
	sortThreadsByDocumentOrder,
	splitBodyIntoSegments,
	unresolvedThreadCount,
} from './commentAnchors';

function comment(overrides: Partial<Comment> & Pick<Comment, 'id'>): Comment {
	return {
		templateId: 't1',
		blockId: null,
		anchorStart: null,
		anchorEnd: null,
		parentCommentId: null,
		body: 'a comment',
		authorUserId: 'u1',
		mentionedUserIds: [],
		createdAt: '2026-08-21T10:00:00.000Z',
		editedAt: null,
		resolvedAt: null,
		resolvedByUserId: null,
		...overrides,
	};
}

function textBlock(id: string): Block {
	return { id, type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [] } };
}

function page(id: string, blocks: Block[]): Page {
	return { id, name: 'Page', blocks } as Page;
}

describe('groupIntoThreads', () => {
	it('pairs each root with its replies, in the order they were posted', () => {
		const threads = groupIntoThreads([
			comment({ id: 'root-1' }),
			comment({ id: 'reply-1', parentCommentId: 'root-1', createdAt: '2026-08-21T10:01:00.000Z' }),
			comment({ id: 'root-2' }),
			comment({ id: 'reply-2', parentCommentId: 'root-1', createdAt: '2026-08-21T10:02:00.000Z' }),
		]);

		expect(threads).toHaveLength(2);
		expect(threads[0]?.root.id).toBe('root-1');
		expect(threads[0]?.replies.map((reply) => reply.id)).toEqual(['reply-1', 'reply-2']);
		expect(threads[1]?.replies).toEqual([]);
	});

	it('drops a reply whose root is missing rather than promoting it to a thread of its own', () => {
		// The backend deletes replies with their root, so this only happens if
		// that cascade partly failed — and an answer with no question on screen
		// is worse than nothing.
		const threads = groupIntoThreads([comment({ id: 'orphan', parentCommentId: 'long-gone' })]);
		expect(threads).toEqual([]);
	});
});

describe('sortThreadsByDocumentOrder', () => {
	const pages = [page('p1', [textBlock('b1'), textBlock('b2')]), page('p2', [textBlock('b3')])];

	it('orders threads by where their block sits in the document, not when they were written', () => {
		const threads = groupIntoThreads([
			comment({ id: 'on-b3', blockId: 'b3', createdAt: '2026-08-21T09:00:00.000Z' }),
			comment({ id: 'on-b1', blockId: 'b1', createdAt: '2026-08-21T11:00:00.000Z' }),
			comment({ id: 'on-b2', blockId: 'b2', createdAt: '2026-08-21T10:00:00.000Z' }),
		]);

		expect(sortThreadsByDocumentOrder(threads, pages).map((thread) => thread.root.id)).toEqual(['on-b1', 'on-b2', 'on-b3']);
	});

	it('sorts a thread on a deleted block last, and a template-level thread first', () => {
		const threads = groupIntoThreads([
			comment({ id: 'detached', blockId: 'gone' }),
			comment({ id: 'on-b1', blockId: 'b1' }),
			comment({ id: 'template-level', blockId: null }),
		]);

		expect(sortThreadsByDocumentOrder(threads, pages).map((thread) => thread.root.id)).toEqual(['template-level', 'on-b1', 'detached']);
	});

	it('finds blocks nested inside containers, so a comment in a column sorts where it looks', () => {
		const nested = textBlock('inner');
		const columns = { id: 'cols', type: 'columns', locked: false, style: {}, widths: [1], columns: [[nested]] } as unknown as Block;
		const withContainer = [page('p1', [textBlock('first'), columns, textBlock('last')])];
		const threads = groupIntoThreads([comment({ id: 'on-last', blockId: 'last' }), comment({ id: 'on-inner', blockId: 'inner' })]);

		expect(sortThreadsByDocumentOrder(threads, withContainer).map((thread) => thread.root.id)).toEqual(['on-inner', 'on-last']);
	});

	it('orders two threads on the same block oldest first', () => {
		const threads = groupIntoThreads([
			comment({ id: 'later', blockId: 'b1', createdAt: '2026-08-21T12:00:00.000Z' }),
			comment({ id: 'earlier', blockId: 'b1', createdAt: '2026-08-21T09:00:00.000Z' }),
		]);
		expect(sortThreadsByDocumentOrder(threads, pages).map((thread) => thread.root.id)).toEqual(['earlier', 'later']);
	});
});

describe('unresolvedThreadCount', () => {
	it('counts threads rather than messages', () => {
		const threads = groupIntoThreads([
			comment({ id: 'open' }),
			comment({ id: 'r1', parentCommentId: 'open' }),
			comment({ id: 'r2', parentCommentId: 'open' }),
			comment({ id: 'done', resolvedAt: '2026-08-21T11:00:00.000Z' }),
		]);
		expect(unresolvedThreadCount(threads)).toBe(1);
	});
});

describe('richTextDocSize', () => {
	// Mirrors ProseMirror's own arithmetic: text counts its characters, a leaf
	// counts 1, anything else counts 2 for its open/close tokens plus children.
	it('measures an empty paragraph as its two boundary tokens', () => {
		expect(richTextDocSize({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(2);
	});

	it('adds text length inside the paragraph', () => {
		expect(
			richTextDocSize({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] })
		).toBe(7);
	});

	it('counts an inline atom — a variable chip — as one position', () => {
		expect(
			richTextDocSize({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, { type: 'variable' }] }],
			})
		).toBe(6);
	});

	it('sums multiple blocks', () => {
		expect(
			richTextDocSize({
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] },
					{ type: 'paragraph', content: [{ type: 'text', text: 'cde' }] },
				],
			})
		).toBe(9);
	});

	it('treats a missing or empty doc as size zero rather than throwing', () => {
		expect(richTextDocSize(null)).toBe(0);
		expect(richTextDocSize({ type: 'doc' })).toBe(0);
	});
});

describe('isAnchorInBounds', () => {
	const docSize = 12;

	it('accepts a range that fits the current text', () => {
		expect(isAnchorInBounds(comment({ id: 'c', anchorStart: 1, anchorEnd: 6 }), docSize)).toBe(true);
	});

	it('rejects a range that now runs past the end — the drift case', () => {
		expect(isAnchorInBounds(comment({ id: 'c', anchorStart: 8, anchorEnd: 20 }), docSize)).toBe(false);
	});

	it('rejects an empty or inverted range', () => {
		expect(isAnchorInBounds(comment({ id: 'c', anchorStart: 4, anchorEnd: 4 }), docSize)).toBe(false);
		expect(isAnchorInBounds(comment({ id: 'c', anchorStart: 6, anchorEnd: 2 }), docSize)).toBe(false);
	});

	it('is false for a block-level anchor, which has no range at all', () => {
		expect(isAnchorInBounds(comment({ id: 'c' }), docSize)).toBe(false);
		expect(hasTextAnchor(comment({ id: 'c' }))).toBe(false);
		expect(hasTextAnchor(comment({ id: 'c', anchorStart: 0, anchorEnd: 3 }))).toBe(true);
	});
});

describe('mentions', () => {
	const users: MentionableUser[] = [
		{ id: 'u1', name: 'Sam Taylor', email: 'sam@example.com' },
		{ id: 'u2', name: 'Sam', email: 'sam2@example.com' },
		{ id: 'u3', name: 'Ada Lovelace', email: 'ada@example.com' },
	];

	it('resolves a mention to its user id', () => {
		expect(parseMentions('can @Ada Lovelace check this?', users)).toEqual(['u3']);
	});

	it('prefers the longest matching name, so a full name beats a prefix of it', () => {
		// Both "Sam Taylor" and "Sam" match the text; only the longer one is
		// what the author actually typed.
		expect(parseMentions('@Sam Taylor please look', users)).toEqual(['u1']);
	});

	it('deduplicates a name mentioned twice', () => {
		expect(parseMentions('@Sam and @Sam again', users)).toEqual(['u2']);
	});

	it('finds nothing when the name matches nobody', () => {
		expect(parseMentions('@Nobody At All', users)).toEqual([]);
	});

	it('splits a body into text and mention segments for rendering', () => {
		expect(splitBodyIntoSegments('hey @Ada Lovelace look', users)).toEqual([
			{ kind: 'text', text: 'hey ' },
			{ kind: 'mention', text: '@Ada Lovelace', userId: 'u3' },
			{ kind: 'text', text: ' look' },
		]);
	});

	it('leaves an unrecognised @word as plain text', () => {
		expect(splitBodyIntoSegments('email me @ work', users)).toEqual([{ kind: 'text', text: 'email me @ work' }]);
	});

	it('handles a body that is nothing but a mention', () => {
		expect(splitBodyIntoSegments('@Sam', users)).toEqual([{ kind: 'mention', text: '@Sam', userId: 'u2' }]);
	});
});

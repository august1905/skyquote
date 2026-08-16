import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Command } from './types';
import { deleteBlock, duplicateBlock, insertBlock, moveBlock } from './blockCommands';
import { makeBody, makeTextBlock } from './testFixtures';

// Every test below applies a command and its inverse in two SEPARATE
// produce() calls — matching how the real editor store uses them (each
// runCommand/undo/redo is its own zustand `set`, i.e. its own produce). This
// is deliberate: it's the only way a test would actually catch the bug
// snapshot()/current() exist to prevent (see blockTree.ts) — a captured
// Immer draft proxy is only revoked once its *own* producer returns, so a
// bug there wouldn't show up within a single produce call, only across two.

describe('insertBlock / deleteBlock', () => {
	it('insertBlock adds the block at the given index; its inverse removes exactly that', () => {
		const original = makeBody();
		const newBlock = makeTextBlock('block-new', 'inserted');
		let inverse!: Command;

		const afterInsert = produce(original, (draft) => {
			inverse = insertBlock('page-1', 1, newBlock).apply(draft);
		});

		expect(afterInsert.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-1', 'block-new', 'block-2']);

		const afterUndo = produce(afterInsert, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('deleteBlock removes the block; its inverse re-inserts it at the same index with identical content', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterDelete = produce(original, (draft) => {
			inverse = deleteBlock('page-1', 'block-1').apply(draft);
		});

		expect(afterDelete.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-2']);

		const afterUndo = produce(afterDelete, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('two delete+undo cycles on the same block do not touch a revoked draft proxy', () => {
		// The regression test: if deleteBlock ever captured `page.blocks[index]`
		// by reference instead of via snapshot(), this second cycle is where it
		// would throw ("Cannot perform 'get' on a proxy that has been revoked"),
		// not the first — the first produce's proxies are only revoked once
		// that produce call returns, which is exactly the boundary between
		// cycle 1 and cycle 2 here.
		let body = makeBody();

		for (let cycle = 0; cycle < 2; cycle++) {
			let inverse!: Command;
			body = produce(body, (draft) => {
				inverse = deleteBlock('page-1', 'block-1').apply(draft);
			});
			expect(body.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-2']);

			body = produce(body, (draft) => {
				inverse.apply(draft);
			});
			expect(body.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-1', 'block-2']);
		}
	});
});

describe('duplicateBlock', () => {
	it('inserts a clone right after the source, with a new id but identical content', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterDuplicate = produce(original, (draft) => {
			inverse = duplicateBlock('page-1', 'block-1').apply(draft);
		});

		const ids = afterDuplicate.pages[0]?.blocks.map((b) => b.id);
		expect(ids).toHaveLength(3);
		expect(ids?.[0]).toBe('block-1');
		expect(ids?.[1]).not.toBe('block-1');
		expect(ids?.[2]).toBe('block-2');

		const clone = afterDuplicate.pages[0]?.blocks[1];
		const source = afterDuplicate.pages[0]?.blocks[0];
		if (clone?.type !== 'text' || source?.type !== 'text') throw new Error('expected text blocks');
		expect(clone.doc).toEqual(source.doc);

		const afterUndo = produce(afterDuplicate, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('moveBlock', () => {
	it('reorders within a page using arrayMove semantics (moving index 0 to index 1 lands it after the old index 1)', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterMove = produce(original, (draft) => {
			inverse = moveBlock('page-1', 'block-1', 'page-1', 1).apply(draft);
		});
		expect(afterMove.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-1']);

		const afterUndo = produce(afterMove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('moves a block across pages; its inverse moves it back to the original page and index', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterMove = produce(original, (draft) => {
			inverse = moveBlock('page-1', 'block-2', 'page-2', 0).apply(draft);
		});
		expect(afterMove.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-1']);
		expect(afterMove.pages[1]?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-3']);

		const afterUndo = produce(afterMove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

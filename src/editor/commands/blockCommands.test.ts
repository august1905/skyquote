import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ColumnsBlock, RichTextDoc, TextBlock } from '../types';
import type { Command } from './types';
import { deleteBlock, duplicateBlock, insertBlock, moveBlock, setBlockDoc, setBlockStyle, toggleBlockLock } from './blockCommands';
import { createColumnsBlock } from './blockTree';
import { makeBody, makeBodyWithColumns, makeTextBlock } from './testFixtures';

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
			inverse = insertBlock({ pageId: 'page-1' }, 1, newBlock).apply(draft);
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

describe('setBlockDoc', () => {
	it('replaces the doc; its inverse restores the original', () => {
		const original = makeBody();
		const newDoc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }] };
		let inverse!: Command;

		const afterEdit = produce(original, (draft) => {
			inverse = setBlockDoc('page-1', 'block-1', newDoc).apply(draft);
		});

		const editedBlock = afterEdit.pages[0]?.blocks[0];
		if (editedBlock?.type !== 'text') throw new Error('expected a text block');
		expect(editedBlock.doc).toEqual(newDoc);

		const afterUndo = produce(afterEdit, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('throws for a block that is not a text block', () => {
		const original = makeBody();
		const nonTextBlock = {
			id: 'block-image',
			type: 'image' as const,
			locked: false,
			style: {},
			assetId: 'asset-1',
			url: 'https://example.com/a.png',
			alt: '',
			width: 100,
			height: 100,
			shape: 'rect' as const,
		};
		const withImage = produce(original, (draft) => {
			draft.pages[0]?.blocks.push(nonTextBlock);
		});

		expect(() =>
			produce(withImage, (draft) => {
				setBlockDoc('page-1', 'block-image', { type: 'doc', content: [] }).apply(draft);
			})
		).toThrow(/is a image block, not text/);
	});
});

describe('moveBlock', () => {
	it('reorders within a page using arrayMove semantics (moving index 0 to index 1 lands it after the old index 1)', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterMove = produce(original, (draft) => {
			inverse = moveBlock('page-1', 'block-1', { pageId: 'page-1' }, 1).apply(draft);
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
			inverse = moveBlock('page-1', 'block-2', { pageId: 'page-2' }, 0).apply(draft);
		});
		expect(afterMove.pages[0]?.blocks.map((b) => b.id)).toEqual(['block-1']);
		expect(afterMove.pages[1]?.blocks.map((b) => b.id)).toEqual(['block-2', 'block-3']);

		const afterUndo = produce(afterMove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

// These exercise the generalized addressing that makes a ColumnsBlock's
// nested children reachable through the exact same commands top-level
// blocks use — no per-block-type branching anywhere in blockCommands.ts.
describe('nested blocks (Columns)', () => {
	it('insertBlock places a block inside a specific column; its inverse removes exactly that', () => {
		const original = makeBodyWithColumns();
		const newBlock = makeTextBlock('block-new', 'inserted');
		let inverse!: Command;

		const container = { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } };
		const afterInsert = produce(original, (draft) => {
			inverse = insertBlock(container, 1, newBlock).apply(draft);
		});

		const columnsBlock = afterInsert.pages[0]?.blocks[0] as ColumnsBlock;
		expect(columnsBlock.columns[0]?.map((b) => b.id)).toEqual(['col0-block-1', 'block-new']);
		expect(columnsBlock.columns[1]?.map((b) => b.id)).toEqual(['col1-block-1']);

		const afterUndo = produce(afterInsert, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('deleteBlock/duplicateBlock/setBlockDoc find a block nested in a column by id alone, same as a top-level block', () => {
		const original = makeBodyWithColumns();

		const afterEdit = produce(original, (draft) => {
			setBlockDoc('page-1', 'col1-block-1', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }] }).apply(
				draft
			);
		});
		const editedColumns = afterEdit.pages[0]?.blocks[0] as ColumnsBlock;
		const editedBlock = editedColumns.columns[1]?.[0];
		if (editedBlock?.type !== 'text') throw new Error('expected a text block');
		expect(editedBlock.doc.content[0]?.content?.[0]?.text).toBe('edited');
		// The other column is untouched.
		expect(editedColumns.columns[0]).toEqual(original.pages[0]?.blocks[0] && (original.pages[0].blocks[0] as ColumnsBlock).columns[0]);

		let duplicateInverse!: Command;
		const afterDuplicate = produce(original, (draft) => {
			duplicateInverse = duplicateBlock('page-1', 'col0-block-1').apply(draft);
		});
		const dupedColumns = afterDuplicate.pages[0]?.blocks[0] as ColumnsBlock;
		expect(dupedColumns.columns[0]?.map((b) => b.id)).toEqual(['col0-block-1', expect.stringMatching(/.+/)]);
		expect(dupedColumns.columns[0]?.[1]?.id).not.toBe('col0-block-1');
		const afterDuplicateUndo = produce(afterDuplicate, (draft) => {
			duplicateInverse.apply(draft);
		});
		expect(afterDuplicateUndo).toEqual(original);

		let deleteInverse!: Command;
		const afterDelete = produce(original, (draft) => {
			deleteInverse = deleteBlock('page-1', 'col0-block-1').apply(draft);
		});
		const afterDeleteColumns = afterDelete.pages[0]?.blocks[0] as ColumnsBlock;
		expect(afterDeleteColumns.columns[0]).toEqual([]);
		const afterDeleteUndo = produce(afterDelete, (draft) => {
			deleteInverse.apply(draft);
		});
		expect(afterDeleteUndo).toEqual(original);
	});

	it('moveBlock reorders within the same column', () => {
		const original = produce(makeBodyWithColumns(), (draft) => {
			const columnsBlock = draft.pages[0]?.blocks[0] as ColumnsBlock;
			columnsBlock.columns[0]?.push(makeTextBlock('col0-block-2', 'left-2'));
		});
		let inverse!: Command;

		const toContainer = { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } };
		const afterMove = produce(original, (draft) => {
			inverse = moveBlock('page-1', 'col0-block-1', toContainer, 1).apply(draft);
		});
		const movedColumns = afterMove.pages[0]?.blocks[0] as ColumnsBlock;
		expect(movedColumns.columns[0]?.map((b) => b.id)).toEqual(['col0-block-2', 'col0-block-1']);

		const afterUndo = produce(afterMove, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});

	it('insertBlock rejects placing a columns block inside a column — §4.4 caps nesting at depth 2', () => {
		const original = makeBodyWithColumns();
		const container = { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } };

		expect(() =>
			produce(original, (draft) => {
				insertBlock(container, 0, createColumnsBlock(2)).apply(draft);
			})
		).toThrow(/cannot place a columns block inside a column/);
	});

	it('moveBlock rejects moving a columns block into a column — §4.4 caps nesting at depth 2', () => {
		const original = produce(makeBodyWithColumns(), (draft) => {
			draft.pages[0]?.blocks.push(createColumnsBlock(2));
		});
		const nestedColumnsId = (original.pages[0]?.blocks[1] as ColumnsBlock).id;
		const toContainer = { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } };

		expect(() =>
			produce(original, (draft) => {
				moveBlock('page-1', nestedColumnsId, toContainer, 0).apply(draft);
			})
		).toThrow(/cannot place a columns block inside a column/);
	});

	it('duplicating a ColumnsBlock reassigns ids through its nested children too, so both copies stay independently addressable', () => {
		const original = makeBodyWithColumns();

		const afterDuplicate = produce(original, (draft) => {
			duplicateBlock('page-1', 'columns-1').apply(draft);
		});
		const [sourceColumns, clonedColumns] = afterDuplicate.pages[0]?.blocks as [ColumnsBlock, ColumnsBlock];
		const sourceChildIds = sourceColumns.columns.flat().map((b) => b.id);
		const clonedChildIds = clonedColumns.columns.flat().map((b) => b.id);

		// No id collisions between the two copies' nested children.
		expect(new Set([...sourceChildIds, ...clonedChildIds]).size).toBe(sourceChildIds.length + clonedChildIds.length);

		// Editing a nested block in the clone doesn't touch the source's —
		// this is exactly what would break if the clone still shared ids.
		const clonedFirstChildId = clonedColumns.columns[0]?.[0]?.id;
		if (!clonedFirstChildId) throw new Error('expected a cloned child block');
		const afterEdit = produce(afterDuplicate, (draft) => {
			setBlockDoc('page-1', clonedFirstChildId, { type: 'doc', content: [] }).apply(draft);
		});
		const stillSourceColumns = afterEdit.pages[0]?.blocks[0] as ColumnsBlock;
		const untouchedChild = stillSourceColumns.columns[0]?.[0];
		if (untouchedChild?.type !== 'text') throw new Error('expected a text block');
		expect(untouchedChild.doc.content).not.toEqual([]);
	});
});

describe('setBlockStyle', () => {
	it('replaces style wholesale, generic over any block type; its inverse restores the original', () => {
		const original = makeBody();
		let inverse!: Command;

		const afterEdit = produce(original, (draft) => {
			inverse = setBlockStyle('page-1', 'block-1', { backgroundColor: '#ff0000', width: 0.5 }).apply(draft);
		});
		expect(afterEdit.pages[0]?.blocks[0]?.style).toEqual({ backgroundColor: '#ff0000', width: 0.5 });

		const afterUndo = produce(afterEdit, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('toggleBlockLock', () => {
	it('toggles locked; its inverse toggles it back', () => {
		const original = makeBody();
		expect(original.pages[0]?.blocks[0]?.locked).toBe(false);
		let inverse!: Command;

		const afterLock = produce(original, (draft) => {
			inverse = toggleBlockLock('page-1', 'block-1').apply(draft);
		});
		expect(afterLock.pages[0]?.blocks[0]?.locked).toBe(true);

		const afterUndo = produce(afterLock, (draft) => {
			inverse.apply(draft);
		});
		expect(afterUndo).toEqual(original);
	});
});

describe('locked blocks (§4.3: non-draggable, non-deletable)', () => {
	function lockedBody() {
		return produce(makeBody(), (draft) => {
			(draft.pages[0]?.blocks[0] as TextBlock).locked = true;
		});
	}

	it('deleteBlock refuses to remove a locked block', () => {
		const original = lockedBody();
		expect(() =>
			produce(original, (draft) => {
				deleteBlock('page-1', 'block-1').apply(draft);
			})
		).toThrow(/block-1 is locked/);
	});

	it('moveBlock refuses to move a locked block', () => {
		const original = lockedBody();
		expect(() =>
			produce(original, (draft) => {
				moveBlock('page-1', 'block-1', { pageId: 'page-1' }, 1).apply(draft);
			})
		).toThrow(/block-1 is locked/);
	});

	it('duplicateBlock is still allowed on a locked block (only delete/move are restricted)', () => {
		const original = lockedBody();
		const afterDuplicate = produce(original, (draft) => {
			duplicateBlock('page-1', 'block-1').apply(draft);
		});
		expect(afterDuplicate.pages[0]?.blocks).toHaveLength(3);
		expect(afterDuplicate.pages[0]?.blocks[1]?.locked).toBe(true);
	});
});

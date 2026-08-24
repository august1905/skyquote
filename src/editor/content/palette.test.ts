import { describe, expect, it } from 'vitest';
import { INSERTABLE_BLOCK_KINDS, INSERTABLE_FIELD_KINDS } from '../blocks/insertable';
import { makeBody, makeBodyWithColumns, makeBodyWithSmartContent } from '../commands/testFixtures';
import type { Role, TemplateBody } from '../types';
import {
	BLOCK_ICONS,
	FIELD_ICONS,
	PALETTE_BLOCK_KINDS,
	clickInsertTarget,
	clickInsertTargetFor,
	paletteCanInsertInto,
	resolvePaletteInsert,
} from './palette';

function role(id: string): Role {
	return { id, name: `Role ${id}`, color: '#ff8800', order: 0, isSender: false };
}

function withRoles(body: TemplateBody, roles: Role[]): TemplateBody {
	return { ...body, roles };
}

describe('PALETTE_BLOCK_KINDS', () => {
	it('offers exactly what is insertable — no tile without a factory, no insertable kind without a tile', () => {
		// The panel is meant to be the *complete* palette (§3 ④). If a new block
		// type is added to INSERTABLE_BLOCK_KINDS and nobody thinks about the
		// panel, this fails rather than the tile quietly never appearing.
		expect(PALETTE_BLOCK_KINDS.map((kind) => kind.type).sort()).toEqual(INSERTABLE_BLOCK_KINDS.map((kind) => kind.type).sort());
	});

	it('puts the tiles in the reference product’s order, Text first', () => {
		expect(PALETTE_BLOCK_KINDS.slice(0, 4).map((kind) => kind.type)).toEqual(['text', 'image', 'video', 'table']);
	});

	it('leaves INSERTABLE_BLOCK_KINDS in its own order — the sort must not mutate the shared array', () => {
		// `[...list].sort(...)`, not `list.sort(...)`: the canvas menu reads the
		// same exported array and has its own order.
		expect(INSERTABLE_BLOCK_KINDS[0]?.type).toBe('text');
		expect(INSERTABLE_BLOCK_KINDS[1]?.type).toBe('page_break');
	});

	it('has an icon for every block tile and every field tile', () => {
		for (const kind of PALETTE_BLOCK_KINDS) expect(BLOCK_ICONS[kind.type], kind.type).toBeTruthy();
		for (const kind of INSERTABLE_FIELD_KINDS) expect(FIELD_ICONS[kind.fieldType], kind.fieldType).toBeTruthy();
	});
});

describe('clickInsertTarget', () => {
	it('inserts directly after the selected block', () => {
		const { pages } = makeBody();
		expect(clickInsertTarget(pages, { pageId: 'page-1', blockId: 'block-1' })).toEqual({
			container: { pageId: 'page-1' },
			index: 1,
		});
	});

	it('appends to the selected page when the selection is the page itself', () => {
		const { pages } = makeBody();
		expect(clickInsertTarget(pages, { pageId: 'page-1', blockId: null })).toEqual({
			container: { pageId: 'page-1' },
			index: 2,
		});
	});

	it('appends to the last page when nothing is selected', () => {
		// Last, not first: a template is authored top-to-bottom, so the end of
		// the document is the useful default.
		const { pages } = makeBody();
		expect(clickInsertTarget(pages, null)).toEqual({ container: { pageId: 'page-2' }, index: 1 });
	});

	it('keeps the new block in the column its neighbour lives in', () => {
		const { pages } = makeBodyWithColumns();
		expect(clickInsertTarget(pages, { pageId: 'page-1', blockId: 'col1-block-1' })).toEqual({
			container: { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 1 } },
			index: 1,
		});
	});

	it('keeps the new block inside the smart-content container its neighbour lives in', () => {
		const { pages } = makeBodyWithSmartContent();
		expect(clickInsertTarget(pages, { pageId: 'page-1', blockId: 'smart0-block-1' })).toEqual({
			container: { pageId: 'page-1', parent: { smartContentBlockId: 'smart-1' } },
			index: 1,
		});
	});

	it('falls back to the end of the page when the selected block is already gone', () => {
		// A selection can outlive its block (deleted from a shortcut, undone).
		// The click should still land somewhere sensible rather than doing nothing.
		const { pages } = makeBody();
		expect(clickInsertTarget(pages, { pageId: 'page-1', blockId: 'deleted-block' })).toEqual({
			container: { pageId: 'page-1' },
			index: 2,
		});
	});

	it('falls back to the last page when the selected page is gone', () => {
		const { pages } = makeBody();
		expect(clickInsertTarget(pages, { pageId: 'deleted-page', blockId: 'block-1' })).toEqual({
			container: { pageId: 'page-2' },
			index: 1,
		});
	});

	it('returns null for a template with no pages at all, rather than inventing a target', () => {
		expect(clickInsertTarget([], null)).toBeNull();
	});
});

describe('clickInsertTargetFor', () => {
	it('leaves a legal target alone', () => {
		const { pages } = makeBodyWithColumns();
		expect(clickInsertTargetFor(pages, { pageId: 'page-1', blockId: 'col0-block-1' }, 'text')).toEqual({
			container: { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } },
			index: 1,
		});
	});

	it('falls back to the page for a container block that can’t nest where the selection is', () => {
		// Clicking Columns with a block inside a column selected can't mean "nest
		// a container in a container" (§4.4) — so it lands on the page instead of
		// refusing the click.
		const { pages } = makeBodyWithColumns();
		expect(clickInsertTargetFor(pages, { pageId: 'page-1', blockId: 'col0-block-1' }, 'columns')).toEqual({
			container: { pageId: 'page-1' },
			index: 1,
		});
	});

	it('still returns null with no pages to insert into', () => {
		expect(clickInsertTargetFor([], null, 'text')).toBeNull();
	});
});

describe('paletteCanInsertInto', () => {
	const page = { pageId: 'page-1' };
	const column = { pageId: 'page-1', parent: { columnsBlockId: 'columns-1', column: 0 } };

	it('allows any block at a page’s top level', () => {
		expect(paletteCanInsertInto('columns', page)).toBe(true);
		expect(paletteCanInsertInto('text', page)).toBe(true);
	});

	it('refuses a container block inside a column — §4.4 caps nesting at 2', () => {
		expect(paletteCanInsertInto('columns', column)).toBe(false);
		expect(paletteCanInsertInto('smart_content', column)).toBe(false);
	});

	it('allows a plain block inside a column', () => {
		expect(paletteCanInsertInto('text', column)).toBe(true);
		expect(paletteCanInsertInto('pricing_table', column)).toBe(true);
	});
});

describe('resolvePaletteInsert', () => {
	it('creates a blank block for a tile with a factory', () => {
		const result = resolvePaletteInsert({ kind: 'paletteBlock', blockType: 'text' }, makeBody());
		expect(result.status).toBe('ready');
		if (result.status === 'ready') expect(result.block.type).toBe('text');
	});

	it('reports Image as needing input — a library image has to be picked first', () => {
		expect(resolvePaletteInsert({ kind: 'paletteBlock', blockType: 'image' }, makeBody())).toEqual({
			status: 'needsInput',
			blockType: 'image',
		});
	});

	it('reports Video as needing input — the URL has to be resolved through oEmbed first', () => {
		expect(resolvePaletteInsert({ kind: 'paletteBlock', blockType: 'video' }, makeBody())).toEqual({
			status: 'needsInput',
			blockType: 'video',
		});
	});

	it('creates a field block owned by the dragged role', () => {
		const body = withRoles(makeBody(), [role('role-1')]);
		const result = resolvePaletteInsert({ kind: 'paletteField', fieldType: 'signature', roleId: 'role-1' }, body);
		expect(result.status).toBe('ready');
		if (result.status === 'ready' && result.block.type === 'field') {
			expect(result.block.field.type).toBe('signature');
			expect(result.block.field.roleId).toBe('role-1');
		}
	});

	it('refuses a field whose role was deleted mid-drag rather than creating an ownerless one', () => {
		// §6.1 rule 1: a field never exists without a role. Roles are edited in a
		// different panel, so the id a tile carries can go stale while it's held.
		const body = withRoles(makeBody(), [role('role-2')]);
		const result = resolvePaletteInsert({ kind: 'paletteField', fieldType: 'signature', roleId: 'role-1' }, body);
		expect(result).toEqual({ status: 'unavailable', reason: 'That recipient role no longer exists.' });
	});

	it('names the field uniquely against fields already in the template', () => {
		const body = withRoles(makeBody(), [role('role-1')]);
		const first = resolvePaletteInsert({ kind: 'paletteField', fieldType: 'signature', roleId: 'role-1' }, body);
		if (first.status !== 'ready' || first.block.type !== 'field') throw new Error('expected a field block');
		const withFirst: TemplateBody = {
			...body,
			pages: [{ ...body.pages[0]!, blocks: [...body.pages[0]!.blocks, first.block] }, ...body.pages.slice(1)],
		};
		const second = resolvePaletteInsert({ kind: 'paletteField', fieldType: 'signature', roleId: 'role-1' }, withFirst);
		if (second.status !== 'ready' || second.block.type !== 'field') throw new Error('expected a field block');
		expect(second.block.field.name).not.toBe(first.block.field.name);
	});
});

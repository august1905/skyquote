import { describe, expect, it } from 'vitest';
import { allBlockTypes, blockTypeLabel, getBlockRegistryEntry } from './registry';
import { TextBlockView } from './TextBlockView';
import { PageBreakBlockView } from './PageBreakBlockView';
import { ColumnsBlockView } from './ColumnsBlockView';
import { TableBlockView } from './TableBlockView';
import { UnsupportedBlockView } from './UnsupportedBlockView';
import type { BlockType } from '../types';

const ALL_BLOCK_TYPES: BlockType[] = [
	'text',
	'image',
	'video',
	'table',
	'pricing_table',
	'quote_builder',
	'toc',
	'page_break',
	'smart_content',
	'columns',
	'field',
];

// Block types with a real, built view — kept as an explicit list (not
// derived) so this test file states plainly what's actually built, rather
// than trusting the registry's own claim about itself.
const REAL_VIEWS: Record<string, unknown> = {
	text: TextBlockView,
	page_break: PageBreakBlockView,
	columns: ColumnsBlockView,
	table: TableBlockView,
};

describe('allBlockTypes', () => {
	it('has exactly one entry per member of the Block union, in the registry', () => {
		expect(new Set(allBlockTypes())).toEqual(new Set(ALL_BLOCK_TYPES));
	});
});

describe('getBlockRegistryEntry', () => {
	it('resolves each built type to its real view', () => {
		for (const [type, View] of Object.entries(REAL_VIEWS)) {
			expect(getBlockRegistryEntry(type).View).toBe(View);
		}
	});

	it('every not-yet-built type resolves to the shared unsupported stub', () => {
		for (const type of ALL_BLOCK_TYPES.filter((t) => !(t in REAL_VIEWS))) {
			expect(getBlockRegistryEntry(type).View).toBe(UnsupportedBlockView);
		}
	});

	it('an unrecognized type (e.g. added by a newer deploy) degrades to unsupported rather than throwing', () => {
		const entry = getBlockRegistryEntry('some_future_block_type');
		expect(entry.View).toBe(UnsupportedBlockView);
		expect(entry.label).toBe('some_future_block_type');
	});
});

describe('blockTypeLabel', () => {
	it('returns a non-empty label for every registered type', () => {
		for (const type of allBlockTypes()) {
			expect(blockTypeLabel(type).length).toBeGreaterThan(0);
		}
	});
});

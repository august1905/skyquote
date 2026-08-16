import { describe, expect, it } from 'vitest';
import { allBlockTypes, blockTypeLabel, getBlockRegistryEntry } from './registry';
import { TextBlockView } from './TextBlockView';
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

describe('allBlockTypes', () => {
	it('has exactly one entry per member of the Block union, in the registry', () => {
		expect(new Set(allBlockTypes())).toEqual(new Set(ALL_BLOCK_TYPES));
	});
});

describe('getBlockRegistryEntry', () => {
	it('text resolves to the real TextBlockView', () => {
		expect(getBlockRegistryEntry('text').View).toBe(TextBlockView);
	});

	it('every non-text type resolves to the shared unsupported stub', () => {
		for (const type of ALL_BLOCK_TYPES.filter((t) => t !== 'text')) {
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

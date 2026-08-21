import { describe, expect, it } from 'vitest';
import type { ContentLibraryItem } from '../../api/contentLibrary';
import { filterByQuery, sortForTab } from './contentLibraryFilters';

function makeItem(overrides: Partial<ContentLibraryItem> & Pick<ContentLibraryItem, 'id' | 'name'>): ContentLibraryItem {
	return {
		tags: [],
		folderId: null,
		kind: 'block',
		stratusPath: `content-library/${overrides.id}/payload.json`,
		thumbnailPath: null,
		usageCount: 0,
		createdBy: 'user-1',
		createdAt: '2026-08-21T12:00:00.000Z',
		...overrides,
	};
}

describe('sortForTab', () => {
	it('leaves Recent in the order the backend returned, rather than re-sorting', () => {
		// The backend already does ORDER BY CREATEDTIME DESC; re-sorting here
		// would be a second source of truth for the same ordering.
		const items = [makeItem({ id: '3', name: 'Newest' }), makeItem({ id: '2', name: 'Middle' }), makeItem({ id: '1', name: 'Oldest' })];
		expect(sortForTab(items, 'recent').map((i) => i.id)).toEqual(['3', '2', '1']);
	});

	it('orders Featured by usage, most-used first', () => {
		const items = [
			makeItem({ id: 'a', name: 'Rarely', usageCount: 1 }),
			makeItem({ id: 'b', name: 'Often', usageCount: 9 }),
			makeItem({ id: 'c', name: 'Sometimes', usageCount: 4 }),
		];
		expect(sortForTab(items, 'featured').map((i) => i.id)).toEqual(['b', 'c', 'a']);
	});

	it('excludes never-used items from Featured, so it is not just Recent reordered', () => {
		const items = [makeItem({ id: 'used', name: 'Used', usageCount: 2 }), makeItem({ id: 'unused', name: 'Unused', usageCount: 0 })];
		expect(sortForTab(items, 'featured').map((i) => i.id)).toEqual(['used']);
	});

	it('breaks a usage tie by name, so the order is stable rather than arbitrary', () => {
		const items = [
			makeItem({ id: 'z', name: 'Zebra', usageCount: 3 }),
			makeItem({ id: 'a', name: 'Apple', usageCount: 3 }),
		];
		expect(sortForTab(items, 'featured').map((i) => i.name)).toEqual(['Apple', 'Zebra']);
	});

	it('does not mutate the array it was given', () => {
		const items = [makeItem({ id: 'a', name: 'A', usageCount: 1 }), makeItem({ id: 'b', name: 'B', usageCount: 5 })];
		const before = items.map((i) => i.id);
		sortForTab(items, 'featured');
		expect(items.map((i) => i.id)).toEqual(before);
	});
});

describe('filterByQuery', () => {
	const items = [
		makeItem({ id: '1', name: 'Standard terms', tags: ['legal', 'boilerplate'] }),
		makeItem({ id: '2', name: 'Cover page', tags: ['intro'] }),
	];

	it('returns everything for an empty or whitespace query', () => {
		expect(filterByQuery(items, '')).toHaveLength(2);
		expect(filterByQuery(items, '   ')).toHaveLength(2);
	});

	it('matches on name, case-insensitively and as a substring', () => {
		expect(filterByQuery(items, 'TERMS').map((i) => i.id)).toEqual(['1']);
		expect(filterByQuery(items, 'over').map((i) => i.id)).toEqual(['2']);
	});

	it('matches on tags too — §8 asks for tags to be searchable alongside the name', () => {
		expect(filterByQuery(items, 'legal').map((i) => i.id)).toEqual(['1']);
		expect(filterByQuery(items, 'intro').map((i) => i.id)).toEqual(['2']);
	});

	it('returns nothing when neither name nor tags match', () => {
		expect(filterByQuery(items, 'nonexistent')).toEqual([]);
	});
});

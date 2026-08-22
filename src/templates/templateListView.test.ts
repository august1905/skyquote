import { describe, expect, it } from 'vitest';
import type { Folder } from '../api/folders';
import { ZERO_MONEY, type TemplateMeta } from '../editor/types';
import {
	childFolders,
	folderPath,
	indexFoldersById,
	lastActivityAt,
	matchesName,
	orphanedTemplates,
	searchFolders,
	searchTemplates,
	sortTemplates,
	templatesInFolder,
} from './templateListView';

function folder(id: string, name: string, parentFolderId: string | null = null): Folder {
	return { id, name, kind: 'template', parentFolderId, createdBy: '1' };
}

function template(id: string, name: string, extra: Partial<TemplateMeta> = {}): TemplateMeta {
	return {
		id,
		name,
		folderId: null,
		themeId: null,
		status: 'draft',
		stratusPath: `templates/${id}/body.json`,
		currency: 'USD',
		computedTotal: ZERO_MONEY,
		version: 1,
		createdBy: '1',
		updatedBy: '1',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...extra,
	};
}

describe('folderPath', () => {
	const folders = [folder('1', 'Proposals'), folder('2', 'Commercial', '1'), folder('3', 'Retail', '2')];
	const byId = indexFoldersById(folders);

	it('is empty at the root, which is a location rather than a missing folder', () => {
		expect(folderPath(null, byId)).toEqual([]);
	});

	it('reads outermost-first, the direction a breadcrumb is read', () => {
		expect(folderPath('3', byId).map((f) => f.name)).toEqual(['Proposals', 'Commercial', 'Retail']);
	});

	it('stops at a parent that no longer exists instead of throwing', () => {
		const orphan = indexFoldersById([folder('9', 'Filed under something deleted', '404')]);
		expect(folderPath('9', orphan).map((f) => f.name)).toEqual(['Filed under something deleted']);
	});

	it('terminates on a cycle rather than hanging the render', () => {
		// Nothing in the app can create this today (re-parenting isn't exposed),
		// but the walk is unbounded by nature and a hang is far worse than a
		// truncated breadcrumb.
		const cyclic = indexFoldersById([folder('1', 'A', '2'), folder('2', 'B', '1')]);
		expect(folderPath('1', cyclic).map((f) => f.name)).toEqual(['B', 'A']);
	});
});

describe('childFolders', () => {
	const folders = [folder('1', 'Zebra'), folder('2', 'apple'), folder('3', 'Inside Zebra', '1')];

	it('returns only direct children, alphabetically and case-insensitively', () => {
		expect(childFolders(folders, null).map((f) => f.name)).toEqual(['apple', 'Zebra']);
	});

	it('does not flatten grandchildren into the root', () => {
		expect(childFolders(folders, '1').map((f) => f.name)).toEqual(['Inside Zebra']);
	});
});

describe('templatesInFolder', () => {
	const templates = [template('1', 'At root'), template('2', 'Filed', { folderId: '7' })];

	it('treats the root as its own folder', () => {
		expect(templatesInFolder(templates, null).map((t) => t.name)).toEqual(['At root']);
	});

	it('does not include a folder’s templates in the root listing', () => {
		expect(templatesInFolder(templates, '7').map((t) => t.name)).toEqual(['Filed']);
	});
});

describe('orphanedTemplates', () => {
	it('finds templates whose folder row is gone, which are otherwise unreachable', () => {
		const byId = indexFoldersById([folder('7', 'Still here')]);
		const templates = [template('1', 'At root'), template('2', 'Fine', { folderId: '7' }), template('3', 'Stranded', { folderId: '404' })];
		expect(orphanedTemplates(templates, byId).map((t) => t.name)).toEqual(['Stranded']);
	});
});

describe('matchesName', () => {
	it('ignores case and surrounding whitespace in the query', () => {
		expect(matchesName('Roof Replacement Quote', '  roof ')).toBe(true);
	});

	it('matches mid-word, since people search for the distinctive part of a name', () => {
		expect(matchesName('2026 Commercial Proposal', 'commercial')).toBe(true);
	});

	it('matches everything when the query is blank', () => {
		expect(matchesName('Anything', '   ')).toBe(true);
	});

	it('does not match an unrelated name', () => {
		expect(matchesName('Roof Quote', 'gutter')).toBe(false);
	});
});

describe('searchTemplates', () => {
	const templates = [template('1', 'Roof quote', { folderId: 'a' }), template('2', 'Gutter quote'), template('3', 'Roofing SOW', { folderId: 'b' })];

	it('spans every folder — a search that hid the answer because it is filed elsewhere would be useless', () => {
		expect(searchTemplates(templates, 'roof').map((t) => t.id)).toEqual(['1', '3']);
	});

	it('returns nothing for a blank query, so the caller shows the folder view instead of the whole library flattened', () => {
		expect(searchTemplates(templates, '  ')).toEqual([]);
	});
});

describe('searchFolders', () => {
	it('matches folder names too, since a folder is one of the things listed', () => {
		const folders = [folder('1', 'Roofing'), folder('2', 'Gutters')];
		expect(searchFolders(folders, 'roof').map((f) => f.name)).toEqual(['Roofing']);
	});
});

describe('lastActivityAt', () => {
	it('falls back to createdAt when the row has never been updated', () => {
		// Catalyst leaves MODIFIEDTIME empty until the first update, and a
		// brand-new template sorting as the oldest thing in the list is the bug
		// this prevents.
		expect(lastActivityAt(template('1', 'New', { updatedAt: '' }))).toBe('2026-01-01T00:00:00Z');
	});

	it('prefers updatedAt when it exists', () => {
		expect(lastActivityAt(template('1', 'Edited', { updatedAt: '2026-06-01T00:00:00Z' }))).toBe('2026-06-01T00:00:00Z');
	});
});

describe('sortTemplates', () => {
	it('orders by name numerically, so "Quote 2" precedes "Quote 10"', () => {
		const templates = [template('1', 'Quote 10'), template('2', 'Quote 2')];
		expect(sortTemplates(templates, 'name').map((t) => t.name)).toEqual(['Quote 2', 'Quote 10']);
	});

	it('does not separate names that differ only by case', () => {
		const templates = [template('1', 'apple'), template('2', 'Banana'), template('3', 'Apricot')];
		expect(sortTemplates(templates, 'name').map((t) => t.name)).toEqual(['apple', 'Apricot', 'Banana']);
	});

	it('puts the most recently touched first when sorting by updated', () => {
		const templates = [
			template('1', 'Old', { updatedAt: '2026-01-01T00:00:00Z' }),
			template('2', 'Newest', { updatedAt: '2026-08-01T00:00:00Z' }),
			template('3', 'Middle', { updatedAt: '2026-04-01T00:00:00Z' }),
		];
		expect(sortTemplates(templates, 'updated').map((t) => t.name)).toEqual(['Newest', 'Middle', 'Old']);
	});

	it('breaks ties deterministically, so the list does not reshuffle between renders', () => {
		const sameTime = { updatedAt: '2026-05-05T00:00:00Z' };
		const templates = [template('1', 'Beta', sameTime), template('2', 'Alpha', sameTime)];
		expect(sortTemplates(templates, 'updated').map((t) => t.name)).toEqual(['Alpha', 'Beta']);
	});

	it('leaves the caller’s array alone — it comes straight from the fetch', () => {
		const templates = [template('1', 'B'), template('2', 'A')];
		sortTemplates(templates, 'name');
		expect(templates.map((t) => t.name)).toEqual(['B', 'A']);
	});
});

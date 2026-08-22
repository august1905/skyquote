import type { Folder } from '../api/folders';
import type { TemplateMeta } from '../editor/types';

/**
 * The Templates list page's pure view logic — folder navigation, search and
 * sort, with no React and no fetching, so each rule can be tested for the cases
 * that are awkward to stage in a browser (a folder cycle, a template whose
 * folder row is missing, names that differ only by case).
 *
 * `Folders` is a flat table with a nullable `parent_folder_id`; the tree is
 * derived here rather than stored, which is why every lookup below takes the
 * whole list or a prebuilt index.
 */

export type TemplateSort = 'name' | 'updated';

/** `null` is the root, which is a real location rather than a missing one — same convention as `Folders.parent_folder_id`. */
export type FolderId = string | null;

export function indexFoldersById(folders: Folder[]): Map<string, Folder> {
	return new Map(folders.map((folder) => [folder.id, folder]));
}

/**
 * The breadcrumb chain for a folder, outermost first, excluding the root.
 *
 * Cycle-safe on purpose. Nothing in the app can currently create `A → B → A`
 * (re-parenting isn't exposed), but the walk is unbounded by nature and a cycle
 * would hang the render loop rather than misdraw a breadcrumb — a bad trade for
 * one `Set`. A broken link (a parent id with no row) ends the chain instead of
 * throwing, so one bad folder doesn't take the page down with it.
 */
export function folderPath(folderId: FolderId, byId: Map<string, Folder>): Folder[] {
	const path: Folder[] = [];
	const seen = new Set<string>();
	let current = folderId;
	while (current && !seen.has(current)) {
		seen.add(current);
		const folder = byId.get(current);
		if (!folder) break;
		path.unshift(folder);
		current = folder.parentFolderId;
	}
	return path;
}

/** Direct children of a folder (`null` for the root), alphabetical. */
export function childFolders(folders: Folder[], parentId: FolderId): Folder[] {
	return folders.filter((folder) => (folder.parentFolderId ?? null) === parentId).sort(byName);
}

/**
 * Templates filed directly in a folder — not in its sub-folders.
 *
 * A template whose `folderId` names a folder that no longer exists would
 * otherwise be invisible everywhere: it isn't at the root, and there's no folder
 * to open. `orphanedTemplates` exists to surface exactly those.
 */
export function templatesInFolder(templates: TemplateMeta[], folderId: FolderId): TemplateMeta[] {
	return templates.filter((template) => (template.folderId ?? null) === folderId);
}

/** Templates pointing at a folder that isn't in the list — shown at the root so they stay reachable. */
export function orphanedTemplates(templates: TemplateMeta[], byId: Map<string, Folder>): TemplateMeta[] {
	return templates.filter((template) => template.folderId !== null && !byId.has(template.folderId));
}

/** Case- and accent-insensitive substring match. A blank query matches everything, so callers don't have to special-case it. */
export function matchesName(name: string, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return true;
	return name.toLocaleLowerCase().includes(needle);
}

/**
 * Search deliberately ignores the folder you're standing in and spans the whole
 * library. Someone typing a name is looking for a template, not asking which of
 * this folder's templates matches — and a search that silently excluded the
 * answer because it's filed elsewhere is worse than no search.
 */
export function searchTemplates(templates: TemplateMeta[], query: string): TemplateMeta[] {
	if (!query.trim()) return [];
	return templates.filter((template) => matchesName(template.name, query));
}

export function searchFolders(folders: Folder[], query: string): Folder[] {
	if (!query.trim()) return [];
	return folders.filter((folder) => matchesName(folder.name, query)).sort(byName);
}

/**
 * When a template was last touched. `updatedAt` is Catalyst's MODIFIEDTIME,
 * which is absent on a row that hasn't been updated since it was inserted —
 * falling back to `createdAt` keeps a brand-new template from sorting as if it
 * were the oldest thing in the list.
 */
export function lastActivityAt(template: TemplateMeta): string {
	return template.updatedAt || template.createdAt;
}

/** Returns a new array; never sorts in place, since the caller's copy comes straight from the fetch. */
export function sortTemplates(templates: TemplateMeta[], sort: TemplateSort): TemplateMeta[] {
	const sorted = [...templates];
	if (sort === 'updated') {
		// Most recent first, which is what "sort by updated" means for a list of
		// work in progress. Name breaks ties so the order is stable across renders
		// rather than depending on the fetch order.
		sorted.sort((a, b) => lastActivityAt(b).localeCompare(lastActivityAt(a)) || compareNames(a.name, b.name));
	} else {
		sorted.sort((a, b) => compareNames(a.name, b.name) || a.id.localeCompare(b.id));
	}
	return sorted;
}

// `numeric` so "Quote 2" comes before "Quote 10", and `sensitivity: 'base'` so
// case and accents don't split otherwise-adjacent names apart.
function compareNames(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function byName(a: { name: string }, b: { name: string }): number {
	return compareNames(a.name, b.name);
}

import type { ContentLibraryItem } from '../../api/contentLibrary';

/**
 * §8's `Recent` / `Featured` tabs, as pure functions over the one list the
 * backend returns — kept out of the components so the ordering rules are
 * unit-testable without rendering anything.
 */
export type ContentLibraryTab = 'recent' | 'featured';

/**
 * **`Featured` is "most reused", and that's an adaptation worth naming.** §8
 * asks for a Featured tab but the table has no `featured` flag — nothing in
 * the spec says who would set one, and inventing a curation workflow (and a
 * column) for it would be a much larger guess than this. Usage count is
 * already required by §8 for its own sake, so ordering by it gives Featured a
 * real, self-maintaining meaning: the content this workspace actually reaches
 * for. Revisit if explicit curation is ever wanted.
 *
 * Items with no uses yet are excluded rather than sorted to the bottom — a
 * "Featured" tab that lists everything, most of it never used, is just Recent
 * in a different order.
 */
export function sortForTab(items: ContentLibraryItem[], tab: ContentLibraryTab): ContentLibraryItem[] {
	if (tab === 'featured') {
		return items.filter((item) => item.usageCount > 0).sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
	}
	// `Recent` relies on the backend's own `ORDER BY CREATEDTIME DESC` rather
	// than re-sorting by `createdAt` here: same order, one less place for the
	// two to disagree.
	return items;
}

/**
 * §8: "Search covers name, tags, and full text content."
 *
 * Name and tags are covered. **Full text content is not, deliberately:** the
 * list holds metadata only — payloads live in Stratus and are fetched one at a
 * time at insert (see api/contentLibrary.ts), so searching content client-side
 * would mean downloading every saved block tree on first keystroke. Doing it
 * properly means a searchable text column denormalized on save, or server-side
 * search; either is a real change and neither is guessed at here.
 */
export function filterByQuery(items: ContentLibraryItem[], query: string): ContentLibraryItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((item) => item.name.toLowerCase().includes(q) || item.tags.some((tag) => tag.toLowerCase().includes(q)));
}

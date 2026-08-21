import apiFetch from './client';
import type { Block, Page } from '../editor/types';

// The backend's normalizeContentLibraryItem already emits camelCase matching
// these types directly (same convention as api/catalogItems.ts and
// api/documents.ts), so unlike the catalog there's nothing to cast — no
// branded `Money` crosses this wire.

/** §8: "Library items are saved blocks or whole pages." */
export type ContentLibraryKind = 'block' | 'page';

export interface ContentLibraryItem {
	id: string;
	name: string;
	tags: string[];
	folderId: string | null;
	kind: ContentLibraryKind;
	stratusPath: string;
	/** Always null for now — §8's thumbnails need the PDF-export renderer, which isn't built. The column is nullable precisely so this can wait. */
	thumbnailPath: string | null;
	usageCount: number;
	createdBy: string;
	/** Real ISO 8601 — the backend converts Catalyst's own wall-clock CREATEDTIME format before sending it. */
	createdAt: string;
}

/**
 * What's actually stored in Stratus for an item. `blocks` carries exactly one
 * entry for a `block` item and the whole page's blocks for a `page` item;
 * `page` carries the page's own presentation (name, background) so inserting a
 * saved page recreates the page rather than only dumping its contents onto the
 * current one.
 */
export interface ContentLibraryPayload {
	blocks: Block[];
	page?: Pick<Page, 'name'> & { background?: Page['background'] };
}

/** Every non-archived item, newest first. Search and the Recent/Featured split are both client-side — see ContentLibraryPanel. */
export async function listContentLibraryItems(): Promise<ContentLibraryItem[]> {
	const { contentLibraryItems } = await apiFetch<{ contentLibraryItems: ContentLibraryItem[] }>('/content-library-items');
	return contentLibraryItems;
}

/** One item plus its payload — fetched per-insert rather than up front, so browsing a large library doesn't pull every block tree in it. */
export async function getContentLibraryItem(id: string): Promise<{ item: ContentLibraryItem; payload: ContentLibraryPayload }> {
	return apiFetch<{ item: ContentLibraryItem; payload: ContentLibraryPayload }>(`/content-library-items/${id}`);
}

export interface SaveToLibraryInput {
	name: string;
	kind: ContentLibraryKind;
	payload: ContentLibraryPayload;
	tags?: string[];
	folderId?: string | null;
}

export async function createContentLibraryItem(input: SaveToLibraryInput): Promise<ContentLibraryItem> {
	const { contentLibraryItem } = await apiFetch<{ contentLibraryItem: ContentLibraryItem }>('/content-library-items', {
		method: 'POST',
		body: JSON.stringify(input),
	});
	return contentLibraryItem;
}

export async function updateContentLibraryItem(
	id: string,
	patch: { name?: string; tags?: string[]; folderId?: string | null }
): Promise<ContentLibraryItem> {
	const { contentLibraryItem } = await apiFetch<{ contentLibraryItem: ContentLibraryItem }>(`/content-library-items/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
	return contentLibraryItem;
}

/**
 * §8's usage count. Deliberately fire-and-forget at the call site: a lost
 * increment is a slightly stale "Featured" ordering, never a failed insert,
 * so this must not be awaited in a way that can surface an error to the user
 * after the insert already succeeded.
 */
export async function recordContentLibraryUse(id: string): Promise<ContentLibraryItem> {
	const { contentLibraryItem } = await apiFetch<{ contentLibraryItem: ContentLibraryItem }>(`/content-library-items/${id}/uses`, {
		method: 'POST',
	});
	return contentLibraryItem;
}

export async function deleteContentLibraryItem(id: string): Promise<void> {
	await apiFetch<void>(`/content-library-items/${id}`, { method: 'DELETE' });
}

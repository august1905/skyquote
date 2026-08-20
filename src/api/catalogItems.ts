import apiFetch from './client';
import { money, type CatalogItem } from '../editor/types';

// The backend's normalizeCatalogItem already emits camelCase matching
// CatalogItem directly (same convention as api/documents.ts) — only `price`/
// `cost` need casting through `money()` here, since JSON has no way to carry
// the branded Money type across the wire.
interface RawCatalogItem {
	id: string;
	sku: string | null;
	name: string;
	description: string;
	price: number;
	currency: string;
	cost: number | null;
	taxPct: number | null;
	category: string | null;
}

function toCatalogItem(raw: RawCatalogItem): CatalogItem {
	return {
		...raw,
		price: money(raw.price),
		cost: raw.cost === null ? null : money(raw.cost),
	};
}

/** Every active catalog item, alphabetical. No search/pagination server-side — see CatalogPanel.tsx for the client-side filter. */
export async function listCatalogItems(): Promise<CatalogItem[]> {
	const { catalogItems } = await apiFetch<{ catalogItems: RawCatalogItem[] }>('/catalog-items');
	return catalogItems.map(toCatalogItem);
}

export interface CatalogItemInput {
	sku?: string | null;
	name: string;
	description?: string;
	price: number;
	currency?: string;
	cost?: number | null;
	taxPct?: number | null;
	category?: string | null;
	isActive?: boolean;
}

/** No admin UI calls this yet — see routes/catalogItems.js's own comment. Exists so the catalog can be populated/tested without hand-editing the Data Store. */
export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
	const { catalogItem } = await apiFetch<{ catalogItem: RawCatalogItem }>('/catalog-items', {
		method: 'POST',
		body: JSON.stringify(input),
	});
	return toCatalogItem(catalogItem);
}

export async function updateCatalogItem(id: string, patch: Partial<CatalogItemInput>): Promise<CatalogItem> {
	const { catalogItem } = await apiFetch<{ catalogItem: RawCatalogItem }>(`/catalog-items/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
	return toCatalogItem(catalogItem);
}

export async function deleteCatalogItem(id: string): Promise<void> {
	await apiFetch<void>(`/catalog-items/${id}`, { method: 'DELETE' });
}

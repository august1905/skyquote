import type { CatalogItem, PricingItem } from '../editor/types';

export interface CatalogPriceStatus {
	changed: boolean;
	/** The catalog's current price, only when it actually differs from `item.price`. `null` otherwise, including when the catalog item can't be resolved (deleted, or the catalog list hasn't loaded yet) — silently not flagging a change beats a false positive. */
	currentPrice: CatalogItem['price'] | null;
}

const NOT_CHANGED: CatalogPriceStatus = { changed: false, currentPrice: null };

/**
 * §7.7: "show a 'price changed since insert' indicator if the catalog price
 * later differs." `item.price` is frozen at drop time (see
 * `createPricingItemFromCatalog`) — this just compares that frozen value
 * against whatever the catalog reports *now* for `item.catalogItemId`.
 *
 * A manually-added row (no `catalogItemId`) or one whose catalog source has
 * since been deleted both resolve to "no change" rather than an error —
 * there's nothing to compare against, and silently saying nothing is safer
 * than guessing.
 */
export function catalogPriceChanged(item: PricingItem, catalogItemsById: ReadonlyMap<string, CatalogItem>): CatalogPriceStatus {
	if (!item.catalogItemId) return NOT_CHANGED;
	const catalogItem = catalogItemsById.get(item.catalogItemId);
	if (!catalogItem) return NOT_CHANGED;
	if (catalogItem.price === item.price) return NOT_CHANGED;
	return { changed: true, currentPrice: catalogItem.price };
}

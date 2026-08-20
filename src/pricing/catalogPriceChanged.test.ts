import { describe, expect, it } from 'vitest';
import { money, type CatalogItem, type PricingItem } from '../editor/types';
import { catalogPriceChanged } from './catalogPriceChanged';

function makeCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
	return {
		id: 'catalog-1',
		sku: 'CLN-01',
		name: 'Standard Cleaning',
		description: '',
		price: money(15000),
		currency: 'USD',
		cost: null,
		taxPct: null,
		category: null,
		...overrides,
	};
}

function makePricingItem(overrides: Partial<PricingItem> = {}): PricingItem {
	return {
		id: 'item-1',
		sectionId: null,
		name: 'Standard Cleaning',
		description: '',
		qty: 1,
		price: money(15000),
		optional: false,
		selected: true,
		customFields: {},
		...overrides,
	};
}

describe('catalogPriceChanged', () => {
	it('reports no change for a manually-added item (no catalogItemId)', () => {
		const item = makePricingItem();
		const status = catalogPriceChanged(item, new Map([['catalog-1', makeCatalogItem()]]));
		expect(status).toEqual({ changed: false, currentPrice: null });
	});

	it('reports no change when the frozen price still matches the catalog', () => {
		const item = makePricingItem({ catalogItemId: 'catalog-1', price: money(15000) });
		const status = catalogPriceChanged(item, new Map([['catalog-1', makeCatalogItem({ price: money(15000) })]]));
		expect(status).toEqual({ changed: false, currentPrice: null });
	});

	it('reports a change with the catalog\'s current price when it has diverged', () => {
		const item = makePricingItem({ catalogItemId: 'catalog-1', price: money(15000) });
		const status = catalogPriceChanged(item, new Map([['catalog-1', makeCatalogItem({ price: money(17500) })]]));
		expect(status).toEqual({ changed: true, currentPrice: money(17500) });
	});

	it('reports no change (not an error) when the catalog item can no longer be resolved — e.g. deleted', () => {
		const item = makePricingItem({ catalogItemId: 'catalog-1', price: money(15000) });
		const status = catalogPriceChanged(item, new Map());
		expect(status).toEqual({ changed: false, currentPrice: null });
	});
});

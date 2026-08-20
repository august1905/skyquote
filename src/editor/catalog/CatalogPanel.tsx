import { useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { CatalogItemCard } from './CatalogItemCard';
import './catalog.css';

interface CatalogPanelProps {
	onClose: () => void;
}

/** §3's Catalog/Pricing right-rail panel — §7.7's "product catalog browser". Search is client-side only, same "no folders/tabs/search yet" scope as the Documents/Templates lists — see routes/catalogItems.js. */
export function CatalogPanel({ onClose }: CatalogPanelProps) {
	const catalogItems = useEditorStore((s) => s.catalogItems);
	const status = useEditorStore((s) => s.catalogItemsStatus);
	const [query, setQuery] = useState('');

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return catalogItems;
		return catalogItems.filter((item) => [item.name, item.sku, item.category].some((field) => field?.toLowerCase().includes(q)));
	}, [catalogItems, query]);

	return (
		<div className="catalog-panel">
			<div className="catalog-panel-header">
				<h2>Catalog</h2>
				<button type="button" aria-label="Close catalog panel" onClick={onClose}>
					×
				</button>
			</div>
			<input
				type="text"
				className="catalog-panel-search"
				placeholder="Search catalog…"
				aria-label="Search catalog"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{status === 'loading' && <p className="catalog-panel-empty">Loading…</p>}
			{status === 'error' && <p className="catalog-panel-empty" role="alert">Couldn&apos;t load the catalog.</p>}
			{status === 'ready' && catalogItems.length === 0 && <p className="catalog-panel-empty">No catalog items yet.</p>}
			{status === 'ready' && catalogItems.length > 0 && filtered.length === 0 && <p className="catalog-panel-empty">No matches.</p>}
			{filtered.length > 0 && (
				<div className="catalog-panel-list">
					{filtered.map((item) => (
						<CatalogItemCard key={item.id} catalogItem={item} />
					))}
				</div>
			)}
			<p className="catalog-panel-hint">Drag an item onto a pricing table to add it as a row.</p>
		</div>
	);
}

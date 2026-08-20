import { useDraggable } from '@dnd-kit/core';
import type { CatalogItem } from '../types';
import { formatMoney } from '../../pricing/formatMoney';
import './catalog.css';

interface CatalogItemCardProps {
	catalogItem: CatalogItem;
}

/** §7.7's draggable source — dropped onto a `PricingTableBlockView`'s drop zone (see that file) to create a new row via `addPricingItemFromCatalog`. */
export function CatalogItemCard({ catalogItem }: CatalogItemCardProps) {
	const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
		id: `catalog-item-${catalogItem.id}`,
		data: { kind: 'catalogItem', catalogItem },
	});

	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			className={`catalog-item-card${isDragging ? ' catalog-item-card-dragging' : ''}`}
			aria-label={`Drag ${catalogItem.name} into a pricing table`}
		>
			<div className="catalog-item-card-main">
				<span className="catalog-item-card-name">{catalogItem.name}</span>
				<span className="catalog-item-card-price">{formatMoney(catalogItem.price, catalogItem.currency)}</span>
			</div>
			{(catalogItem.sku || catalogItem.category) && (
				<div className="catalog-item-card-meta">
					{catalogItem.sku && <span>{catalogItem.sku}</span>}
					{catalogItem.category && <span>{catalogItem.category}</span>}
				</div>
			)}
		</div>
	);
}

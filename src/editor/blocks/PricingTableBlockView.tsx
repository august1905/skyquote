import { useDroppable } from '@dnd-kit/core';
import { useMemo } from 'react';
import {
	addPricingItem,
	addPricingSection,
	removePricingItem,
	removePricingSection,
	renamePricingSection,
	setPricingTableCurrency,
	setPricingTableSettings,
	updatePricingItem,
} from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { PricingItem, PricingTableBlock } from '../types';
import { computePricingTableTotals } from '../../pricing/computeTotals';
import { formatMoney } from '../../pricing/formatMoney';
import { catalogPriceChanged } from '../../pricing/catalogPriceChanged';
import type { BlockViewProps } from './types';
import { PricingItemRow } from './pricing/PricingItemRow';
import './pricing/pricing.css';

interface Group {
	sectionId: string | null;
	name: string | null;
	items: PricingItem[];
}

/**
 * §7's pricing table. Fixed columns (name, description, qty, price, discount,
 * tax, per-row total) gated by `settings.showDiscount`/`showTax` rather than
 * `columns: PricingColumn[]`'s fully freeform custom-column model — building
 * genuinely arbitrary custom columns (backed by `PricingItem.customFields`)
 * is a bigger, separate feature; `columns` stays an empty array for now (see
 * BUILD_STATUS.md). `settings.recurrence` also isn't exposed here — §16 Q8
 * lists recurring pricing as a genuinely open product question, not
 * something to default a UI toggle for.
 */
export function PricingTableBlockView({ pageId, block, selected }: BlockViewProps<PricingTableBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const catalogItems = useEditorStore((s) => s.catalogItems);
	const totals = computePricingTableTotals(block);
	const lineByItemId = new Map(totals.lines.map((l) => [l.itemId, l]));
	const editable = selected && !block.locked;

	// §7.7's drop target — dragging a CatalogItemCard here creates a row via
	// addPricingItemFromCatalog (see EditorDndProvider.tsx's handleDragEnd).
	// Always droppable when unlocked, not gated on `editable`/`selected` — a
	// drag-in shouldn't require first clicking into the table.
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: `pricing-table-drop-${block.id}`,
		data: { kind: 'pricingTableDrop', pageId, blockId: block.id },
		disabled: block.locked,
	});
	const catalogItemsById = useMemo(() => new Map(catalogItems.map((c) => [c.id, c])), [catalogItems]);

	function stopAnd<E extends { stopPropagation: () => void }>(action: () => void) {
		return (e: E) => {
			e.stopPropagation();
			action();
		};
	}

	const groups: Group[] =
		block.sections.length === 0
			? [{ sectionId: null, name: null, items: block.items }]
			: [
					...block.sections.map((section) => ({ sectionId: section.id, name: section.name, items: block.items.filter((i) => i.sectionId === section.id) })),
					{ sectionId: null, name: 'Ungrouped', items: block.items.filter((i) => !block.sections.some((s) => s.id === i.sectionId)) },
				];

	return (
		<div ref={setDropRef} className={`block-pricing-table${isOver ? ' block-pricing-table-drop-over' : ''}`}>
			{editable && (
				<div className="pricing-table-toolbar" onClick={(e) => e.stopPropagation()}>
					<label className="pricing-table-currency">
						Currency
						<input
							type="text"
							value={block.currency}
							onChange={(e) => runCommand(setPricingTableCurrency(pageId, block.id, e.target.value.toUpperCase()), { coalesceKey: `${block.id}-currency` })}
							onBlur={endCoalescing}
						/>
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.showDiscount}
							onChange={() => runCommand(setPricingTableSettings(pageId, block.id, { showDiscount: !block.settings.showDiscount }))}
						/>
						Discount column
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.showTax}
							onChange={() => runCommand(setPricingTableSettings(pageId, block.id, { showTax: !block.settings.showTax }))}
						/>
						Tax column
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.showSubtotal}
							onChange={() => runCommand(setPricingTableSettings(pageId, block.id, { showSubtotal: !block.settings.showSubtotal }))}
						/>
						Subtotal row
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.showTotal}
							onChange={() => runCommand(setPricingTableSettings(pageId, block.id, { showTotal: !block.settings.showTotal }))}
						/>
						Total row
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.allowRecipientQtyEdit}
							onChange={() => runCommand(setPricingTableSettings(pageId, block.id, { allowRecipientQtyEdit: !block.settings.allowRecipientQtyEdit }))}
						/>
						Recipient can edit quantity
					</label>
					<label>
						<input
							type="checkbox"
							checked={block.settings.allowRecipientSelectOptional}
							onChange={() =>
								runCommand(setPricingTableSettings(pageId, block.id, { allowRecipientSelectOptional: !block.settings.allowRecipientSelectOptional }))
							}
						/>
						Recipient can pick optional items
					</label>
					<button type="button" onClick={() => runCommand(addPricingSection(pageId, block.id))}>
						+ Section
					</button>
				</div>
			)}

			{groups.map((group) => (
				<div key={group.sectionId ?? '__ungrouped'} className="pricing-section">
					{group.name && (
						<div className="pricing-section-header">
							{editable ? (
								<>
									<input
										type="text"
										className="pricing-section-name"
										value={group.name}
										disabled={group.sectionId === null}
										onChange={(e) => {
											if (group.sectionId) runCommand(renamePricingSection(pageId, block.id, group.sectionId, e.target.value), { coalesceKey: `${block.id}-${group.sectionId}-name` });
										}}
										onBlur={endCoalescing}
									/>
									{group.sectionId && (
										<button type="button" onClick={stopAnd(() => runCommand(removePricingSection(pageId, block.id, group.sectionId!)))}>
											Remove section
										</button>
									)}
								</>
							) : (
								<span className="pricing-section-name">{group.name}</span>
							)}
						</div>
					)}
					{group.items.map((item) => (
						<PricingItemRow
							key={item.id}
							item={item}
							line={lineByItemId.get(item.id)!}
							currency={block.currency}
							locked={block.locked}
							showRemove={editable}
							showDiscount={block.settings.showDiscount}
							showTax={block.settings.showTax}
							priceStatus={catalogPriceChanged(item, catalogItemsById)}
							onChange={(patch) => runCommand(updatePricingItem(pageId, block.id, item.id, patch), { coalesceKey: `${block.id}-${item.id}` })}
							onBlurField={endCoalescing}
							onRemove={() => runCommand(removePricingItem(pageId, block.id, item.id))}
						/>
					))}
					{editable && (
						<button type="button" className="pricing-add-item" onClick={() => runCommand(addPricingItem(pageId, block.id, group.sectionId))}>
							+ Item
						</button>
					)}
				</div>
			))}

			<div className="pricing-table-footer">
				{block.settings.showSubtotal && (
					<div className="pricing-table-footer-row">
						<span>Subtotal</span>
						<span>{formatMoney(totals.subtotal, block.currency)}</span>
					</div>
				)}
				{block.settings.showDiscount && totals.discount > 0 && (
					<div className="pricing-table-footer-row">
						<span>Discount</span>
						<span>−{formatMoney(totals.discount, block.currency)}</span>
					</div>
				)}
				{block.settings.showTax && (
					<div className="pricing-table-footer-row">
						<span>Tax</span>
						<span>{formatMoney(totals.tax, block.currency)}</span>
					</div>
				)}
				{block.settings.showTotal && (
					<div className="pricing-table-footer-row pricing-table-footer-total">
						<span>Total</span>
						<span>{formatMoney(totals.total, block.currency)}</span>
					</div>
				)}
			</div>
		</div>
	);
}

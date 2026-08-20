import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { addPricingItemFromCatalog, containerBlocksOf, moveBlock, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { CatalogItem } from '../types';
import { formatMoney } from '../../pricing/formatMoney';
import '../catalog/catalog.css';

/**
 * One `DndContext` for the whole editor (canvas block-reorder *and* the
 * Catalog panel's drag-into-a-pricing-table, §7.7) — dnd-kit only tracks one
 * active drag at a time per context, and the Catalog panel lives in
 * `RightRail`, a sibling of `TemplateCanvas`, not a descendant of it. This
 * used to be owned by `TemplateCanvas` itself (block-reorder only); lifted
 * up to `TemplateEditor.tsx`'s layout level so both drag sources can share it.
 *
 * Every draggable/droppable in the editor tags its dnd-kit `data` with a
 * `kind` so `handleDragEnd` can dispatch correctly — `SortableBlock`'s
 * `{ kind: 'block', container }`, `CatalogItemCard`'s
 * `{ kind: 'catalogItem', catalogItem }`, and `PricingTableBlockView`'s drop
 * zone `{ kind: 'pricingTableDrop', pageId, blockId }`.
 */
type DragData =
	| { kind: 'block'; container: BlockContainer }
	| { kind: 'catalogItem'; catalogItem: CatalogItem };

type DropData =
	| { kind: 'block'; container: BlockContainer }
	| { kind: 'pricingTableDrop'; pageId: string; blockId: string };

/**
 * Same page top level, or the exact same column — reorder, already wired.
 * Different pages at the top level — cross-page move, already wired (pre-
 * dates Columns). A page's top level <-> a column, or column <-> a different
 * column — cross-container drops aren't wired yet; §4.4's validity rules
 * (e.g. rejecting a dropped container block) need dedicated handling first,
 * so those drags just snap back for now.
 */
function isCompatibleDropTarget(from: BlockContainer, to: BlockContainer): boolean {
	if (!from.parent && !to.parent) return true;
	if (from.parent && to.parent) {
		return from.pageId === to.pageId && from.parent.columnsBlockId === to.parent.columnsBlockId && from.parent.column === to.parent.column;
	}
	return false;
}

export function EditorDndProvider({ children }: { children: ReactNode }) {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const runCommand = useEditorStore((s) => s.runCommand);
	// Only ever set for a catalog-item drag — block drags move in place via
	// SortableBlock's own CSS transform (unchanged from before this was
	// lifted up) and don't need an overlay. A catalog card, though, has to
	// visibly follow the cursor out of the right rail and into the canvas —
	// its own layout position (inside RightRail) never overlaps a pricing
	// table, so without this there'd be nothing to see while dragging.
	const [draggingCatalogItem, setDraggingCatalogItem] = useState<CatalogItem | null>(null);

	// A small activation distance so a plain click (to select a block, or
	// place a cursor in it) doesn't get eaten as a drag start — only the
	// handle button / catalog card have `listeners` attached, but the
	// distance threshold is still worth keeping so an accidental tiny mouse
	// move while clicking doesn't immediately count as "dragging".
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	function handleDragStart({ active }: DragStartEvent) {
		const data = active.data.current as DragData | undefined;
		setDraggingCatalogItem(data?.kind === 'catalogItem' ? data.catalogItem : null);
	}

	function handleDragEnd({ active, over }: DragEndEvent) {
		setDraggingCatalogItem(null);
		if (!over) return;
		const activeData = active.data.current as DragData | undefined;
		const overData = over.data.current as DropData | undefined;
		if (!activeData || !overData) return;

		if (activeData.kind === 'catalogItem') {
			if (overData.kind !== 'pricingTableDrop') return;
			runCommand(addPricingItemFromCatalog(overData.pageId, overData.blockId, null, activeData.catalogItem));
			return;
		}

		// activeData.kind === 'block'
		if (overData.kind !== 'block' || active.id === over.id) return;
		const fromContainer = activeData.container;
		const toContainer = overData.container;
		if (!isCompatibleDropTarget(fromContainer, toContainer)) return;

		const toBlocks = containerBlocksOf(pages, toContainer);
		const toIndex = toBlocks?.findIndex((b) => b.id === over.id) ?? -1;
		// Dropping on empty space rather than another block (e.g. an empty
		// page or column) isn't resolvable to an index yet — a known gap, not
		// a silent failure: the drag just snaps back.
		if (toIndex === -1) return;

		runCommand(moveBlock(fromContainer.pageId, active.id as string, toContainer, toIndex));
	}

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDraggingCatalogItem(null)}>
			{children}
			<DragOverlay>
				{draggingCatalogItem && (
					<div className="catalog-item-drag-overlay">
						{draggingCatalogItem.name} — {formatMoney(draggingCatalogItem.price, draggingCatalogItem.currency)}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

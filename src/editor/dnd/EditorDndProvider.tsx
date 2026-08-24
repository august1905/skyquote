import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragMoveEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { addPricingItemFromCatalog, containerBlocksOf, moveBlock, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { CatalogItem } from '../types';
import { formatMoney } from '../../pricing/formatMoney';
import { BLOCK_ICONS, FIELD_ICONS, PALETTE_BLOCK_KINDS, paletteCanInsertInto, type InsertTarget, type PaletteDragData } from '../content/palette';
import { usePaletteInsert } from '../content/usePaletteInsert';
import { FIELD_TYPE_LABELS } from '../fields/fieldTypes';
import { ActivePaletteDragContext, PaletteDropHintContext, paletteDragBlockType, type PaletteDropHint } from './dragContext';
import '../catalog/catalog.css';
import '../content/content.css';

/**
 * One `DndContext` for the whole editor — canvas block-reorder, the Catalog
 * panel's drag-into-a-pricing-table (§7.7), and the Content panel's
 * drag-a-tile-onto-the-page (§4.1 path 1). dnd-kit only tracks one active drag
 * per context, and all three sources live in different branches of the editor
 * layout (`RightRail` is a sibling of `TemplateCanvas`, not a descendant), so
 * they have to share the one context that wraps them both.
 *
 * Every draggable/droppable in the editor tags its dnd-kit `data` with a `kind`
 * so `handleDragEnd` can dispatch correctly — `SortableBlock`'s
 * `{ kind: 'block', container }`, `CatalogItemCard`'s
 * `{ kind: 'catalogItem', catalogItem }`, `PricingTableBlockView`'s drop zone
 * `{ kind: 'pricingTableDrop', pageId, blockId }`, `PaletteTile`'s
 * `{ kind: 'paletteBlock' | 'paletteField', … }`, and
 * `BlockContainerDropRegion`'s `{ kind: 'blockContainer', container, appendIndex }`.
 */
type DragData = { kind: 'block'; container: BlockContainer } | { kind: 'catalogItem'; catalogItem: CatalogItem } | PaletteDragData;

type DropData =
	| { kind: 'block'; container: BlockContainer }
	| { kind: 'pricingTableDrop'; pageId: string; blockId: string }
	| { kind: 'blockContainer'; container: BlockContainer; appendIndex: number };

function isPaletteDrag(data: DragData | undefined): data is PaletteDragData {
	return data?.kind === 'paletteBlock' || data?.kind === 'paletteField';
}

/**
 * Same page top level, the exact same column, or the exact same
 * smart_content's children — reorder, already wired. Different pages at the
 * top level — cross-page move, already wired (predates Columns). A page's
 * top level <-> a container, or container <-> a different container
 * (including a different container *type* — a column and a smart_content
 * are never interchangeable drop targets) — cross-container drops aren't
 * wired yet; §4.4's validity rules (e.g. rejecting a dropped container block)
 * need dedicated handling first, so those drags just snap back for now.
 */
function isCompatibleDropTarget(from: BlockContainer, to: BlockContainer): boolean {
	const fromParent = from.parent;
	const toParent = to.parent;
	if (!fromParent && !toParent) return true;
	if (fromParent && toParent) {
		if (from.pageId !== to.pageId) return false;
		if ('columnsBlockId' in fromParent && 'columnsBlockId' in toParent) {
			return fromParent.columnsBlockId === toParent.columnsBlockId && fromParent.column === toParent.column;
		}
		if ('smartContentBlockId' in fromParent && 'smartContentBlockId' in toParent) {
			return fromParent.smartContentBlockId === toParent.smartContentBlockId;
		}
	}
	return false;
}

/**
 * §4.1: "the drop target is the gap, not the block". Which gap a block-hover
 * means is decided by comparing the dragged thing's midpoint with the hovered
 * block's — above it inserts before, below it inserts after.
 *
 * Both rects come from dnd-kit rather than from the pointer event, so they're in
 * the same coordinate space and stay correct when the canvas scrolls mid-drag
 * (dnd-kit keeps `translated` and `over.rect` consistent; a raw `clientY` mixed
 * with a rect measured before the scroll would not be).
 */
function insertsBeforeOverBlock(event: DragMoveEvent | DragEndEvent): boolean {
	const overRect = event.over?.rect;
	const dragRect = event.active.rect.current.translated;
	if (!overRect || !dragRect) return true;
	return dragRect.top + dragRect.height / 2 < overRect.top + overRect.height / 2;
}

function sameHint(a: PaletteDropHint | null, b: PaletteDropHint | null): boolean {
	if (a === null || b === null) return a === b;
	return a.blockId === b.blockId && a.insertBefore === b.insertBefore;
}

/** A label for the thing following the cursor — the tile has left the panel, so it has to say what it is. */
function paletteDragLabel(drag: PaletteDragData): { icon: string; label: string } {
	if (drag.kind === 'paletteField') {
		return { icon: FIELD_ICONS[drag.fieldType], label: FIELD_TYPE_LABELS[drag.fieldType] };
	}
	const kind = PALETTE_BLOCK_KINDS.find((candidate) => candidate.type === drag.blockType);
	return { icon: BLOCK_ICONS[drag.blockType] ?? '▢', label: kind?.label ?? drag.blockType };
}

export function EditorDndProvider({ children }: { children: ReactNode }) {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const runCommand = useEditorStore((s) => s.runCommand);
	const { insertPaletteItem } = usePaletteInsert();
	// Only ever set for a catalog-item drag — block drags move in place via
	// SortableBlock's own CSS transform (unchanged from before this was
	// lifted up) and don't need an overlay. A catalog card, though, has to
	// visibly follow the cursor out of the right rail and into the canvas —
	// its own layout position (inside RightRail) never overlaps a pricing
	// table, so without this there'd be nothing to see while dragging.
	const [draggingCatalogItem, setDraggingCatalogItem] = useState<CatalogItem | null>(null);
	// A palette tile needs the same treatment for the same reason: it starts life
	// in the right rail, and the whole gesture is about arriving somewhere else.
	const [paletteDrag, setPaletteDrag] = useState<PaletteDragData | null>(null);
	const [dropHint, setDropHint] = useState<PaletteDropHint | null>(null);

	// A small activation distance so a plain click (to select a block, or
	// place a cursor in it) doesn't get eaten as a drag start — only the
	// handle button / catalog card / palette tile have `listeners` attached, but
	// the distance threshold is still worth keeping so an accidental tiny mouse
	// move while clicking doesn't immediately count as "dragging". It's also
	// what lets a palette tile be both a click target (§4.1 path 2) and a drag
	// source (path 1) without the two gestures fighting.
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	function clearDragState() {
		setDraggingCatalogItem(null);
		setPaletteDrag(null);
		setDropHint(null);
	}

	function handleDragStart({ active }: DragStartEvent) {
		const data = active.data.current as DragData | undefined;
		setDraggingCatalogItem(data?.kind === 'catalogItem' ? data.catalogItem : null);
		setPaletteDrag(isPaletteDrag(data) ? data : null);
		setDropHint(null);
	}

	/**
	 * Keeps §4.1's insertion indicator in step with the pointer. State is only
	 * set when the resolved gap actually *changes* — this fires on every mouse
	 * move, and re-rendering the canvas at that rate would be visible.
	 */
	function handleDragMove(event: DragMoveEvent) {
		const activeData = event.active.data.current as DragData | undefined;
		if (!isPaletteDrag(activeData)) return;
		const overData = event.over?.data.current as DropData | undefined;
		let next: PaletteDropHint | null = null;
		if (event.over && overData?.kind === 'block' && paletteCanInsertInto(paletteDragBlockType(activeData), overData.container)) {
			next = { blockId: String(event.over.id), insertBefore: insertsBeforeOverBlock(event) };
		}
		setDropHint((current) => (sameHint(current, next) ? current : next));
	}

	/** Where a palette drop lands: the gap beside the hovered block, or the end of a hovered container. */
	function paletteDropTarget(event: DragEndEvent, overData: DropData): InsertTarget | null {
		if (overData.kind === 'blockContainer') {
			return { container: overData.container, index: overData.appendIndex };
		}
		if (overData.kind !== 'block') return null;
		const blocks = containerBlocksOf(pages, overData.container);
		const overIndex = blocks?.findIndex((block) => block.id === event.over?.id) ?? -1;
		if (overIndex === -1) return null;
		return { container: overData.container, index: insertsBeforeOverBlock(event) ? overIndex : overIndex + 1 };
	}

	function handlePaletteDrop(event: DragEndEvent, activeData: PaletteDragData, overData: DropData) {
		const target = paletteDropTarget(event, overData);
		if (!target) return;
		if (!paletteCanInsertInto(paletteDragBlockType(activeData), target.container)) return;
		// Image and Video resolve to a *placement* rather than a block — a library
		// image has to be picked, a URL resolved through oEmbed — and the target
		// travels with it so the Content panel finishes the drop where it landed.
		// See `usePaletteInsert`, shared with the panel's click path.
		insertPaletteItem(activeData, target);
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		clearDragState();
		if (!over) return;
		const activeData = active.data.current as DragData | undefined;
		const overData = over.data.current as DropData | undefined;
		if (!activeData || !overData) return;

		if (isPaletteDrag(activeData)) {
			handlePaletteDrop(event, activeData, overData);
			return;
		}

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
		// a silent failure: the drag just snaps back. Palette drags don't share
		// it; `BlockContainerDropRegion` gives them an explicit target.
		if (toIndex === -1) return;

		runCommand(moveBlock(fromContainer.pageId, active.id as string, toContainer, toIndex));
	}

	const overlay = paletteDrag ? paletteDragLabel(paletteDrag) : null;

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={clearDragState}>
			<ActivePaletteDragContext.Provider value={paletteDrag}>
				<PaletteDropHintContext.Provider value={dropHint}>{children}</PaletteDropHintContext.Provider>
			</ActivePaletteDragContext.Provider>
			<DragOverlay>
				{draggingCatalogItem && (
					<div className="catalog-item-drag-overlay">
						{draggingCatalogItem.name} — {formatMoney(draggingCatalogItem.price, draggingCatalogItem.currency)}
					</div>
				)}
				{overlay && (
					<div className="palette-tile-drag-overlay">
						<span className="palette-tile-icon" aria-hidden="true">
							{overlay.icon}
						</span>
						{overlay.label}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

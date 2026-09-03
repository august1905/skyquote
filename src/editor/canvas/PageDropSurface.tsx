import { useDroppable } from '@dnd-kit/core';
import type { BlockContainer } from '../commands';
import { paletteCanInsertInto } from '../content/palette';
import { paletteDragBlockType, useActivePaletteDrag } from '../dnd/dragContext';

interface PageDropSurfaceProps {
	container: BlockContainer;
	/** Where a block dropped here goes in `page.blocks` — the end of this physical sheet's slice, same rule as `BlockContainerDropRegion`. */
	appendIndex: number;
}

/** A stable dnd-kit id per physical sheet. Two sheets of one logical page share a container, so the append index is part of the identity. */
function surfaceId(container: BlockContainer, appendIndex: number): string {
	return `page-surface-${container.pageId}-${appendIndex}`;
}

/**
 * The paper itself, as a drop target.
 *
 * Without this, dropping a Content tile anywhere except *onto an existing
 * block* did nothing at all: the only page-level droppable was
 * `.canvas-page-blocks`, which is a flex column sized to its content — on a
 * blank Letter page that is a 66px strip near the top of a 1056px sheet. The
 * other 94% of the paper resolved to no droppable, `over` came back null, and
 * `handleDragEnd` returned. Reported as "they drag, but when I release they do
 * not place" (Grayson, 2026-09-03), and measured before it was fixed. Pinned
 * blocks make it worse rather than better: they leave the flow, so on a page
 * authored the way this editor now defaults to, that strip is empty too.
 *
 * `inset: 0` on a child of `.canvas-page` covers the **padding box** — which
 * for a page is the paper, margins included. That is exactly the coordinate
 * space `placementToCss` positions pinned blocks in, so the offset measured
 * here needs no correction to become a `BlockPlacement`.
 *
 * Deliberately never wins over a block. dnd-kit's default collision detection
 * ranks by intersection-over-union, so a small droppable that the dragged rect
 * covers outranks a large one it barely dents — a block, and the blocks column
 * around it, both beat a full sheet. Dropping between two blocks still means
 * "into the flow there"; only the open paper resolves here.
 */
export function PageDropSurface({ container, appendIndex }: PageDropSurfaceProps) {
	const activeDrag = useActivePaletteDrag();
	const accepts = activeDrag !== null && paletteCanInsertInto(paletteDragBlockType(activeDrag), container);
	const id = surfaceId(container, appendIndex);
	const { setNodeRef, isOver } = useDroppable({
		id,
		data: { kind: 'pageSurface', container, appendIndex },
		disabled: !accepts,
	});

	return (
		<div
			ref={setNodeRef}
			// Read back at drop time to turn the pointer into page px — a live
			// `getBoundingClientRect()` is in the same coordinate space as the
			// pointer's own clientX/clientY, which a rect measured at drag start
			// stops being the moment the canvas scrolls.
			data-page-drop-surface={id}
			className={`canvas-page-drop-surface${isOver ? ' canvas-page-drop-surface-over' : ''}`}
			aria-hidden="true"
		/>
	);
}

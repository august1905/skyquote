import { useDroppable } from '@dnd-kit/core';
import type { CSSProperties, ReactNode } from 'react';
import type { BlockContainer } from '../commands';
import { paletteCanInsertInto } from '../content/palette';
import { paletteDragBlockType, useActivePaletteDrag } from '../dnd/dragContext';

interface BlockContainerDropRegionProps {
	container: BlockContainer;
	/** Where a block dropped on the region itself (rather than on one of its blocks) goes — the end of this container, or of this physical page's slice of it. */
	appendIndex: number;
	className: string;
	style?: CSSProperties;
	children: ReactNode;
}

/**
 * A stable dnd-kit id for a container region. Two physical pages of the same
 * logical page each render one of these for the *same* container, so the
 * append index is part of the identity — without it they'd collide and dnd-kit
 * would track only one of them.
 */
function dropRegionId(container: BlockContainer, appendIndex: number): string {
	const parent = container.parent;
	const scope = !parent
		? 'page'
		: 'columnsBlockId' in parent
			? `col-${parent.columnsBlockId}-${parent.column}`
			: `smart-${parent.smartContentBlockId}`;
	return `drop-region-${container.pageId}-${scope}-${appendIndex}`;
}

/**
 * Wraps a list of blocks (a page's, a column's, a smart-content container's) so
 * a palette tile can be dropped on the container as a whole — appending to the
 * end, and crucially giving an **empty** container something to drop onto at
 * all. A block dropped over an existing block resolves against that block's own
 * droppable instead (see `EditorDndProvider`), which wins on collision because
 * dnd-kit ranks by intersection ratio and a block's rect is far smaller than
 * its container's.
 *
 * Registered but `disabled` unless a palette tile is in flight — a disabled
 * droppable is excluded from collision detection entirely, so block-reorder
 * drags behave exactly as they did before this existed. That mattered enough to
 * shape the whole approach: the alternative (real gap elements between blocks)
 * would have added flex children to the page's block column, changing both the
 * theme's block spacing and the heights §10's pagination measures.
 */
export function BlockContainerDropRegion({ container, appendIndex, className, style, children }: BlockContainerDropRegionProps) {
	const activeDrag = useActivePaletteDrag();
	const accepts = activeDrag !== null && paletteCanInsertInto(paletteDragBlockType(activeDrag), container);
	const { setNodeRef, isOver } = useDroppable({
		id: dropRegionId(container, appendIndex),
		data: { kind: 'blockContainer', container, appendIndex },
		disabled: !accepts,
	});

	return (
		<div
			ref={setNodeRef}
			className={`${className}${accepts ? ' canvas-drop-region-armed' : ''}${isOver ? ' canvas-drop-region-over' : ''}`}
			{...(style ? { style } : {})}
		>
			{children}
		</div>
	);
}

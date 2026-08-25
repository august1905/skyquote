import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { placementToCss } from '../../documents/blockPlacement';
import { clampPlacement, setBlockPlacement, snapToGrid } from '../commands';
import type { BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Block, BlockPlacement, PageId } from '../types';
import { SortableBlock } from './SortableBlock';

interface PlacedBlockProps {
	pageId: PageId;
	container: BlockContainer;
	block: Block;
	selected: boolean;
	multiSelected: boolean;
	pageWidthPx: number;
	pageHeightPx: number;
}

/**
 * A block pinned to a spot on the page (§4.3's placement) — the layer that
 * exists so a cover page can put a headline over a specific band of its
 * background image.
 *
 * Wraps the ordinary `SortableBlock` rather than reimplementing it, so a pinned
 * block keeps every block action it had: its toolbar, Settings, Lock, Delete,
 * comments, text editing. What changes is where it sits and how it moves —
 * reorder-by-drag is meaningless for something at an exact coordinate, so
 * `SortableBlock` hides its reorder handle and disables sorting whenever
 * `block.placement` is set, and these two handles take over.
 *
 * Two handles rather than dragging the body: the body of a text block is where
 * you click to type, and a block you can't click into is worse than one you
 * can't drag.
 */
export function PlacedBlock({ pageId, container, block, selected, multiSelected, pageWidthPx, pageHeightPx }: PlacedBlockProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const placement = block.placement;

	/**
	 * Shared pointer-drag plumbing for both handles.
	 *
	 * Deltas are converted from screen px to page px by the wrapper's own scale
	 * factor: the canvas is not necessarily displayed at 100% (a zoom control, or
	 * simply a narrow window), and a drag that moves the block by a different
	 * amount than the pointer is the kind of thing that makes a placement tool
	 * feel broken.
	 */
	function startDrag(event: ReactPointerEvent<HTMLButtonElement>, onDelta: (dx: number, dy: number, snap: boolean) => BlockPlacement) {
		if (!placement) return;
		event.preventDefault();
		event.stopPropagation();
		// A gesture is its own undo step, never a continuation of whatever numeric
		// input was mid-edit — `preventDefault` above suppresses the blur that would
		// otherwise close that group.
		endCoalescing();
		const handle = event.currentTarget;
		handle.setPointerCapture(event.pointerId);
		const startX = event.clientX;
		const startY = event.clientY;
		const renderedWidth = wrapperRef.current?.getBoundingClientRect().width ?? 0;
		const scale = renderedWidth > 0 && placement.width > 0 ? renderedWidth / placement.width : 1;

		function handleMove(moveEvent: PointerEvent) {
			const next = onDelta((moveEvent.clientX - startX) / scale, (moveEvent.clientY - startY) / scale, !moveEvent.altKey);
			runCommand(setBlockPlacement(pageId, block.id, clampPlacement(next, pageWidthPx, pageHeightPx)), { coalesceKey: `placement-${block.id}` });
		}
		function handleUp() {
			endCoalescing();
			handle.removeEventListener('pointermove', handleMove);
			handle.removeEventListener('pointerup', handleUp);
		}
		handle.addEventListener('pointermove', handleMove);
		handle.addEventListener('pointerup', handleUp);
	}

	if (!placement) return null;

	return (
		<div ref={wrapperRef} className={`canvas-placed${selected ? ' canvas-placed-selected' : ''}`} style={placementToCss(placement, pageWidthPx)}>
			<SortableBlock pageId={pageId} container={container} block={block} selected={selected} multiSelected={multiSelected} />
			{selected && !block.locked && (
				<>
					<button
						type="button"
						className="canvas-placed-move"
						aria-label="Move block on the page"
						title="Drag to move — hold Alt for exact pixels"
						onPointerDown={(e) =>
							startDrag(e, (dx, dy, snap) => ({ ...placement, x: snapToGrid(placement.x + dx, snap), y: snapToGrid(placement.y + dy, snap) }))
						}
					>
						✥
					</button>
					<button
						type="button"
						className="canvas-placed-resize"
						aria-label="Resize block on the page"
						title="Drag to resize — hold Alt for exact pixels"
						onPointerDown={(e) =>
							startDrag(e, (dx, dy, snap) => ({
								...placement,
								width: snapToGrid(placement.width + dx, snap),
								// Only starts pinning the height once the author drags
								// vertically — a box that stops growing with its text the
								// instant it's nudged sideways would be a nasty surprise.
								...(placement.height === undefined && Math.abs(dy) < 4 ? {} : { height: snapToGrid((placement.height ?? 0) + dy, snap) }),
							}))
						}
					/>
				</>
			)}
		</div>
	);
}

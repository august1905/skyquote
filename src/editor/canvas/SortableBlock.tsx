import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Block, PageId } from '../types';
import { deleteBlock, duplicateBlock, toggleBlockLock, wrapInSmartContent, type BlockContainer } from '../commands';
import { findBlockById, isContainerBlockType } from '../commands/blockTree';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { usePaletteDropHint } from '../dnd/dragContext';
import { useEditorStore } from '../store/editorStore';
import { editorBlockContentCss, editorBlockFrameCss } from '../../documents/blockStyle';
import { BlockView } from '../blocks/BlockView';
import { blockTypeLabel } from '../blocks/registry';
import { SaveToLibraryDialog } from '../contentLibrary/SaveToLibraryDialog';
import { useContentLibrary } from '../contentLibrary/useContentLibrary';
import { BlockSettingsPopover } from './BlockSettingsPopover';
import './canvas.css';

interface SortableBlockProps {
	pageId: PageId;
	/** Where this block lives — a page's top level, or a specific column. Carried as dnd-kit sortable `data` so the drag handler can tell same-container reorders from cross-container drops. */
	container: BlockContainer;
	block: Block;
	selected: boolean;
	/** §4.2's multi-select — true when this block is part of the selection but isn't the anchor (`selected`). Gets a highlight, but not its own toolbar. */
	multiSelected: boolean;
	/**
	 * §10's pagination pass — reports this block's real rendered height
	 * (border-box, so padding/border count) every time it changes, via a
	 * `ResizeObserver` on the exact node dnd-kit already tracks. Only ever
	 * set for a top-level block on a page (see `PageFrame.tsx`); a block
	 * nested inside a `ColumnsBlock`/`TableBlock` doesn't participate in
	 * top-level pagination directly — its *container* block's own height
	 * already includes it.
	 */
	onMeasuredHeight?: (blockId: string, height: number) => void;
}

/**
 * `BlockStyle` lands on the inner content wrapper — deliberately never the outer
 * `.canvas-block` div, which owns its own border/padding for selection
 * highlighting and toolbar positioning; letting user style land there would
 * fight that (e.g. a custom border would outrank `.canvas-block-selected`'s
 * border-color override via inline-style specificity, making selection
 * invisible).
 *
 * The mapping itself is shared with the recipient's view and the PDF — see
 * `documents/blockStyle.ts`, which is where it moved to when it turned out none
 * of this styling had ever reached either of them.
 */

export function SortableBlock({ pageId, container, block, selected, multiSelected, onMeasuredHeight }: SortableBlockProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	const toggleMultiSelect = useEditorStore((s) => s.toggleMultiSelect);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);
	const pages = useEditorStore((s) => s.body?.pages);
	const { saveBlocks } = useContentLibrary();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [saveToLibraryOpen, setSaveToLibraryOpen] = useState(false);
	const [overflowOpen, setOverflowOpen] = useState(false);
	const closeOverflow = useCallback(() => setOverflowOpen(false), []);
	useCloseOnEscape(overflowOpen, closeOverflow);
	// The anchor's toolbar acts on the *whole* multi-selection when one
	// exists (§4.2: "Multi-select supports move, delete, duplicate") — just
	// this one block otherwise, unchanged from single-select behavior.
	const selectedBlockIds = selected && multiSelectedBlockIds.length > 0 ? [block.id, ...multiSelectedBlockIds] : [block.id];
	useEffect(() => {
		if (!selected) {
			setSettingsOpen(false);
			setOverflowOpen(false);
		}
	}, [selected]);
	// Drag activation is bound to the handle button only (via attributes/
	// listeners spread there, not on this wrapper) — otherwise every click
	// anywhere in the block, including into the Tiptap editor to place a
	// cursor, would be a candidate drag start. `disabled` keeps a locked
	// block from being picked up at all — see blockCommands.ts's moveBlock
	// for the matching command-layer guard.
	// §4.1's "horizontal insertion indicator between blocks", for a palette tile
	// hovering this block. Drawn as an absolutely-positioned line on the relevant
	// edge (see canvas.css) rather than by opening a real gap: a gap would be a
	// flex child of the page's block column, which would change the theme's block
	// spacing and the heights §10's pagination measures — mid-drag.
	const dropHint = usePaletteDropHint();
	const hintSide = dropHint?.blockId === block.id ? (dropHint.insertBefore ? 'before' : 'after') : null;

	const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
		id: block.id,
		// `kind: 'block'` lets EditorDndProvider's combined onDragEnd tell a
		// block-reorder apart from a catalog-item drop (see
		// editor/dnd/EditorDndProvider.tsx) — both now share one DndContext.
		data: { kind: 'block', container },
		// A pinned block sits at a coordinate, so "drag it above the one before it"
		// has nothing to mean — its position is moved by PlacedBlock's own handle
		// instead. Left in the SortableContext rather than removed from it: it's
		// still a member of `page.blocks`, and the flow blocks' indices depend on
		// that list staying whole.
		disabled: block.locked || Boolean(block.placement),
	});

	// Same DOM node dnd-kit's `setNodeRef` tracks — a plain ref alongside it
	// (rather than reading `setNodeRef`'s own target back out, which dnd-kit
	// doesn't expose) so this can independently observe layout size without
	// depending on dnd-kit's internal node-ref implementation.
	const measureNodeRef = useRef<HTMLDivElement | null>(null);
	function setRefs(node: HTMLDivElement | null) {
		setNodeRef(node);
		measureNodeRef.current = node;
	}

	useEffect(() => {
		if (!onMeasuredHeight) return;
		const node = measureNodeRef.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			// `borderBoxSize` (padding+border included, matching what actually
			// occupies vertical space in the page's flex column) over the
			// older `contentRect` (content-box only) — falls back to
			// `getBoundingClientRect()` for the handful of browsers/test
			// environments (jsdom has no ResizeObserver at all, see below)
			// that don't populate it.
			const borderBoxHeight = entry.borderBoxSize?.[0]?.blockSize;
			onMeasuredHeight(block.id, borderBoxHeight ?? node.getBoundingClientRect().height);
		});
		observer.observe(node);
		return () => observer.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- block.id is stable for a given mounted node; onMeasuredHeight identity changes shouldn't tear down/recreate the observer
	}, []);

	function stopAnd(action: () => void) {
		return (e: MouseEvent) => {
			e.stopPropagation();
			action();
		};
	}

	return (
		<div
			ref={setRefs}
			// `AddBlockMenu` scrolls a freshly inserted block into view by querying this.
			data-block-id={block.id}
			// Margins land on the frame, everything else on the content — see
			// `editorBlockFrameCss`. The frame is the thing an author is moving when
			// they set a margin; the inner div moving inside a stationary outline is
			// what made margin look broken.
			style={{ ...editorBlockFrameCss(block.style), transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
			className={`canvas-block${selected ? ' canvas-block-selected' : ''}${multiSelected ? ' canvas-block-multi-selected' : ''}${isDragging ? ' canvas-block-dragging' : ''}${hintSide ? ` canvas-block-drop-${hintSide}` : ''}`}
			onClick={(e) => {
				e.stopPropagation();
				// A locked block can never be deleted/moved (see blockCommands.ts's
				// guards) — including one in a multi-selection would make the
				// anchor's bulk Delete/Duplicate throw the moment it reached that
				// id, so locked blocks simply aren't shift-click-able into a
				// multi-selection at all.
				if (e.shiftKey && !block.locked) toggleMultiSelect(pageId, block.id);
				else if (!e.shiftKey) select({ pageId, blockId: block.id });
			}}
		>
			{selected && (
				<div className="canvas-block-toolbar">
					{!block.locked && !block.placement && (
						<button type="button" className="canvas-block-drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
							⠿
						</button>
					)}
					{/* Only offered for a top-level, non-container block — a container can never nest inside another container (§4.4), the same rule `wrapInSmartContent` itself enforces. */}
					{!container.parent && !isContainerBlockType(block.type) && !block.locked && (
						<button
							type="button"
							onClick={stopAnd(() => {
								runCommand(wrapInSmartContent(pageId, selectedBlockIds));
								select(null);
							})}
						>
							Smart content
						</button>
					)}
					<button
						type="button"
						onClick={stopAnd(() => {
							for (const id of selectedBlockIds) runCommand(duplicateBlock(pageId, id));
						})}
					>
						{selectedBlockIds.length > 1 ? `Duplicate (${selectedBlockIds.length})` : 'Duplicate'}
					</button>
					{/* §8 puts save-to-library in the "block toolbar overflow", not
					    on the toolbar itself — and that placement turns out to be
					    load-bearing, not cosmetic. A sixth *text* button made the
					    toolbar wide enough to overflow a ColumnsBlock column, which
					    pushed the right-anchored drag handle outside the column and
					    broke drag-to-reorder there (the handle's large horizontal
					    offset made dnd-kit resolve the drop to the neighbouring
					    column instead). A compact `…` keeps the row narrow.

					    It covers §8's "multi-selection" entry point too, since it
					    acts on `selectedBlockIds` exactly like Duplicate and Delete. */}
					<div className="canvas-block-overflow-anchor">
						<button type="button" aria-label="More block actions" aria-expanded={overflowOpen} onClick={stopAnd(() => setOverflowOpen((o) => !o))}>
							⋯
						</button>
						{overflowOpen && (
							<div className="canvas-block-overflow-menu" onClick={(e) => e.stopPropagation()}>
								<button
									type="button"
									onClick={stopAnd(() => {
										setOverflowOpen(false);
										setSaveToLibraryOpen(true);
									})}
								>
									{selectedBlockIds.length > 1 ? `Save ${selectedBlockIds.length} to library` : 'Save to library'}
								</button>
							</div>
						)}
					</div>
					<button type="button" onClick={stopAnd(() => setSettingsOpen((o) => !o))}>
						Settings
					</button>
					<button type="button" onClick={stopAnd(() => runCommand(toggleBlockLock(pageId, block.id)))}>
						{block.locked ? 'Unlock' : 'Lock'}
					</button>
					{!block.locked && (
						<button
							type="button"
							onClick={stopAnd(() => {
								for (const id of selectedBlockIds) runCommand(deleteBlock(pageId, id));
								select(null);
							})}
						>
							{selectedBlockIds.length > 1 ? `Delete (${selectedBlockIds.length})` : 'Delete'}
						</button>
					)}
					{settingsOpen && (
						<BlockSettingsPopover pageId={pageId} block={block} onClose={() => setSettingsOpen(false)} />
					)}
				</div>
			)}
			<div className="canvas-block-content" style={editorBlockContentCss(block.style)}>
				<BlockView pageId={pageId} block={block} selected={selected} />
			</div>
			{saveToLibraryOpen && (
				<SaveToLibraryDialog
					subject={selectedBlockIds.length > 1 ? `${selectedBlockIds.length} blocks` : 'this block'}
					// A block has no name of its own, so its type label is the
					// most useful starting point ("Pricing table", "Text").
					defaultName={selectedBlockIds.length > 1 ? `${selectedBlockIds.length} blocks` : blockTypeLabel(block.type)}
					onCancel={() => setSaveToLibraryOpen(false)}
					onSave={async (name, tags) => {
						// Resolved from live state rather than closing over the
						// blocks: `selectedBlockIds` is ids, and the anchor block
						// may not be the first in document order, so this reads
						// them back in the order they actually appear.
						const page = pages?.find((p) => p.id === pageId);
						const blocks = page ? page.blocks.filter((candidate) => selectedBlockIds.includes(candidate.id)) : [];
						// A nested block (inside a column or smart content) isn't in
						// `page.blocks`, so fall back to finding it by id — saving a
						// nested block on its own is legitimate.
						const resolved = blocks.length > 0 ? blocks : pages ? [findBlockById(pages, block.id)].filter((b): b is Block => Boolean(b)) : [];
						if (resolved.length === 0) return;
						await saveBlocks(name, resolved, tags);
						setSaveToLibraryOpen(false);
					}}
				/>
			)}
		</div>
	);
}

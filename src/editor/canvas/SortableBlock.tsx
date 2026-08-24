import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Block, BlockStyle, PageId } from '../types';
import { deleteBlock, duplicateBlock, toggleBlockLock, wrapInSmartContent, type BlockContainer } from '../commands';
import { findBlockById, isContainerBlockType } from '../commands/blockTree';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { usePaletteDropHint } from '../dnd/dragContext';
import { useEditorStore } from '../store/editorStore';
import { BlockView } from '../blocks/BlockView';
import { blockTypeLabel } from '../blocks/registry';
import { SaveToLibraryDialog } from '../contentLibrary/SaveToLibraryDialog';
import { useContentLibrary } from '../contentLibrary/useContentLibrary';
import { getActiveRichTextEditor, getActiveRichTextEditorOwnerBlockId } from '../richtext/activeRichTextEditor';
import { BlockSettingsPopover } from './BlockSettingsPopover';
import './canvas.css';
import '../comments/comments.css';

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
 * Maps `BlockStyle` (§2's generic per-block styling) onto the inner content
 * wrapper — deliberately never the outer `.canvas-block` div, which owns its
 * own border/padding for selection highlighting and toolbar positioning;
 * letting user style land there would fight that (e.g. a custom border would
 * outrank `.canvas-block-selected`'s border-color override via inline-style
 * specificity, making selection invisible).
 *
 * `margin` only ever sets top/bottom — horizontal position is governed by
 * `width` + `alignment` via auto side-margins below, so an explicit left/
 * right margin is never set, avoiding a conflict between the two. Per-side
 * padding is honored in full (no such conflict there).
 */
function styleFor(style: BlockStyle): CSSProperties {
	const css: CSSProperties = {};
	if (style.margin) {
		css.marginTop = style.margin.top;
		css.marginBottom = style.margin.bottom;
	}
	if (style.padding) {
		const p = style.padding;
		css.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
	}
	if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
	if (style.border) {
		css.border = `${style.border.width}px ${style.border.style} ${style.border.color}`;
		if (style.border.radius) css.borderRadius = style.border.radius;
	}
	if (style.width !== undefined) {
		css.width = `${style.width * 100}%`;
		if (style.alignment === 'center') {
			css.marginLeft = 'auto';
			css.marginRight = 'auto';
		} else if (style.alignment === 'right') {
			css.marginLeft = 'auto';
		}
	}
	return css;
}

export function SortableBlock({ pageId, container, block, selected, multiSelected, onMeasuredHeight }: SortableBlockProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	const toggleMultiSelect = useEditorStore((s) => s.toggleMultiSelect);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);
	const pages = useEditorStore((s) => s.body?.pages);
	const setPendingCommentAnchor = useEditorStore((s) => s.setPendingCommentAnchor);
	const setActiveCommentId = useEditorStore((s) => s.setActiveCommentId);
	const comments = useEditorStore((s) => s.comments);
	const activeCommentId = useEditorStore((s) => s.activeCommentId);
	const { saveBlocks } = useContentLibrary();
	// §12's block-level anchor marker. Unresolved threads only: a resolved one
	// shouldn't keep drawing attention to a block that's been dealt with.
	const blockThreads = comments.filter((comment) => !comment.parentCommentId && comment.blockId === block.id && !comment.resolvedAt);
	const hasComments = blockThreads.length > 0;
	const hasActiveComment = blockThreads.some((comment) => comment.id === activeCommentId);

	/**
	 * §12: a comment anchors "to a block or a text range". Which one this is
	 * depends on where the caret was when the menu was opened — a live text
	 * selection inside *this* text block becomes a range anchor, anything else
	 * anchors to the whole block.
	 *
	 * The owner check matters: the active-editor ref deliberately survives blur
	 * (see activeRichTextEditor.ts), so without it a selection left behind in a
	 * different block would be captured as this block's range.
	 */
	function startComment() {
		const editor = getActiveRichTextEditor();
		const ownerBlockId = getActiveRichTextEditorOwnerBlockId();
		const selection = editor?.state.selection;
		const isTextRange = editor && ownerBlockId === block.id && block.type === 'text' && selection && !selection.empty;
		setPendingCommentAnchor(
			isTextRange ? { blockId: block.id, anchorStart: selection.from, anchorEnd: selection.to } : { blockId: block.id }
		);
	}
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
		disabled: block.locked,
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
			// §12's sidebar scrolls a commented block into view by querying this.
			data-block-id={block.id}
			style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
			className={`canvas-block${selected ? ' canvas-block-selected' : ''}${multiSelected ? ' canvas-block-multi-selected' : ''}${isDragging ? ' canvas-block-dragging' : ''}${hasComments ? ' canvas-block-commented' : ''}${hasActiveComment ? ' canvas-block-comment-active' : ''}${hintSide ? ` canvas-block-drop-${hintSide}` : ''}`}
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
					{!block.locked && (
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
								{/* §12's comment entry point. In the overflow rather than
								    on the toolbar for the width reason above — and it
								    acts on this one block only, never the multi-selection,
								    since a comment anchors to a single place. */}
								<button
									type="button"
									onClick={stopAnd(() => {
										setOverflowOpen(false);
										startComment();
									})}
								>
									Comment
								</button>
								{hasComments && (
									<button
										type="button"
										onClick={stopAnd(() => {
											setOverflowOpen(false);
											const first = blockThreads[0];
											if (first) setActiveCommentId(first.id);
										})}
									>
										{blockThreads.length > 1 ? `Show ${blockThreads.length} comments` : 'Show comment'}
									</button>
								)}
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
			<div className="canvas-block-content" style={styleFor(block.style)}>
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

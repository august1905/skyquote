import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Block, BlockStyle, PageId } from '../types';
import { deleteBlock, duplicateBlock, toggleBlockLock, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { BlockView } from '../blocks/BlockView';
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

export function SortableBlock({ pageId, container, block, selected, multiSelected }: SortableBlockProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	const toggleMultiSelect = useEditorStore((s) => s.toggleMultiSelect);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);
	const [settingsOpen, setSettingsOpen] = useState(false);
	// The anchor's toolbar acts on the *whole* multi-selection when one
	// exists (§4.2: "Multi-select supports move, delete, duplicate") — just
	// this one block otherwise, unchanged from single-select behavior.
	const selectedBlockIds = selected && multiSelectedBlockIds.length > 0 ? [block.id, ...multiSelectedBlockIds] : [block.id];
	useEffect(() => {
		if (!selected) setSettingsOpen(false);
	}, [selected]);
	// Drag activation is bound to the handle button only (via attributes/
	// listeners spread there, not on this wrapper) — otherwise every click
	// anywhere in the block, including into the Tiptap editor to place a
	// cursor, would be a candidate drag start. `disabled` keeps a locked
	// block from being picked up at all — see blockCommands.ts's moveBlock
	// for the matching command-layer guard.
	const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
		id: block.id,
		data: { container },
		disabled: block.locked,
	});

	function stopAnd(action: () => void) {
		return (e: MouseEvent) => {
			e.stopPropagation();
			action();
		};
	}

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
			className={`canvas-block${selected ? ' canvas-block-selected' : ''}${multiSelected ? ' canvas-block-multi-selected' : ''}${isDragging ? ' canvas-block-dragging' : ''}`}
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
					<button
						type="button"
						onClick={stopAnd(() => {
							for (const id of selectedBlockIds) runCommand(duplicateBlock(pageId, id));
						})}
					>
						{selectedBlockIds.length > 1 ? `Duplicate (${selectedBlockIds.length})` : 'Duplicate'}
					</button>
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
		</div>
	);
}

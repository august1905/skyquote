import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MouseEvent } from 'react';
import type { Block, PageId } from '../types';
import { deleteBlock, duplicateBlock } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { BlockView } from '../blocks/BlockView';
import './canvas.css';

interface SortableBlockProps {
	pageId: PageId;
	block: Block;
	selected: boolean;
}

export function SortableBlock({ pageId, block, selected }: SortableBlockProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	// Drag activation is bound to the handle button only (via attributes/
	// listeners spread there, not on this wrapper) — otherwise every click
	// anywhere in the block, including into the Tiptap editor to place a
	// cursor, would be a candidate drag start.
	const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
		id: block.id,
		data: { pageId },
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
			className={`canvas-block${selected ? ' canvas-block-selected' : ''}${isDragging ? ' canvas-block-dragging' : ''}`}
			onClick={() => select({ pageId, blockId: block.id })}
		>
			{selected && (
				<div className="canvas-block-toolbar">
					<button type="button" className="canvas-block-drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
						⠿
					</button>
					<button type="button" onClick={stopAnd(() => runCommand(duplicateBlock(pageId, block.id)))}>
						Duplicate
					</button>
					<button
						type="button"
						onClick={stopAnd(() => {
							runCommand(deleteBlock(pageId, block.id));
							select(null);
						})}
					>
						Delete
					</button>
				</div>
			)}
			<BlockView pageId={pageId} block={block} selected={selected} />
		</div>
	);
}

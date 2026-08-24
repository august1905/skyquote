import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BlockContainer } from '../commands';
import { insertBlock } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { AddBlockMenu } from '../canvas/AddBlockMenu';
import { BlockContainerDropRegion } from '../canvas/BlockContainerDropRegion';
import { SortableBlock } from '../canvas/SortableBlock';
import { COLUMN_INSERTABLE_BLOCK_KINDS } from './insertable';
import type { ColumnsBlock } from '../types';
import type { BlockViewProps } from './types';
import './columns.css';

/**
 * Each column gets its own `SortableContext` scoped to that column's own
 * block ids — dnd-kit supports many `SortableContext`s under one
 * `DndContext` (the one `TemplateCanvas` already provides), which is what
 * lets a block drag-reorder within a column at all. Dragging a block *into*
 * or *out of* a column isn't wired yet (see `TemplateCanvas`'s
 * `isCompatibleDropTarget`) — a known, documented gap, not a silent one.
 */
export function ColumnsBlockView({ pageId, block }: BlockViewProps<ColumnsBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const selection = useEditorStore((s) => s.selection);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);

	return (
		<div className="block-columns" data-block-id={block.id}>
			{block.columns.map((columnBlocks, columnIndex) => {
				const container: BlockContainer = { pageId, parent: { columnsBlockId: block.id, column: columnIndex } };
				const width = block.widths[columnIndex] ?? 1 / block.columns.length;
				return (
					// §4.1 path 1: a palette tile can be dropped straight into a column,
					// including an empty one — which is every column a freshly inserted
					// Columns block has. Container blocks are refused here, not by the
					// drop handler: `BlockContainerDropRegion` disables itself for them,
					// so §4.4's limit shows up as "no target" rather than a failed drop.
					<BlockContainerDropRegion
						key={columnIndex}
						container={container}
						appendIndex={columnBlocks.length}
						className="block-column"
						style={{ flexBasis: `${width * 100}%` }}
					>
						<SortableContext items={columnBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
							{columnBlocks.map((childBlock) => (
								<SortableBlock
									key={childBlock.id}
									pageId={pageId}
									container={container}
									block={childBlock}
									selected={selection?.pageId === pageId && selection.blockId === childBlock.id}
									multiSelected={selection?.pageId === pageId && multiSelectedBlockIds.includes(childBlock.id)}
								/>
							))}
						</SortableContext>
						<AddBlockMenu
							kinds={COLUMN_INSERTABLE_BLOCK_KINDS}
							onInsert={(newBlock) => runCommand(insertBlock(container, columnBlocks.length, newBlock))}
						/>
					</BlockContainerDropRegion>
				);
			})}
		</div>
	);
}

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BlockId, Page } from '../types';
import { insertBlock, renamePage, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { AddBlockMenu } from './AddBlockMenu';
import { SortableBlock } from './SortableBlock';
import './canvas.css';

interface PageFrameProps {
	page: Page;
	selectedBlockId: BlockId | null;
	multiSelectedBlockIds: BlockId[];
}

export function PageFrame({ page, selectedBlockId, multiSelectedBlockIds }: PageFrameProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const container: BlockContainer = { pageId: page.id };

	return (
		<div className="canvas-page">
			<input
				className="canvas-page-name"
				value={page.name}
				onChange={(e) => runCommand(renamePage(page.id, e.target.value), { coalesceKey: `page-name-${page.id}` })}
				onBlur={endCoalescing}
				aria-label="Page name"
			/>
			<SortableContext items={page.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
				<div className="canvas-page-blocks">
					{page.blocks.map((block) => (
						<SortableBlock
							key={block.id}
							pageId={page.id}
							container={container}
							block={block}
							selected={block.id === selectedBlockId}
							multiSelected={multiSelectedBlockIds.includes(block.id)}
						/>
					))}
				</div>
			</SortableContext>
			<AddBlockMenu onInsert={(block) => runCommand(insertBlock(container, page.blocks.length, block))} />
		</div>
	);
}

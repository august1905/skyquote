import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BlockId, Page } from '../types';
import { insertBlock, renamePage } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { AddBlockMenu } from './AddBlockMenu';
import { SortableBlock } from './SortableBlock';
import './canvas.css';

interface PageFrameProps {
	page: Page;
	selectedBlockId: BlockId | null;
}

export function PageFrame({ page, selectedBlockId }: PageFrameProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);

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
						<SortableBlock key={block.id} pageId={page.id} block={block} selected={block.id === selectedBlockId} />
					))}
				</div>
			</SortableContext>
			<AddBlockMenu onInsert={(block) => runCommand(insertBlock(page.id, page.blocks.length, block))} />
		</div>
	);
}

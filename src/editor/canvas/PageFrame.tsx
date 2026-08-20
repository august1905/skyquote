import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect } from 'react';
import type { BlockId, Page } from '../types';
import { insertBlock, renamePage, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { usePagePagination } from '../pagination/usePagePagination';
import { AddBlockMenu } from './AddBlockMenu';
import { SortableBlock } from './SortableBlock';
import './canvas.css';

interface PageFrameProps {
	page: Page;
	selectedBlockId: BlockId | null;
	multiSelectedBlockIds: BlockId[];
	pageContentHeightPx: number;
	blockGapPx: number;
	showPageNumbers: boolean;
	/** This logical page's first physical page number — the running total of every prior logical page's own physical page count. */
	startPageNumber: number;
	/** Reports how many physical pages this logical page currently renders, so `TemplateCanvas` can compute every *later* page's `startPageNumber`. */
	onPhysicalPageCountChange: (pageId: string, count: number) => void;
}

/**
 * §10's pagination pass, per logical `Page` — see `usePagePagination`'s own
 * comment for the measure-and-distribute approach and its v1 scope
 * (whole-block granularity only). One shared `SortableContext` still spans
 * *every* physical page rendered here, not one per physical page — a block
 * dragged across a physical-page boundary within the same logical page is
 * still just a reorder within `page.blocks`, addressed exactly like it was
 * before physical pages existed.
 */
export function PageFrame({
	page,
	selectedBlockId,
	multiSelectedBlockIds,
	pageContentHeightPx,
	blockGapPx,
	showPageNumbers,
	startPageNumber,
	onPhysicalPageCountChange,
}: PageFrameProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const container: BlockContainer = { pageId: page.id };
	const blocksById = new Map(page.blocks.map((b) => [b.id, b]));

	const { physicalPages, reportHeight } = usePagePagination(page.blocks, pageContentHeightPx, blockGapPx);

	useEffect(() => {
		onPhysicalPageCountChange(page.id, physicalPages.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onPhysicalPageCountChange is recreated every TemplateCanvas render; only physicalPages.length/page.id identify a real change worth reporting
	}, [page.id, physicalPages.length]);

	return (
		<SortableContext items={page.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
			{physicalPages.map((physicalPageBlockIds, physicalPageIndex) => {
				const isFirst = physicalPageIndex === 0;
				const isLast = physicalPageIndex === physicalPages.length - 1;
				return (
					// Index as key is fine here — physicalPages is fully recomputed
					// as one array every time, not a stable list of independently
					// identified items being reordered.
					<div className="canvas-page" key={physicalPageIndex}>
						{isFirst && (
							<input
								className="canvas-page-name"
								value={page.name}
								onChange={(e) => runCommand(renamePage(page.id, e.target.value), { coalesceKey: `page-name-${page.id}` })}
								onBlur={endCoalescing}
								aria-label="Page name"
							/>
						)}
						<div className="canvas-page-blocks">
							{physicalPageBlockIds.map((blockId) => {
								const block = blocksById.get(blockId);
								if (!block) return null;
								return (
									<SortableBlock
										key={block.id}
										pageId={page.id}
										container={container}
										block={block}
										selected={block.id === selectedBlockId}
										multiSelected={multiSelectedBlockIds.includes(block.id)}
										onMeasuredHeight={reportHeight}
									/>
								);
							})}
						</div>
						{isLast && <AddBlockMenu onInsert={(block) => runCommand(insertBlock(container, page.blocks.length, block))} />}
						{showPageNumbers && <div className="canvas-page-number">Page {startPageNumber + physicalPageIndex}</div>}
					</div>
				);
			})}
		</SortableContext>
	);
}

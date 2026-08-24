import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef, useState } from 'react';
import { insertBlock, renamePage, type BlockContainer } from '../commands';
import { editorPageBackgroundStyle } from '../../documents/pageBackground';
import { useEditorStore } from '../store/editorStore';
import type { BlockId, Page, Theme } from '../types';
import { usePagePagination } from '../pagination/usePagePagination';
import { AddBlockMenu } from './AddBlockMenu';
import { AddPageMenu } from './AddPageMenu';
import { BlockContainerDropRegion } from './BlockContainerDropRegion';
import { PageMenu } from './PageMenu';
import { SortableBlock } from './SortableBlock';
import './canvas.css';

/**
 * Where a block dropped on this physical page's whitespace goes: after the last
 * block *on this sheet*, indexed within the logical page's own block list. An
 * empty page has no blocks on any sheet, so it appends at 0.
 */
function appendIndexAfter(page: Page, physicalPageBlockIds: BlockId[]): number {
	const lastId = physicalPageBlockIds[physicalPageBlockIds.length - 1];
	if (!lastId) return 0;
	const index = page.blocks.findIndex((block) => block.id === lastId);
	return index === -1 ? page.blocks.length : index + 1;
}

interface PageFrameProps {
	page: Page;
	/** This page's index in `body.pages` — the page menu's move controls need it, and it drives the "insert after" position. */
	pageIndex: number;
	pageCount: number;
	selectedBlockId: BlockId | null;
	multiSelectedBlockIds: BlockId[];
	pageContentHeightPx: number;
	blockGapPx: number;
	showPageNumbers: boolean;
	/** The theme's default background image, used by any page that doesn't set its own. Needs `assetId` too, not just the URL — see `editorPageBackgroundStyle`. */
	themeBackground: Pick<Theme, 'pageBackgroundImageUrl' | 'pageBackgroundAssetId'>;
	/** This logical page's first physical page number — the running total of every prior logical page's own physical page count. */
	startPageNumber: number;
	/**
	 * Reports this logical page's current physical-page grouping so
	 * `TemplateCanvas` can (a) compute every *later* page's `startPageNumber`
	 * from the count, and (b) build the document-wide `blockId -> absolute
	 * physical page number` map a `TableOfContentsBlockView` anywhere in the
	 * template needs to resolve its entries' page numbers.
	 */
	onPhysicalPagesChange: (pageId: string, physicalPages: BlockId[][]) => void;
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
	pageIndex,
	pageCount,
	selectedBlockId,
	multiSelectedBlockIds,
	pageContentHeightPx,
	blockGapPx,
	showPageNumbers,
	themeBackground,
	startPageNumber,
	onPhysicalPagesChange,
}: PageFrameProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const [menuOpen, setMenuOpen] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const container: BlockContainer = { pageId: page.id };
	const blocksById = new Map(page.blocks.map((b) => [b.id, b]));

	const { physicalPages, reportHeight } = usePagePagination(page.blocks, pageContentHeightPx, blockGapPx);

	useEffect(() => {
		onPhysicalPagesChange(page.id, physicalPages);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onPhysicalPagesChange is recreated every TemplateCanvas render; only physicalPages/page.id (both already stable unless genuinely changed, see usePagePagination) identify a real change worth reporting
	}, [page.id, physicalPages]);

	return (
		// `data-page-id` is how the page-navigator drawer scrolls to a page
		// without threading a ref per page up through the canvas.
		<div className="canvas-page-group" data-page-id={page.id}>
			{/* §3 ⑤: "Above each page: the page name (uppercase), a centered `+`
			    (insert page after), and a `…` menu." Deliberately outside
			    `.canvas-page` — this is page *chrome*, not page content, and
			    keeping it out of the frame is what lets the frame's dimensions
			    stay honestly equal to the physical page (§10). */}
			<div className="canvas-page-header">
				<input
					ref={nameInputRef}
					className="canvas-page-name"
					value={page.name}
					onChange={(e) => runCommand(renamePage(page.id, e.target.value), { coalesceKey: `page-name-${page.id}` })}
					onBlur={endCoalescing}
					aria-label="Page name"
				/>
				{/* Asks blank-or-image rather than inserting a blank page outright —
				    see AddPageMenu. */}
				<AddPageMenu insertAtIndex={pageIndex + 1} label="Insert page after" variant="inline" />
				<div className="canvas-page-menu-anchor">
					<button type="button" aria-label="Page options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
						…
					</button>
					{menuOpen && (
						<PageMenu
							page={page}
							pageIndex={pageIndex}
							pageCount={pageCount}
							onClose={() => setMenuOpen(false)}
							// `select()` rather than `focus()`: "Rename" implies
							// replacing the name, so the existing text starts
							// highlighted and typing overwrites it.
							onRequestRename={() => nameInputRef.current?.select()}
						/>
					)}
				</div>
			</div>
			<SortableContext items={page.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
				{physicalPages.map((physicalPageBlockIds, physicalPageIndex) => {
					const isLast = physicalPageIndex === physicalPages.length - 1;
					return (
						// Index as key is fine here — physicalPages is fully recomputed
						// as one array every time, not a stable list of independently
						// identified items being reordered.
						<div className="canvas-page" key={physicalPageIndex} style={editorPageBackgroundStyle(page, themeBackground)}>
							{/* §4.1 path 1's drop target for this page. Per *physical* page, so
							    dropping onto the whitespace of the second sheet appends after the
							    blocks on that sheet rather than at the end of the logical page. */}
							<BlockContainerDropRegion
								container={container}
								appendIndex={appendIndexAfter(page, physicalPageBlockIds)}
								className="canvas-page-blocks"
							>
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
							</BlockContainerDropRegion>
							{isLast && <AddBlockMenu onInsert={(block) => runCommand(insertBlock(container, page.blocks.length, block))} />}
							{showPageNumbers && <div className="canvas-page-number">Page {startPageNumber + physicalPageIndex}</div>}
						</div>
					);
				})}
			</SortableContext>
		</div>
	);
}

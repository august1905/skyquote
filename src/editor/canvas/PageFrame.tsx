import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef, useState } from 'react';
import { renamePage, type BlockContainer } from '../commands';
import { usePaletteInsert } from '../content/usePaletteInsert';
import { editorPageBackgroundStyle } from '../../documents/pageBackground';
import { splitPlacedBlocks } from '../../documents/blockPlacement';
import { useEditorStore } from '../store/editorStore';
import type { BlockId, Page, Theme } from '../types';
import { usePagePagination } from '../pagination/usePagePagination';
import { AddBlockMenu } from './AddBlockMenu';
import { AddPageMenu } from './AddPageMenu';
import { BlockContainerDropRegion } from './BlockContainerDropRegion';
import { PageMenu } from './PageMenu';
import { PlacedBlock } from './PlacedBlock';
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
	/** The paper's own size in px — the coordinate space a pinned block's x/y live in, so every renderer agrees on what `x: 80` means. */
	pageWidthPx: number;
	pageHeightPx: number;
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
	pageWidthPx,
	pageHeightPx,
	startPageNumber,
	onPhysicalPagesChange,
}: PageFrameProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	// The shared insert path, so "+ Add block" gets the same pinned-on-arrival
	// behaviour as a palette drop — see `usePaletteInsert`.
	const { insertBlockAt } = usePaletteInsert();
	const [menuOpen, setMenuOpen] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const container: BlockContainer = { pageId: page.id };
	const blocksById = new Map(page.blocks.map((b) => [b.id, b]));

	// Pinned blocks occupy no space in the column, so pagination must not measure
	// them — a headline pinned over the background image would otherwise push the
	// flow content down by the height of something that isn't in the flow.
	const { flow: flowBlocks, placed: placedBlocks } = splitPlacedBlocks(page.blocks);
	const { physicalPages, reportHeight } = usePagePagination(flowBlocks, pageContentHeightPx, blockGapPx);

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
							{/* Pinned blocks belong to the *paper*, so they render on this
							    logical page's first sheet and sit above the flow column. A
							    page that spills onto a second sheet keeps them on the first:
							    they were positioned against a specific page, and following
							    the overflow would move them somewhere nobody asked for. */}
							{physicalPageIndex === 0 &&
								placedBlocks.map((placedBlock) => (
									<PlacedBlock
										key={placedBlock.id}
										pageId={page.id}
										container={container}
										block={placedBlock}
										selected={placedBlock.id === selectedBlockId}
										multiSelected={multiSelectedBlockIds.includes(placedBlock.id)}
										pageWidthPx={pageWidthPx}
										pageHeightPx={pageHeightPx}
									/>
								))}
							{isLast && <AddBlockMenu onInsert={(block) => insertBlockAt(block, { container, index: page.blocks.length })} />}
							{showPageNumbers && <div className="canvas-page-number">Page {startPageNumber + physicalPageIndex}</div>}
						</div>
					);
				})}
			</SortableContext>
		</div>
	);
}

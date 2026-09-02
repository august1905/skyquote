import { DocumentBlockView } from '../documents/DocumentBlockView';
import { DOCUMENT_FONT } from '../documents/documentFont';
import { collectHeadings } from '../editor/toc/collectHeadings';
import { pageDimensions } from '../editor/pagination/pageDimensions';
import type { Block, BlockId, Page, TemplateBody } from '../editor/types';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import './print.css';
import { readOnlyPageBackgroundStyle } from '../documents/pageBackground';
import { blockStyleToCss } from '../documents/blockStyle';
import { placementToCss, splitPlacedBlocks } from '../documents/blockPlacement';

interface PrintTemplateProps {
	body: TemplateBody;
	/**
	 * The canvas's own `blockId -> physical page number` map. **Reused rather
	 * than recomputed**, which is what makes §10's "matching the PDF export"
	 * true by construction instead of by two implementations agreeing: the PDF's
	 * page breaks are literally the breaks the author is looking at. It also
	 * means the PDF inherits the canvas's v1 whole-block granularity — a long
	 * paragraph won't split mid-page in either place.
	 */
	blockPageNumbers: ReadonlyMap<BlockId, number>;
	resolveImageSrc: (assetId: string) => string;
	smartContentContext: SmartContentContext;
	/**
	 * What to do with §4.5's conditional blocks.
	 *
	 * `'showAll'` for a **template** export, matching what the author sees on the
	 * canvas: a template has no recipient, so no rule has real inputs to evaluate
	 * against, and evaluating anyway would silently drop every conditional block
	 * from the PDF. `'evaluate'` for a **document** export, where the variables
	 * and field values are real and hiding is the correct behaviour.
	 */
	smartContent: 'evaluate' | 'showAll';
}

/**
 * §10's PDF render tree — the same read-only block renderer the recipient
 * document view uses (`DocumentBlockView`), laid out into fixed physical page
 * frames at the template's configured page size.
 *
 * §10's `DECISION` asks for "server-side headless Chromium rendering the same
 * React tree to print CSS… do not hand-write a second layout implementation in
 * a PDF library." Catalyst's SmartBrowz has no URL-to-PDF entry point (only
 * `convertToPdf(html)`, `takeScreenshot(url)` and `generateFromTemplate`), so
 * headless Chromium can't be pointed at a live app route. What it can be handed
 * is the HTML this tree actually produced — same components, same CSS, same
 * page geometry — which keeps the spec's real guarantee (one layout
 * implementation, no drift) even though the mechanism differs from the letter
 * of that line. See `serializeForPdf.ts` for the serialization.
 *
 * Never mounted visibly: `usePdfExport` renders it into an offscreen container,
 * serializes it, and unmounts.
 */
export function PrintTemplate({ body, blockPageNumbers, resolveImageSrc, smartContentContext, smartContent }: PrintTemplateProps) {
	const { width: pageWidthPx, height: pageHeightPx } = pageDimensions(body.settings.pageSize, body.settings.orientation);
	const margins = body.settings.margins;
	const theme = body.settings.theme;

	// Grouped by the physical page number the canvas assigned, so one logical
	// page that overflowed onto three physical sheets prints as three sheets.
	// A block with no entry (nothing measured it yet) falls onto the logical
	// page's first sheet rather than being dropped — a missing measurement
	// shouldn't lose content.
	// `page` rides along so each sheet can carry its logical page's background —
	// every physical sheet a page spills onto gets the same one, which is what a
	// full-bleed background means.
	const sheets: Array<{ key: string; blocks: Block[]; pageNumber: number; page: Page }> = [];
	for (const page of body.pages) {
		const byPageNumber = new Map<number, Block[]>();
		const fallback = Math.min(...page.blocks.map((block) => blockPageNumbers.get(block.id) ?? Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
		for (const block of page.blocks) {
			const number = blockPageNumbers.get(block.id) ?? (Number.isFinite(fallback) ? fallback : 1);
			const existing = byPageNumber.get(number);
			if (existing) existing.push(block);
			else byPageNumber.set(number, [block]);
		}
		// An empty logical page still prints as a blank sheet — it's a page the
		// author deliberately has in their template.
		if (byPageNumber.size === 0) sheets.push({ key: `${page.id}-empty`, blocks: [], pageNumber: sheets.length + 1, page });
		for (const number of [...byPageNumber.keys()].sort((a, b) => a - b)) {
			sheets.push({ key: `${page.id}-${number}`, blocks: byPageNumber.get(number) ?? [], pageNumber: number, page });
		}
	}

	return (
		<div
			className="print-root"
			style={{
				// The theme reaches blocks the same way it reaches the canvas — as
				// custom properties on a wrapper (see canvas.css) — so print output
				// picks up fonts and colours without a second theming path.
				['--theme-heading-font' as string]: DOCUMENT_FONT,
				['--theme-body-font' as string]: DOCUMENT_FONT,
				['--theme-primary-color' as string]: theme.primaryColor,
				['--theme-text-color' as string]: theme.textColor,
				['--theme-page-background' as string]: theme.pageBackgroundColor,
				// `--theme-spacing`, matching TemplateCanvas.tsx exactly — canvas.css
				// reads that name, and the print sheet reuses the same stylesheet.
				['--theme-spacing' as string]: `${theme.baseSpacing}px`,
			}}
		>
			{sheets.map((sheet) => (
				<div
					key={sheet.key}
					className="print-page"
					style={{
						width: `${pageWidthPx}px`,
						height: `${pageHeightPx}px`,
						paddingTop: `${margins.top}px`,
						paddingRight: `${margins.right}px`,
						paddingBottom: `${margins.bottom}px`,
						paddingLeft: `${margins.left}px`,
						// Spread last so a page's own background wins over the sheet's
						// default, exactly as it does on the canvas.
						...readOnlyPageBackgroundStyle(sheet.page, resolveImageSrc, theme),
					}}
				>
					<div className="print-page-blocks" style={{ gap: `${theme.baseSpacing}px` }}>
						{expandSmartContent(splitPlacedBlocks(sheet.blocks).flow, smartContent).map((block) =>
							block.type === 'toc' ? (
								// The one block that bypasses `DocumentBlockView` (page numbers are
								// a pagination concept the web view has no answer for), so it applies
								// the shared block style itself rather than being the one place a
								// padded block quietly loses its padding.
								<div key={block.id} style={blockStyleToCss(block.style)}>
									<PrintTableOfContents body={body} levels={block.levels} blockPageNumbers={blockPageNumbers} />
								</div>
							) : (
								<DocumentBlockView
									key={block.id}
									block={block}
									resolveImageSrc={resolveImageSrc}
									// No live fields in a PDF: nothing is fillable on paper, so
									// every field renders as its inert preview. Passing a role
									// here would make one recipient's inputs look interactive.
									viewerRoleId={null}
									smartContentContext={smartContentContext}
								/>
							)
						)}
					</div>
					{/* §4.3's pinned blocks. They never reached pagination (the canvas
					    excludes them), so they have no page number and land on their
					    logical page's first sheet via the fallback above — which is
					    exactly where they were placed. */}
					{splitPlacedBlocks(sheet.blocks).placed.map((block) =>
						block.placement ? (
							// The class matters: document-view.css's `.doc-view-placed` fill
							// rules are what make a pinned field render at its pinned size
							// here too, not just in the browser view.
							<div key={block.id} className="doc-view-placed" style={placementToCss(block.placement, pageWidthPx)}>
								<DocumentBlockView
									block={block}
									resolveImageSrc={resolveImageSrc}
									viewerRoleId={null}
									smartContentContext={smartContentContext}
								/>
							</div>
						) : null
					)}
					{body.settings.showPageNumbers && <div className="print-page-number">{sheet.pageNumber}</div>}
				</div>
			))}
		</div>
	);
}

/**
 * In `'showAll'` mode, replaces each `smart_content` block with its children so
 * they reach `DocumentBlockView` as ordinary blocks — that component always
 * evaluates the rule and would otherwise hide them.
 *
 * Flattening here rather than adding a mode to `DocumentBlockView` keeps the
 * recipient renderer with exactly one behaviour: a conditional block is shown
 * when its rule says so. A template export is the odd case, so it carries the
 * oddity.
 */
function expandSmartContent(blocks: Block[], mode: 'evaluate' | 'showAll'): Block[] {
	if (mode === 'evaluate') return blocks;
	return blocks.flatMap((block) => (block.type === 'smart_content' ? expandSmartContent(block.children, mode) : [block]));
}

/**
 * The TOC, rendered for print. `DocumentBlockView` deliberately renders nothing
 * for a `toc` block — the recipient view is one continuous scroll with no
 * physical pages, so page numbers there would be meaningless. A PDF is exactly
 * the case where they *are* meaningful, so it gets its own small renderer over
 * the same `collectHeadings` + `blockPageNumbers` the editor's TOC uses, minus
 * that component's heading-depth toolbar and editor-store coupling.
 */
function PrintTableOfContents({
	body,
	levels,
	blockPageNumbers,
}: {
	body: TemplateBody;
	levels: number;
	blockPageNumbers: ReadonlyMap<BlockId, number>;
}) {
	const entries = collectHeadings(body, levels);
	return (
		<div className="print-toc">
			<div className="print-toc-title">Table of Contents</div>
			<ul>
				{entries.map((entry) => (
					<li key={entry.id} style={{ marginLeft: (entry.level - 1) * 16 }}>
						<span>{entry.text || 'Untitled heading'}</span>
						<span className="print-toc-page">{blockPageNumbers.get(entry.blockId) ?? '–'}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

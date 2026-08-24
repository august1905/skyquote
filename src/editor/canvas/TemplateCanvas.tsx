import { useEffect, useState, type CSSProperties } from 'react';
import { defaultPageSettings, defaultTheme } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { BlockId, TemplateSettings, Theme } from '../types';
import { pageContentHeight, pageDimensions } from '../pagination/pageDimensions';
import { AddPageMenu } from './AddPageMenu';
import { PageFrame } from './PageFrame';
import './canvas.css';

/**
 * The Theme panel's values reach every page/block through these CSS custom
 * properties, set once here rather than threaded as props through every
 * block view — §3's Theme "applies template-wide", so one place setting
 * them for the whole canvas is the right shape, and canvas.css's `var(...,
 * fallback)` pattern means nothing breaks for content that doesn't
 * reference a given property.
 */
function themeCssVars(theme: Theme): CSSProperties {
	return {
		'--theme-heading-font': theme.headingFont,
		'--theme-body-font': theme.bodyFont,
		'--theme-primary-color': theme.primaryColor,
		'--theme-text-color': theme.textColor,
		'--theme-page-background': theme.pageBackgroundColor,
		'--theme-spacing': `${theme.baseSpacing}px`,
	} as CSSProperties;
}

/**
 * §10's page size/orientation/margins, same "set once, consumed via CSS
 * `var()`" convention as the theme vars above — `.canvas-page` in canvas.css
 * used to hardcode a Letter-portrait 816×1056 frame with 48px padding
 * regardless of what `TemplateSettings` actually held (dead data since
 * phase 1, same category as `style`/`locked`/`theme` before each of those
 * got wired up). The 96px default margin here is a real, deliberate change
 * from that old 48px hardcoded padding — 1 inch is what a blank template
 * actually stores (see `defaultPageSettings()`), not what the placeholder
 * CSS happened to use.
 */
function pageCssVars(settings: Pick<TemplateSettings, 'pageSize' | 'orientation' | 'margins'>): CSSProperties {
	const { width, height } = pageDimensions(settings.pageSize, settings.orientation);
	const m = settings.margins;
	return {
		'--page-width': `${width}px`,
		'--page-height': `${height}px`,
		'--page-margin-top': `${m.top}px`,
		'--page-margin-right': `${m.right}px`,
		'--page-margin-bottom': `${m.bottom}px`,
		'--page-margin-left': `${m.left}px`,
	} as CSSProperties;
}

export function TemplateCanvas() {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const theme = useEditorStore((s) => s.body?.settings.theme ?? defaultTheme());
	const pageSettings = useEditorStore((s) => s.body?.settings ?? { ...defaultPageSettings(), theme: defaultTheme() });
	const selection = useEditorStore((s) => s.selection);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);
	const setBlockPageNumbers = useEditorStore((s) => s.setBlockPageNumbers);

	// Reported by each PageFrame (see its onPhysicalPagesChange) — every
	// logical page's own current physical-page grouping. Two things get
	// derived from this: (a) the running sum of every *prior* logical page's
	// physical-page count, so a later page's own page numbers (§10's
	// showPageNumbers) come out right once an earlier page has spilled
	// across several physical ones; (b) a flat `blockId -> absolute physical
	// page number` map, pushed to the store for `TableOfContentsBlockView`
	// (which can live on any page, not necessarily this one) to resolve its
	// entries' page numbers against.
	const [physicalPagesByLogicalPage, setPhysicalPagesByLogicalPage] = useState<Record<string, BlockId[][]>>({});

	function handlePhysicalPagesChange(pageId: string, physicalPages: BlockId[][]) {
		setPhysicalPagesByLogicalPage((prev) => (prev[pageId] === physicalPages ? prev : { ...prev, [pageId]: physicalPages }));
	}

	const contentHeightPx = pageContentHeight(pageSettings.pageSize, pageSettings.orientation, pageSettings.margins);

	let runningPageNumber = 1;
	const startPageNumberByLogicalPage: Record<string, number> = {};
	for (const page of pages) {
		startPageNumberByLogicalPage[page.id] = runningPageNumber;
		runningPageNumber += physicalPagesByLogicalPage[page.id]?.length ?? 1;
	}

	useEffect(() => {
		const blockPageNumbers = new Map<BlockId, number>();
		for (const page of pages) {
			const startPageNumber = startPageNumberByLogicalPage[page.id] ?? 1;
			const physicalPages = physicalPagesByLogicalPage[page.id];
			if (!physicalPages) continue;
			physicalPages.forEach((blockIds, physicalPageIndex) => {
				for (const blockId of blockIds) blockPageNumbers.set(blockId, startPageNumber + physicalPageIndex);
			});
		}
		setBlockPageNumbers(blockPageNumbers);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- startPageNumberByLogicalPage is derived fresh from physicalPagesByLogicalPage/pages every render, not an independent dependency
	}, [pages, physicalPagesByLogicalPage, setBlockPageNumbers]);

	return (
		<div className="canvas" style={{ ...themeCssVars(theme), ...pageCssVars(pageSettings) }}>
			{pages.map((page, pageIndex) => (
				<PageFrame
					key={page.id}
					page={page}
					pageIndex={pageIndex}
					pageCount={pages.length}
					selectedBlockId={selection?.pageId === page.id ? selection.blockId : null}
					multiSelectedBlockIds={selection?.pageId === page.id ? multiSelectedBlockIds : []}
					pageContentHeightPx={contentHeightPx}
					blockGapPx={theme.baseSpacing}
					showPageNumbers={pageSettings.showPageNumbers}
					themeBackground={theme}
					startPageNumber={startPageNumberByLogicalPage[page.id] ?? 1}
					onPhysicalPagesChange={handlePhysicalPagesChange}
				/>
			))}
			{/* §3 ⑤ puts a `+` above each page, which inserts *after* it — so the only
			    way to append at the end was to reach for the control above the last
			    page and reason about where its page would land. Reported as "there is
			    no + to add a page at the bottom, its only in between and on top".
			    A trailing control says what it does and sits where the new page will. */}
			<AddPageMenu insertAtIndex={pages.length} label="Add page at the end" variant="trailing" />
		</div>
	);
}

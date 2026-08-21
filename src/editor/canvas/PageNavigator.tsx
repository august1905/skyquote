import { addPage, createBlankPage, movePage } from '../commands';
import { useEditorStore } from '../store/editorStore';
import './pageNavigator.css';

interface PageNavigatorProps {
	onClose: () => void;
}

/**
 * §3 ②'s "left page-navigator drawer", opened by the toolbar's page toggle.
 *
 * **A navigator, not a thumbnail strip — and that gap is deliberate.** §3 ②
 * calls it a "page-thumbnail toggle", but a real thumbnail is a *rendered
 * preview*, which is the same missing capability blocking Content Library's
 * previews (§8: "generated server-side from the same renderer used for PDF
 * export") — and PDF export isn't built. The two alternatives were both
 * worse: rendering each page a second time at `transform: scale()` would
 * double every Tiptap instance and every `ResizeObserver` the pagination pass
 * depends on, and a fake grey rectangle would be a thumbnail-shaped lie. So
 * this shows what it can honestly derive — position, name, and block count —
 * and becomes a thumbnail grid once a renderer exists.
 *
 * Reads pages straight from the store rather than taking them as props: it's
 * a sibling of the canvas, not a child, so threading them through would mean
 * routing page state through `TemplateEditor` for no benefit.
 */
export function PageNavigator({ onClose }: PageNavigatorProps) {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);

	/**
	 * Scrolls the canvas to a page via its `data-page-id` (set by `PageFrame`)
	 * rather than a ref threaded up from each page — the canvas is a sibling
	 * component, and a querySelector keyed on an id this component already
	 * holds is less machinery than lifting N refs for one scroll.
	 *
	 * Also selects the page so the canvas reflects where you just navigated;
	 * `blockId: null` is the store's own "the page itself is selected, not a
	 * block on it" state.
	 */
	function goToPage(pageId: string) {
		select({ pageId, blockId: null });
		document.querySelector(`[data-page-id="${pageId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	return (
		<aside className="page-navigator" aria-label="Pages">
			<div className="page-navigator-header">
				<strong>Pages</strong>
				<button type="button" aria-label="Close pages panel" onClick={onClose}>
					×
				</button>
			</div>
			<ol className="page-navigator-list">
				{pages.map((page, index) => (
					<li key={page.id} className="page-navigator-item">
						<button type="button" className="page-navigator-goto" onClick={() => goToPage(page.id)}>
							<span className="page-navigator-index">{index + 1}</span>
							<span className="page-navigator-name">{page.name || 'Untitled page'}</span>
							{/* Block count is the one honest content signal available
							    without a renderer — enough to tell a cover page from
							    a dense terms page at a glance. */}
							<span className="page-navigator-meta">
								{page.blocks.length} {page.blocks.length === 1 ? 'block' : 'blocks'}
							</span>
						</button>
						{/* Reordering lives here as well as in the page `…` menu:
						    moving a page is much easier against a compact list than
						    against full-size frames you have to scroll between. */}
						<div className="page-navigator-actions">
							<button
								type="button"
								aria-label={`Move ${page.name || 'Untitled page'} up`}
								disabled={index === 0}
								onClick={() => runCommand(movePage(page.id, index - 1))}
							>
								↑
							</button>
							<button
								type="button"
								aria-label={`Move ${page.name || 'Untitled page'} down`}
								disabled={index === pages.length - 1}
								onClick={() => runCommand(movePage(page.id, index + 1))}
							>
								↓
							</button>
						</div>
					</li>
				))}
			</ol>
			<button type="button" className="page-navigator-add" onClick={() => runCommand(addPage(pages.length, createBlankPage('Untitled page')))}>
				+ Add page
			</button>
		</aside>
	);
}

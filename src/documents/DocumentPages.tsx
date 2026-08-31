import type { DocumentBody } from '../api/documents';
import type { RoleId } from '../editor/types';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import { DocumentBlockView, type PricingInteraction } from './DocumentBlockView';
import type { FieldInteraction } from './RichTextView';
import { readOnlyPageBackgroundStyle } from './pageBackground';
import { placementToCss, splitPlacedBlocks } from './blockPlacement';
import { pageDimensions } from '../editor/pagination/pageDimensions';

interface DocumentPagesProps {
	body: DocumentBody;
	/** How an `ImageBlock`'s stored relative path becomes a URL. The two callers differ only here: internally a session works, a recipient needs their token-gated mirror. */
	resolveImageSrc: (assetId: string) => string;
	/** Whose fields render live. `null` means nobody's — the internal read-only view. */
	viewerRoleId: RoleId | null;
	fieldInteraction: FieldInteraction;
	/** Section 1's line-item chooser. Omitted by the internal reader and the print tree, which must render the configured result rather than a chooser. */
	pricingInteraction?: PricingInteraction | undefined;
	smartContentContext: SmartContentContext;
}

/**
 * A stored document's pages, plus its attachments — the read-only rendering
 * shared by a recipient's own link view (`pages/DocumentView.tsx`) and the
 * internal one (`pages/DocumentDetail.tsx`).
 *
 * Extracted when the internal view was built, rather than written twice. The
 * codebase already has three renderers and `PROJECT_CONTEXT.md` is explicit that
 * a fourth is the wrong move — the read-only one gets extended instead. The two
 * callers genuinely differ in only two things: how an asset URL is built, and
 * whose fields (if anyone's) are interactive.
 */
export function DocumentPages({ body, resolveImageSrc, viewerRoleId, fieldInteraction, pricingInteraction, smartContentContext }: DocumentPagesProps) {
	const attachments = body.attachments ?? [];
	// The page size the author placed against — pinned coordinates are in those
	// units, so this is what turns them back into CSS here.
	const { width: pageWidthPx } = pageDimensions(body.settings.pageSize, body.settings.orientation);

	return (
		<>
			<div className="doc-view-pages">
				{body.pages.map((page) => {
					const { flow, placed } = splitPlacedBlocks(page.blocks);
					return (
						// §3 ⑤'s per-page background, which the recipient sees for the first
						// time here — the editor could set one long before anything else
						// rendered it. See documents/pageBackground.ts for why the URL is
						// rebuilt rather than used as stored.
						<div key={page.id} className="doc-view-page" style={readOnlyPageBackgroundStyle(page, resolveImageSrc, body.settings.theme)}>
							{flow.map((block) => (
								<DocumentBlockView
									key={block.id}
									block={block}
									resolveImageSrc={resolveImageSrc}
									viewerRoleId={viewerRoleId}
									pricingInteraction={pricingInteraction}
									fieldInteraction={fieldInteraction}
									smartContentContext={smartContentContext}
								/>
							))}
							{/* §4.3's pinned blocks, over the flow and the page background —
							    the whole point of pinning being that a headline lands on a
							    specific band of that image. Same coordinates the editor used. */}
							{placed.map((block) =>
								block.placement ? (
									<div key={block.id} className="doc-view-placed" style={placementToCss(block.placement, pageWidthPx)}>
										<DocumentBlockView
											block={block}
											resolveImageSrc={resolveImageSrc}
											viewerRoleId={viewerRoleId}
											pricingInteraction={pricingInteraction}
											fieldInteraction={fieldInteraction}
											smartContentContext={smartContentContext}
										/>
									</div>
								) : null
							)}
						</div>
					);
				})}
			</div>
			{/* §3's attachments — "files appended to generated documents". They ride
			    along in the document's snapshotted body, so nothing had to be plumbed
			    through either route.

			    Rendered after the pages rather than inside them: they're appended to
			    the document, not part of its layout, and they must not land between a
			    page and the fields a recipient still has to fill in. */}
			{attachments.length > 0 && (
				<section className="doc-view-attachments" aria-label="Attachments">
					<h2>Attachments</h2>
					<ul>
						{attachments.map((attachment) => (
							<li key={attachment.assetId}>
								<a
									href={resolveImageSrc(attachment.assetId)}
									// `download` rather than a new tab: this is a file to keep, and
									// it also keeps a PDF from replacing the document the reader is
									// partway through.
									download={attachment.filename}
								>
									{attachment.name || attachment.filename}
								</a>
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}

import { embedUrlFor } from '../editor/blocks/videoEmbed';
import { FieldPreview } from '../editor/fields/FieldPreview';
import { computePricingTableTotals, computeQuoteBuilderTotals, type LineTotal } from '../pricing/computeTotals';
import { formatMoney } from '../pricing/formatMoney';
import type { Block, PricingItem, PricingTableBlock, QuoteBuilderBlock } from '../editor/types';
import { evaluateSmartContent, type SmartContentContext } from '../smartContent/evaluateRules';
import { RichTextView, type FieldInteraction } from './RichTextView';
import { blockStyleToCss } from './blockStyle';
import './document-view.css';

interface DocumentBlockViewProps {
	block: Block;
	/**
	 * How an `ImageBlock`'s `assetId` becomes a `src`. Injected rather than
	 * derived here because the same renderer now serves callers with different
	 * answers: a recipient's document uses the token-gated public mirror (they
	 * have no session), while the PDF print tree uses a `data:` URI, because
	 * SmartBrowz's headless Chromium has neither a session nor a token.
	 */
	resolveImageSrc: (assetId: string) => string;
	/** The viewing recipient's own role, or `null` if nothing should ever be live (there's no such thing as an anonymous viewer for a real document, but this keeps the component usable for a future authenticated preview too). */
	viewerRoleId: string | null;
	fieldInteraction?: FieldInteraction | undefined;
	smartContentContext: SmartContentContext;
}

/**
 * The document-viewing counterpart to the editor's `BlockView`/registry —
 * deliberately a separate, purpose-built component rather than reusing the
 * editor's own block views. Reusing them would mean every view accepting a
 * `readOnly`/`mode` prop and every one of their internal Tiptap instances
 * respecting it (§14's eventual "one renderer, mode prop" ideal) — a bigger,
 * cross-cutting change than this pass. This one only ever renders, never
 * mutates, so it can afford to be much simpler: no commands, no editor
 * store, no selection.
 *
 * `toc` renders nothing here even though it's built in the editor (§4.5) —
 * its page numbers are a real-pagination concept, and this view is a single
 * continuously-scrolling web page with no physical pages at all (§11: "web
 * link, not PDF" is the primary viewing experience). An anchor-linked jump
 * nav would be a reasonable future enhancement but isn't spec'd; rendering
 * literal-but-meaningless page numbers here would be worse than nothing.
 */
export function DocumentBlockView(props: DocumentBlockViewProps) {
	const content = renderBlockContent(props);
	// A block that renders nothing gets no wrapper at all — a hidden smart-content
	// block or a `toc` would otherwise leave an empty div carrying its padding and
	// background, i.e. a visible gap where the author expected nothing.
	if (content === null) return null;
	const css = blockStyleToCss(props.block.style);
	// And an unstyled block keeps the exact DOM it had before this existed, rather
	// than gaining a wrapper div around every paragraph in every document.
	if (Object.keys(css).length === 0) return content;
	return (
		<div className="doc-view-block" style={css}>
			{content}
		</div>
	);
}

function renderBlockContent({ block, resolveImageSrc, viewerRoleId, fieldInteraction, smartContentContext }: DocumentBlockViewProps) {
	switch (block.type) {
		case 'text':
			return <RichTextView doc={block.doc} viewerRoleId={viewerRoleId} fieldInteraction={fieldInteraction} />;
		case 'image':
			return (
				<img
					className="doc-view-image"
					src={resolveImageSrc(block.assetId)}
					alt={block.alt}
					style={{ width: block.width, height: block.height, borderRadius: block.shape === 'circle' ? '50%' : undefined }}
				/>
			);
		case 'video': {
			const embedUrl = embedUrlFor(block);
			return embedUrl ? (
				<div className="doc-view-video">
					<iframe src={embedUrl} title="Video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
				</div>
			) : null;
		}
		case 'table':
			return (
				<table className="doc-view-table">
					<colgroup>
						{block.columnWidths.map((width, index) => (
							<col key={index} style={{ width: `${width * 100}%` }} />
						))}
					</colgroup>
					<tbody>
						{block.rows.map((row, rowIndex) => (
							<tr key={rowIndex} className={block.headerRow && rowIndex === 0 ? 'doc-view-table-header-row' : undefined}>
								{row.cells.map((cell, cellIndex) => (
									<td key={cellIndex}>
										<RichTextView doc={cell.doc} viewerRoleId={viewerRoleId} fieldInteraction={fieldInteraction} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			);
		case 'columns':
			return (
				<div className="doc-view-columns">
					{block.columns.map((column, columnIndex) => (
						<div key={columnIndex} className="doc-view-column" style={{ flexBasis: `${(block.widths[columnIndex] ?? 0) * 100}%` }}>
							{column.map((child) => (
								<DocumentBlockView
									key={child.id}
									block={child}
									resolveImageSrc={resolveImageSrc}
									viewerRoleId={viewerRoleId}
									fieldInteraction={fieldInteraction}
									smartContentContext={smartContentContext}
								/>
							))}
						</div>
					))}
				</div>
			);
		case 'page_break':
			return <div className="doc-view-page-break" />;
		case 'spacer':
			// Height and nothing else: no outline, no background, no label. The
			// editor's dashed placeholder is authoring chrome (see SpacerBlockView),
			// and drawing any of it here would make a deliberately empty gap look
			// like a rendering artefact to the recipient.
			return <div style={{ height: block.height }} aria-hidden="true" />;
		case 'field': {
			const live = viewerRoleId !== null && viewerRoleId === block.field.roleId;
			return (
				// The data attributes are what `collectFieldGeometry` reads to tell Zoho
				// Sign where to put each signature box, and for whom. Emitted here rather
				// than in a second, print-only renderer so the coordinates come from the
				// same element the recipient actually sees.
				<div
					className="doc-view-field-block"
					data-field-id={block.field.id}
					data-field-role={block.field.roleId}
					data-field-type={block.field.type}
					data-field-name={block.field.name}
					data-field-required={block.field.required}
				>
					<span className="doc-view-field-name">
						{block.field.name}
						{block.field.required && <span className="doc-view-field-required"> *</span>}
					</span>
					<FieldPreview
						field={block.field}
						live={live}
						value={fieldInteraction?.fieldValues[block.field.id]}
						onChange={fieldInteraction ? (value) => fieldInteraction.onFieldChange(block.field.id, value) : undefined}
						readOnly={fieldInteraction?.readOnly}
					/>
				</div>
			);
		}
		case 'pricing_table':
			return <DocumentPricingTableBlockView block={block} />;
		case 'quote_builder':
			return <DocumentQuoteBuilderBlockView block={block} />;
		case 'smart_content': {
			if (!evaluateSmartContent(block, smartContentContext)) return null;
			return (
				<>
					{block.children.map((child) => (
						<DocumentBlockView
							key={child.id}
							block={child}
							resolveImageSrc={resolveImageSrc}
							viewerRoleId={viewerRoleId}
							fieldInteraction={fieldInteraction}
							smartContentContext={smartContentContext}
						/>
					))}
				</>
			);
		}
		case 'toc':
			return null;
		default:
			return null;
	}
}

/**
 * Only the lines actually included in the frozen total (§7.1: an unselected
 * optional item is excluded) are shown — by the time a `Document` exists,
 * the sender already decided what's in or out (the Create Document
 * wizard's "configure pricing" step); there's no recipient-side pick-your-
 * own-add-ons interactivity yet (see BUILD_STATUS.md), so showing a
 * declined item here would suggest an interactivity that isn't there.
 */
function DocumentPricingLines({ items, lineByItemId, currency }: { items: PricingItem[]; lineByItemId: Map<string, LineTotal>; currency: string }) {
	return (
		<>
			{items
				.filter((item) => lineByItemId.get(item.id)?.included)
				.map((item) => {
					const line = lineByItemId.get(item.id)!;
					return (
						<div key={item.id} className="doc-view-pricing-row">
							<span className="doc-view-pricing-name">{item.name}</span>
							{item.description && <span className="doc-view-pricing-description">{item.description}</span>}
							<span className="doc-view-pricing-qty">×{item.qty}</span>
							<span className="doc-view-pricing-line-total">{formatMoney(line.total, currency)}</span>
						</div>
					);
				})}
		</>
	);
}

function DocumentPricingTableBlockView({ block }: { block: PricingTableBlock }) {
	const totals = computePricingTableTotals(block);
	const lineByItemId = new Map(totals.lines.map((l) => [l.itemId, l] as const));
	return (
		<div className="doc-view-pricing-table">
			<DocumentPricingLines items={block.items} lineByItemId={lineByItemId} currency={block.currency} />
			<div className="doc-view-pricing-footer">
				{block.settings.showSubtotal && (
					<div className="doc-view-pricing-footer-row">
						<span>Subtotal</span>
						<span>{formatMoney(totals.subtotal, block.currency)}</span>
					</div>
				)}
				{block.settings.showDiscount && totals.discount > 0 && (
					<div className="doc-view-pricing-footer-row">
						<span>Discount</span>
						<span>−{formatMoney(totals.discount, block.currency)}</span>
					</div>
				)}
				{block.settings.showTax && (
					<div className="doc-view-pricing-footer-row">
						<span>Tax</span>
						<span>{formatMoney(totals.tax, block.currency)}</span>
					</div>
				)}
				{block.settings.showTotal && (
					<div className="doc-view-pricing-footer-row doc-view-pricing-footer-total">
						<span>Total</span>
						<span>{formatMoney(totals.total, block.currency)}</span>
					</div>
				)}
			</div>
		</div>
	);
}

/** No recipient-side option-picking yet either (same gap as pricing table's optional items) — shows whatever the sender's wizard step left selected. */
function DocumentQuoteBuilderBlockView({ block }: { block: QuoteBuilderBlock }) {
	const totals = computeQuoteBuilderTotals(block);
	const lineByItemId = new Map(totals.lines.map((l) => [l.itemId, l] as const));
	return (
		<div className="doc-view-pricing-table">
			{block.groups.map((group) => (
				<div key={group.id} className="doc-view-quote-group">
					<div className="doc-view-quote-group-name">{group.name}</div>
					<DocumentPricingLines items={group.options} lineByItemId={lineByItemId} currency={block.currency} />
				</div>
			))}
			<div className="doc-view-pricing-footer-row doc-view-pricing-footer-total">
				<span>Total</span>
				<span>{formatMoney(totals.total, block.currency)}</span>
			</div>
		</div>
	);
}

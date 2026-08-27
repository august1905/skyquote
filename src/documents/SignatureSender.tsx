import { useEffect, useRef } from 'react';
import { PrintTemplate } from '../print/PrintTemplate';
import { serializePrintTree } from '../print/serializeForPdf';
import { collectFieldGeometry, signableFields } from '../print/fieldGeometry';
import { pageDimensions } from '../editor/pagination/pageDimensions';
import { resolveAssetUrl, assetFileRelativePath } from '../api/assets';
import { sendForSignature, type SendForSignatureResult } from '../api/documents';
import { EMPTY_SMART_CONTENT_CONTEXT } from '../smartContent/evaluateRules';
import type { DocumentBody } from '../api/documents';
import type { BlockId } from '../editor/types';

interface SignatureSenderProps {
	documentId: string;
	body: DocumentBody;
	blockPageNumbers: ReadonlyMap<BlockId, number>;
	onFinished: (error: string | null, result: SendForSignatureResult | null) => void;
}

/**
 * Renders the document offscreen, measures where every field sits, and hands
 * both to Zoho Sign.
 *
 * Mounted only while a send is in flight, then thrown away — same shape as
 * `PdfExporter`, and for the same reason: the measurement has to happen against
 * a real laid-out tree, and there's no point keeping one mounted afterwards.
 *
 * **The file this produces is never shown to anybody.** The deliverable is the
 * recipient's web link; Zoho Sign simply needs something fixed to attach a
 * signature to, and its API places fields on an uploaded document by page and
 * coordinate. Nothing here downloads, and nothing offers to.
 */
export function SignatureSender({ documentId, body, blockPageNumbers, onFinished }: SignatureSenderProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	// Exactly one send per mount, with no cancel-on-cleanup — StrictMode's
	// setup → cleanup → setup would otherwise make the first attempt cancel
	// itself and the second return early, and nothing would ever be sent. See
	// PdfExporter, where that cost an afternoon.
	const startedRef = useRef(false);
	const finishedRef = useRef(false);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;

		function finish(error: string | null, result: SendForSignatureResult | null) {
			if (finishedRef.current) return;
			finishedRef.current = true;
			onFinished(error, result);
		}

		async function run() {
			const node = rootRef.current;
			if (!node) {
				finish('Could not prepare the document for signing', null);
				return;
			}
			try {
				// Web fonts change text metrics, and a field measured before they
				// resolve would be placed against a layout the PDF doesn't have.
				if (document.fonts) await document.fonts.ready;
				await new Promise((resolve) => requestAnimationFrame(resolve));

				// Documents aren't paginated yet — the map that splits a long page across
				// physical sheets is built by the editor's canvas, which isn't mounted
				// here, so each authored page renders as exactly one sheet. That's right
				// for most proposals and wrong for a page whose content overruns it, and
				// the failure would be silent: fields below the fold get coordinates past
				// the page, where Zoho Sign places them invisibly. Refusing is the honest
				// answer until documents paginate.
				const overflowing = Array.from(node.querySelectorAll<HTMLElement>('.print-page')).some(
					(sheet) => sheet.scrollHeight > sheet.clientHeight + 1
				);
				if (overflowing) {
					finish('One of these pages has more content than fits on it. Split it across two pages, then send for signature.', null);
					return;
				}

				const { width: pageWidthPx } = pageDimensions(body.settings.pageSize, body.settings.orientation);
				// Measured *before* serializing: `serializePrintTree` inlines images as
				// data URIs, which is expensive and can only change layout, never help it.
				const fields = signableFields(collectFieldGeometry(node, pageWidthPx));
				if (fields.length === 0) {
					finish('No signature or fillable field is placed on this document, so there is nothing to sign.', null);
					return;
				}

				const { html } = await serializePrintTree(node, 'document');
				const result = await sendForSignature(documentId, {
					html,
					fields,
					format: body.settings.pageSize === 'A4' ? 'A4' : 'Letter',
				});
				finish(null, result);
			} catch (error) {
				finish(error instanceof Error ? error.message : 'Could not send this document for signature', null);
			}
		}

		void run();
	}, [documentId, body, blockPageNumbers, onFinished]);

	return (
		<div ref={rootRef} aria-hidden="true" data-testid="signature-print-tree">
			<PrintTemplate
				body={body}
				blockPageNumbers={blockPageNumbers}
				resolveImageSrc={(assetId) => resolveAssetUrl(assetFileRelativePath(assetId))}
				smartContentContext={EMPTY_SMART_CONTENT_CONTEXT}
				// A document already has its conditions resolved against real recipients
				// and values, so hidden content stays hidden — unlike a template export,
				// where there's no recipient to evaluate against.
				smartContent="evaluate"
			/>
		</div>
	);
}

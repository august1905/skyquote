import { useEffect, useRef } from 'react';
import { downloadBlob, generatePdf } from '../api/pdf';
import { assetFileRelativePath, resolveAssetUrl } from '../api/assets';
import { EMPTY_SMART_CONTENT_CONTEXT } from '../smartContent/evaluateRules';
import type { BlockId, TemplateBody } from '../editor/types';
import { PrintTemplate } from './PrintTemplate';
import { serializePrintTree } from './serializeForPdf';

interface PdfExporterProps {
	body: TemplateBody;
	blockPageNumbers: ReadonlyMap<BlockId, number>;
	filename: string;
	/** Called once, whether the export succeeded or failed — `error` is the message to show, or null. */
	onFinished: (error: string | null) => void;
}

/**
 * §10's export, as a component that exists only while an export is running.
 *
 * Mounting is what starts it: the print tree has to be in the real DOM to be
 * serialized (fonts resolved, computed styles applied, images loadable with the
 * session that can actually fetch them), so this renders it offscreen, hands the
 * result to the backend, triggers the download and reports back. The caller
 * unmounts it on `onFinished`.
 *
 * A component rather than a hook because the render *is* the work — a hook
 * would have to own a second React root to produce the same tree, for no gain.
 */
export function PdfExporter({ body, blockPageNumbers, filename, onFinished }: PdfExporterProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	/**
	 * Exactly one export per mount, and **no cancel-on-cleanup**.
	 *
	 * Both halves matter, and getting it wrong is what made the first version of
	 * this component hang forever. React 18 StrictMode runs every effect
	 * setup → cleanup → setup: with a `cancelled` flag as well as this guard, the
	 * first run was cancelled by its own cleanup and the second run returned
	 * early because the guard was already set — so nothing ever ran, no request
	 * was ever made, and the button sat on "Exporting…" indefinitely. Found by
	 * instrumenting requests in a real browser: the print tree was mounted and no
	 * `/pdf` call had happened.
	 *
	 * Since the guard already means the work happens once, there's nothing a
	 * cleanup needs to cancel. `finishedRef` covers the other direction — the
	 * editor unmounting mid-export shouldn't report back into a gone component.
	 */
	const startedRef = useRef(false);
	const finishedRef = useRef(false);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;

		function finish(error: string | null) {
			if (finishedRef.current) return;
			finishedRef.current = true;
			onFinished(error);
		}

		async function run() {
			const node = rootRef.current;
			if (!node) {
				finish('Could not prepare the document for export');
				return;
			}
			try {
				// Web fonts change text metrics, so serializing before they resolve
				// can produce a PDF whose line breaks don't match the canvas.
				if (document.fonts) await document.fonts.ready;
				// One frame, so layout for the just-mounted tree has settled.
				await new Promise((resolve) => requestAnimationFrame(resolve));

				const { html, imagesFailed } = await serializePrintTree(node, filename);
				// The paper travels as a parameter because SmartBrowz ignores
				// `@page size` — see PdfPaper in api/pdf.ts. `pageSize` is already
				// 'LETTER' | 'A4' in the domain model; SmartBrowz wants 'Letter' | 'A4'.
				const blob = await generatePdf(html, filename, {
					format: body.settings.pageSize === 'A4' ? 'A4' : 'Letter',
					landscape: body.settings.orientation === 'landscape',
				});
				downloadBlob(blob, filename);
				// An image that couldn't be inlined is a real gap in a client-facing
				// document, so it's reported rather than swallowed — the PDF still
				// downloads, since a mostly-right export is more useful than none.
				finish(imagesFailed > 0 ? `Exported, but ${imagesFailed} image(s) could not be embedded` : null);
			} catch (error) {
				finish(error instanceof Error ? error.message : 'Could not generate the PDF');
			}
		}

		void run();
	}, [body, filename, onFinished]);

	return (
		<div ref={rootRef} aria-hidden="true" data-testid="pdf-print-tree">
			<PrintTemplate
				body={body}
				blockPageNumbers={blockPageNumbers}
				// The author is logged in, so the ordinary authenticated asset path
				// works here — and it's only ever fetched by this browser, which
				// converts it to a `data:` URI before the HTML is sent anywhere.
				resolveImageSrc={(assetId) => resolveAssetUrl(assetFileRelativePath(assetId))}
				smartContentContext={EMPTY_SMART_CONTENT_CONTEXT}
				// A template has no recipient, so no rule has real inputs — showing
				// everything matches what the author sees on the canvas.
				smartContent="showAll"
			/>
		</div>
	);
}

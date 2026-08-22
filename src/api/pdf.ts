import { BACKEND_BASE_URL } from '../config';
import { joinUrl } from './client';

/**
 * §10's PDF export. Not routed through `apiFetch`, which parses every response
 * as JSON — this one comes back as `application/pdf` bytes.
 *
 * Errors still arrive as JSON, so the failure path reads the body for the
 * backend's own message: it's the one that names the real problem ("too large
 * to export", "could not generate the PDF"), which a generic "export failed"
 * would throw away.
 */
const PDF_TIMEOUT_MS = 60_000;

/**
 * The paper the PDF is printed on.
 *
 * Sent as parameters rather than expressed as CSS because **SmartBrowz ignores
 * `@page size`** — measured against the deployed service: `size: A4`,
 * `size: 210mm 297mm` and `size: 794px 1123px` all came back with a Letter
 * MediaBox, with and without `prefer_css_page_size`. Its own
 * `pdf_options.format` + `landscape` are the only things that move the paper,
 * and every other spelling tried (`page_size`, `paper_width`/`paper_height`,
 * `paperWidth`/`paperHeight`, `width`/`height`) was rejected outright with a
 * 502. So the page size has to make the round trip.
 */
export interface PdfPaper {
	format: 'Letter' | 'A4';
	landscape: boolean;
}

export async function generatePdf(html: string, filename: string, paper: PdfPaper): Promise<Blob> {
	let response: Response;
	try {
		response = await fetch(joinUrl(BACKEND_BASE_URL, '/pdf'), {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ html, filename, format: paper.format, landscape: paper.landscape }),
			// A generation that never comes back would otherwise leave the editor's
			// button on "Exporting…" forever with nothing to click. Not hypothetical:
			// against a local `catalyst serve`, where SmartBrowz doesn't work, the
			// request simply never resolves — a minute of silence with no way out was
			// the actual observed behaviour before this. Generation itself takes
			// ~2.5s on the deployed function, so a minute is a generous ceiling
			// rather than a tight one.
			signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			throw new Error('The PDF took too long to generate. Try again, or export fewer pages at once.');
		}
		throw new Error('Could not reach the server to generate the PDF');
	}

	if (!response.ok) {
		let message = 'Could not generate the PDF';
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			// Non-JSON error body — keep the default message.
		}
		throw new Error(message);
	}

	return response.blob();
}

/** Hands a generated PDF to the browser as a download. Revokes the object URL afterwards so a long editing session doesn't leak one per export. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Deferred: revoking synchronously can cancel the download in some browsers
	// before it has started reading the blob.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

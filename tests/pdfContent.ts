import zlib from 'zlib';

/**
 * Does this PDF actually draw anything?
 *
 * Exists because "the HTML contains the text" is not the same claim as "the PDF
 * shows the text", and the suite only ever checked the first one. `print.css`
 * parked the print tree at `left: -20000px` and that rule was inlined into the
 * HTML sent for rendering, so every generated PDF had the right page count, the
 * right field coordinates, and completely blank sheets. The export test passed
 * throughout, because the text really was in the HTML — 20,000px to the left of
 * the paper.
 *
 * Deliberately not a PDF parser. It finds the compressed content streams and
 * counts the operators that put marks on a page, which is all that is needed to
 * tell "blank" from "not blank". No third-party dependency, so this cannot rot
 * the way an unused devDependency does.
 */

function inflateMaybe(bytes: Buffer): Buffer | null {
	for (const fn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) {
		try {
			return fn(bytes);
		} catch {
			/* try the next encoding */
		}
	}
	return null;
}

export interface PdfContentSummary {
	/** `/Type /Page` objects — the sheet count. */
	pages: number;
	/**
	 * Tj / TJ / ' / " operators. **Zero means the PDF draws no text at all**,
	 * whatever the HTML said.
	 */
	textShowOperators: number;
	/** `Do` operators — images and other XObjects actually painted. */
	xobjectDraws: number;
	/**
	 * Embedded font objects. A useful independent corroboration: Chromium embeds
	 * a font subset whenever it lays text out, so zero fonts means no text was
	 * ever laid out, not merely that it was hidden.
	 */
	fonts: number;
}

export function summarizePdfContent(pdf: Buffer): PdfContentSummary {
	const text = pdf.toString('latin1');

	// `\b` after "Page" keeps `/Type /Pages` (the page-tree root) from counting.
	const pages = (text.match(/\/Type\s*\/Page\b/g) || []).length;
	const fonts = (text.match(/\/Type\s*\/Font\b/g) || []).length;

	let textShowOperators = 0;
	let xobjectDraws = 0;

	const objectRe = /(\d+)\s+(\d+)\s+obj\b/g;
	let match: RegExpExecArray | null;
	while ((match = objectRe.exec(text)) !== null) {
		const objEnd = text.indexOf('endobj', match.index);
		if (objEnd === -1) continue;
		const header = text.slice(match.index, objEnd);

		const streamIdx = text.indexOf('stream', match.index);
		if (streamIdx === -1 || streamIdx > objEnd) continue;
		let dataStart = streamIdx + 'stream'.length;
		if (text[dataStart] === '\r') dataStart += 1;
		if (text[dataStart] === '\n') dataStart += 1;
		const dataEnd = text.indexOf('endstream', dataStart);
		if (dataEnd === -1) continue;

		const raw = pdf.subarray(dataStart, dataEnd);
		const content = /\/FlateDecode/.test(header) ? inflateMaybe(raw) || raw : raw;
		const body = content.toString('latin1');

		// Only content streams draw. Font programs and image bitmaps also live in
		// streams and would otherwise contribute nonsense matches.
		if (!/\bBT\b|\bTj\b|\bTJ\b|\bDo\b/.test(body)) continue;

		textShowOperators += (body.match(/(?:\)|\]|>)\s*(?:Tj|TJ|'|")/g) || []).length;
		xobjectDraws += (body.match(/\bDo\b/g) || []).length;
	}

	return { pages, textShowOperators, xobjectDraws, fonts };
}

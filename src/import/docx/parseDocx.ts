import { readZip, zipText } from './zip';

/**
 * `word/document.xml` → a plain description of what's on each page.
 *
 * Deliberately stops short of the editor's model: this layer knows OOXML and
 * nothing about blocks, and `docxToTemplate.ts` knows blocks and nothing about
 * OOXML. The seam is what makes both testable without a zip on one side or a
 * template store on the other.
 *
 * Shaped against a real PandaDoc export (`[Client.Company] House Cleaning
 * Proposal 2025`), whose specifics drive most of the decisions below.
 */

// ─── Units ───────────────────────────────────────────────────────────────────
// Everything in the editor is px at 96dpi, which is also the unit
// `BlockPlacement` and `pageDimensions` already use.

/** 1 twip = 1/1440in. Letter's 12240×15840 twips → 816×1056px, exactly the canvas page. */
export const twipsToPx = (twips: number): number => Math.round(twips / 15);
/** `w:sz` is *half*-points; a point is 4/3px at 96dpi. */
export const halfPointsToPx = (halfPoints: number): number => Math.round((halfPoints * 2) / 3);
/** English Metric Units: 914400 per inch, 9525 per px. */
export const emuToPx = (emu: number): number => Math.round(emu / 9525);

export interface DocxRun {
	text: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	/** `#RRGGBB`, or undefined to inherit. */
	colorHex?: string;
	sizePx?: number;
	href?: string;
}

export interface DocxParagraph {
	runs: DocxRun[];
	align?: 'left' | 'center' | 'right' | 'justify';
	list?: { ordered: boolean; level: number };
}

export interface DocxCell {
	paragraphs: DocxParagraph[];
	colspan: number;
	backgroundColor?: string;
}

/**
 * Where a block sits on the page, in px from the paper's top-left.
 *
 * PandaDoc lays every block out as a *floating* table: 66 of this export's 67
 * tables carry `w:tblpPr` with an absolute `tblpX`/`tblpY`. So the design's real
 * geometry is in the file, and the import can pin blocks exactly where the
 * author put them instead of stacking them down the page in reading order.
 */
export interface DocxPosition {
	xPx: number;
	yPx: number;
	widthPx: number;
}

export type DocxContent = { position?: DocxPosition } & (
	| { kind: 'text'; paragraphs: DocxParagraph[]; backgroundColor?: string }
	| { kind: 'image'; relationshipId: string; widthPx: number; heightPx: number }
	| { kind: 'table'; rows: { cells: DocxCell[] }[]; columnWidths: number[] }
);

export interface DocxPage {
	/** A full-bleed image anchored to the page — becomes `Page.background`, not a block. */
	backgroundRelationshipId?: string;
	content: DocxContent[];
}

export interface ParsedDocx {
	pages: DocxPage[];
	pageWidthPx: number;
	pageHeightPx: number;
	margins: { top: number; right: number; bottom: number; left: number };
	showPageNumbers: boolean;
	/** Relationship id → path inside the archive (`word/media/...`). */
	mediaByRelationshipId: Map<string, string>;
	files: Map<string, Uint8Array>;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────
// OOXML always binds the main namespace to the `w:` prefix, so the literal
// prefixed names below are safe and are what every reference example uses.

function childElements(parent: Element, name: string): Element[] {
	return Array.from(parent.children).filter((child) => child.tagName === name);
}

function firstChild(parent: Element, name: string): Element | null {
	return childElements(parent, name)[0] ?? null;
}

/** The first descendant by tag name — for properties nested a level or two down. */
function descendant(parent: Element, name: string): Element | null {
	return parent.getElementsByTagName(name)[0] ?? null;
}

function attr(element: Element | null, name: string): string | null {
	return element?.getAttribute(name) ?? null;
}

/**
 * An OOXML toggle: absent means off, present means on **unless** it carries an
 * explicit falsey `w:val`.
 *
 * The second half is load-bearing here, not defensive. PandaDoc writes every
 * toggle explicitly — this export has 314 `<w:b w:val="false"/>` against 222
 * true, and 528 `<w:strike w:val="false"/>` with no true at all. Treating
 * presence as "on" would render the entire document bold, italic, underlined
 * and struck through.
 */
function toggle(properties: Element | null, name: string): boolean {
	if (!properties) return false;
	const element = firstChild(properties, name);
	if (!element) return false;
	const value = element.getAttribute('w:val');
	return value === null || !['0', 'false', 'off', 'none'].includes(value);
}

function hexColor(value: string | null): string | undefined {
	if (!value || value === 'auto') return undefined;
	return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : undefined;
}

// ─── Runs and paragraphs ─────────────────────────────────────────────────────

function parseRun(run: Element, href?: string): DocxRun | null {
	// `w:tab` and `w:br` carry no text; a run of only those adds nothing to a
	// block whose layout comes from the block model rather than from tab stops.
	const text = childElements(run, 'w:t')
		.map((node) => node.textContent ?? '')
		.join('');
	if (text === '') return null;

	const properties = firstChild(run, 'w:rPr');
	const size = properties ? attr(firstChild(properties, 'w:sz'), 'w:val') : null;
	const color = properties ? hexColor(attr(firstChild(properties, 'w:color'), 'w:val')) : undefined;
	return {
		text,
		bold: toggle(properties, 'w:b'),
		italic: toggle(properties, 'w:i'),
		underline: toggle(properties, 'w:u'),
		strike: toggle(properties, 'w:strike'),
		...(color ? { colorHex: color } : {}),
		...(size ? { sizePx: halfPointsToPx(Number(size)) } : {}),
		...(href ? { href } : {}),
	};
}

const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

function parseParagraph(paragraph: Element, relationships: Map<string, string>, orderedNumberingIds: Set<string>): DocxParagraph {
	const properties = firstChild(paragraph, 'w:pPr');
	const runs: DocxRun[] = [];

	for (const child of Array.from(paragraph.children)) {
		if (child.tagName === 'w:r') {
			const run = parseRun(child);
			if (run) runs.push(run);
		} else if (child.tagName === 'w:hyperlink') {
			// The target is a relationship, not a URL — `w:id` indexes
			// document.xml.rels, the same table images are found through.
			const href = relationships.get(attr(child, 'r:id') ?? '') ?? undefined;
			for (const inner of childElements(child, 'w:r')) {
				const run = parseRun(inner, href);
				if (run) runs.push(run);
			}
		}
	}

	const jc = properties ? attr(firstChild(properties, 'w:jc'), 'w:val') : null;
	const align = jc !== null && ALIGNMENTS.has(jc) ? (jc as NonNullable<DocxParagraph['align']>) : null;
	const numbering = properties ? firstChild(properties, 'w:numPr') : null;
	// A paragraph's `w:numId` names a numbering *instance*, which points at an
	// abstract definition that says whether it's a bullet or a number — see
	// `readOrderedNumberingIds`, which resolves that indirection once.
	const numberingId = numbering ? attr(firstChild(numbering, 'w:numId'), 'w:val') : null;

	return {
		runs,
		...(align ? { align } : {}),
		...(numbering
			? {
					list: {
						ordered: numberingId !== null && orderedNumberingIds.has(numberingId),
						level: Number(attr(firstChild(numbering, 'w:ilvl'), 'w:val') ?? '0'),
					},
				}
			: {}),
	};
}

// ─── Drawings ────────────────────────────────────────────────────────────────

interface Drawing {
	relationshipId: string;
	widthPx: number;
	heightPx: number;
	/** Anchored to the page at its full size — a full-bleed background rather than a block. */
	fullPage: boolean;
}

function parseDrawings(paragraph: Element, pageWidthPx: number, pageHeightPx: number): Drawing[] {
	const drawings: Drawing[] = [];
	for (const drawing of Array.from(paragraph.getElementsByTagName('w:drawing'))) {
		const extent = descendant(drawing, 'wp:extent');
		const blip = descendant(drawing, 'a:blip');
		const relationshipId = attr(blip, 'r:embed');
		if (!extent || !relationshipId) continue;

		const widthPx = emuToPx(Number(attr(extent, 'cx') ?? '0'));
		const heightPx = emuToPx(Number(attr(extent, 'cy') ?? '0'));
		const anchor = firstChild(drawing, 'wp:anchor');
		// PandaDoc emits a page-anchored image at exactly the sheet's size for
		// every branded page — 12 of this template's 13 pages. Those are
		// backgrounds; an image block at 816×1056 pinned at 0,0 would be a
		// re-implementation of the page background the model already has.
		const relativeFrom = attr(descendant(drawing, 'wp:positionH'), 'relativeFrom');
		const fullPage =
			Boolean(anchor) && relativeFrom === 'page' && Math.abs(widthPx - pageWidthPx) <= 2 && Math.abs(heightPx - pageHeightPx) <= 2;

		drawings.push({ relationshipId, widthPx, heightPx, fullPage });
	}

	// Legacy VML, which PandaDoc still emits for *some* full-page backgrounds —
	// one page of this export has its background as `<v:rect><v:fill
	// type="frame" r:id="…">` at 612pt × 792pt instead of a DrawingML anchor.
	// Handling only the page-sized frame case on purpose: general VML is a
	// different format, and this is the one shape that carries content the
	// import would otherwise lose (a whole page's artwork, silently).
	for (const fill of Array.from(paragraph.getElementsByTagName('v:fill'))) {
		const relationshipId = attr(fill, 'r:id');
		const rect = fill.parentElement;
		if (!relationshipId || attr(fill, 'type') !== 'frame' || !rect) continue;
		const style = attr(rect, 'style') ?? '';
		const pointsOf = (name: string) => Number(new RegExp(`(?:^|;)${name}:([\\d.]+)pt`).exec(style)?.[1] ?? '0');
		// A point is 4/3px at 96dpi, the same conversion runs use.
		const widthPx = Math.round((pointsOf('width') * 4) / 3);
		const heightPx = Math.round((pointsOf('height') * 4) / 3);
		if (Math.abs(widthPx - pageWidthPx) <= 2 && Math.abs(heightPx - pageHeightPx) <= 2) {
			drawings.push({ relationshipId, widthPx, heightPx, fullPage: true });
		}
	}
	return drawings;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

function parseTable(table: Element, relationships: Map<string, string>, orderedNumberingIds: Set<string>): DocxContent {
	const grid = childElements(firstChild(table, 'w:tblGrid') ?? table, 'w:gridCol');
	const widths = grid.map((column) => Number(attr(column, 'w:w') ?? '1'));
	const total = widths.reduce((sum, width) => sum + width, 0) || 1;

	const rows = childElements(table, 'w:tr').map((row) => ({
		cells: childElements(row, 'w:tc').map((cell): DocxCell => {
			const properties = firstChild(cell, 'w:tcPr');
			const shading = properties ? hexColor(attr(firstChild(properties, 'w:shd'), 'w:fill')) : undefined;
			return {
				paragraphs: childElements(cell, 'w:p').map((paragraph) => parseParagraph(paragraph, relationships, orderedNumberingIds)),
				colspan: Number(attr(properties ? firstChild(properties, 'w:gridSpan') : null, 'w:val') ?? '1'),
				...(shading ? { backgroundColor: shading } : {}),
			};
		}),
	}));

	return { kind: 'table', rows, columnWidths: widths.map((width) => width / total) };
}

/**
 * A floating table's absolute position, converted to the paper's coordinates.
 *
 * `tblpX`/`tblpY` are twips from whatever `horzAnchor`/`vertAnchor` name — in
 * this export always `margin`, so the page's own margins are added back to get
 * an offset from the paper's edge, which is the space `BlockPlacement` uses.
 * Only `margin` and `page` anchors are honoured; anything else returns null and
 * the block stays in the flow rather than being pinned somewhere invented.
 */
function readTablePosition(table: Element, margins: { top: number; left: number }, contentWidthPx: number): DocxPosition | null {
	const properties = firstChild(table, 'w:tblPr');
	const floating = properties ? firstChild(properties, 'w:tblpPr') : null;
	if (!properties || !floating) return null;

	const horizontalAnchor = attr(floating, 'w:horzAnchor');
	const verticalAnchor = attr(floating, 'w:vertAnchor');
	if (!['margin', 'page'].includes(horizontalAnchor ?? '') || !['margin', 'page'].includes(verticalAnchor ?? '')) return null;

	const width = firstChild(properties, 'w:tblW');
	// `dxa` is twips; `pct` is fiftieths of a percent of the content width.
	const widthValue = Number(attr(width, 'w:w') ?? '0');
	const widthPx = attr(width, 'w:type') === 'pct' ? Math.round((widthValue / 5000) * contentWidthPx) : twipsToPx(widthValue);

	return {
		xPx: (horizontalAnchor === 'margin' ? margins.left : 0) + twipsToPx(Number(attr(floating, 'w:tblpX') ?? '0')),
		yPx: (verticalAnchor === 'margin' ? margins.top : 0) + twipsToPx(Number(attr(floating, 'w:tblpY') ?? '0')),
		widthPx,
	};
}

/**
 * A single-cell table is PandaDoc's block wrapper, not a table.
 *
 * 61 of this export's 67 tables are 1×1: every text block in the PandaDoc
 * editor comes out boxed in one. Importing them as tables would produce a
 * document made of 61 one-celled grids, so they're unwrapped and the cell's
 * shading becomes the text block's background.
 */
function isLayoutWrapper(content: DocxContent): boolean {
	if (content.kind !== 'table') return false;
	return content.rows.length === 1 && content.rows[0]!.cells.length === 1;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function readPageGeometry(body: Element) {
	const size = descendant(body, 'w:pgSz');
	const margin = descendant(body, 'w:pgMar');
	const read = (element: Element | null, name: string, fallback: number) => {
		const value = attr(element, name);
		return value ? twipsToPx(Number(value)) : fallback;
	};
	return {
		pageWidthPx: read(size, 'w:w', 816),
		pageHeightPx: read(size, 'w:h', 1056),
		margins: {
			top: read(margin, 'w:top', 96),
			right: read(margin, 'w:right', 96),
			bottom: read(margin, 'w:bottom', 96),
			left: read(margin, 'w:left', 96),
		},
	};
}

function readRelationships(xml: string | null): Map<string, string> {
	const map = new Map<string, string>();
	if (!xml) return map;
	const document = new DOMParser().parseFromString(xml, 'application/xml');
	for (const relationship of Array.from(document.getElementsByTagName('Relationship'))) {
		const id = relationship.getAttribute('Id');
		const target = relationship.getAttribute('Target');
		if (!id || !target) continue;
		// `TargetMode`, not a URL pattern: a `mailto:` hyperlink is external but
		// matches no http(s) test, and prefixing it with `word/` produced the
		// unopenable `word/mailto:services@skylineclean.com`.
		const external = relationship.getAttribute('TargetMode') === 'External';
		map.set(id, external ? target : `word/${target.replace(/^\.?\//, '')}`);
	}
	return map;
}

/** Bullets vs numbers, resolved through numbering.xml's `w:num` → `w:abstractNum` indirection. */
function readOrderedNumberingIds(xml: string | null): Set<string> {
	const ordered = new Set<string>();
	if (!xml) return ordered;
	const document = new DOMParser().parseFromString(xml, 'application/xml');
	const abstractFormats = new Map<string, string>();
	for (const abstract of Array.from(document.getElementsByTagName('w:abstractNum'))) {
		const id = abstract.getAttribute('w:abstractNumId');
		const format = attr(descendant(abstract, 'w:numFmt'), 'w:val');
		if (id && format) abstractFormats.set(id, format);
	}
	for (const num of Array.from(document.getElementsByTagName('w:num'))) {
		const id = num.getAttribute('w:numId');
		const abstractId = attr(descendant(num, 'w:abstractNumId'), 'w:val');
		if (id && abstractId && abstractFormats.get(abstractId) !== 'bullet') ordered.add(id);
	}
	return ordered;
}

/**
 * Walks the body in document order, closing a page at every section break.
 *
 * PandaDoc emits one `w:sectPr` per page with `w:type="nextPage"` — 13 in this
 * export, for 13 pages — which is the page boundary DOCX otherwise doesn't
 * carry. A `w:sectPr` inside a paragraph's `w:pPr` marks that paragraph as the
 * *last* of its section, so the paragraph is taken first and the page closed
 * after it.
 */
export function parseDocumentXml(
	documentXml: string,
	relationships: Map<string, string>,
	orderedNumberingIds: Set<string>
): Omit<ParsedDocx, 'mediaByRelationshipId' | 'files'> {
	const document = new DOMParser().parseFromString(documentXml, 'application/xml');
	const body = document.getElementsByTagName('w:body')[0];
	if (!body) throw new Error('This .docx has no document body.');

	const geometry = readPageGeometry(body);
	const contentWidthPx = geometry.pageWidthPx - geometry.margins.left - geometry.margins.right;
	const pages: DocxPage[] = [];
	let current: DocxPage = { content: [] };
	let pendingParagraphs: DocxParagraph[] = [];
	/** The shading of the layout wrapper currently being walked, so text inside it keeps the band's colour. */
	let wrapperBackground: string | undefined;
	/**
	 * The position of the wrapper currently being walked, claimed by the first
	 * block that comes out of it.
	 *
	 * Claimed rather than shared because a position describes one box: a wrapper
	 * that produced two blocks would stack them at identical coordinates. In
	 * this export every wrapper holds exactly one block, so the second and later
	 * blocks of a hypothetical multi-block wrapper fall back to the flow —
	 * visible and fixable, where overlapping pins would not be.
	 */
	let wrapperPosition: DocxPosition | undefined;

	function claimPosition(): DocxPosition | undefined {
		const position = wrapperPosition;
		wrapperPosition = undefined;
		return position;
	}

	function flushParagraphs(backgroundColor = wrapperBackground) {
		const withText = pendingParagraphs.filter((paragraph) => paragraph.runs.length > 0);
		pendingParagraphs = [];
		if (withText.length === 0) return;
		const position = claimPosition();
		current.content.push({
			kind: 'text',
			paragraphs: withText,
			...(backgroundColor ? { backgroundColor } : {}),
			...(position ? { position } : {}),
		});
	}

	function closePage() {
		flushParagraphs();
		// A section break on a page with nothing on it is PandaDoc's own
		// spacing artefact, not a blank page the author drew.
		if (current.content.length > 0 || current.backgroundRelationshipId) pages.push(current);
		current = { content: [] };
	}

	function addParagraph(paragraph: Element) {
		for (const drawing of parseDrawings(paragraph, geometry.pageWidthPx, geometry.pageHeightPx)) {
			if (drawing.fullPage) {
				// First one wins. PandaDoc emits a page's background twice —
				// a DrawingML anchor *and* a VML frame fallback, byte-different
				// encodings of identical artwork (108KB vs 295KB on the cover
				// page of this export). Taking the first keeps the smaller,
				// modern one; last-wins uploaded the fallback.
				current.backgroundRelationshipId ??= drawing.relationshipId;
				continue;
			}
			// An image interrupts the run of paragraphs, so what came before it
			// stays above it in the block order.
			flushParagraphs();
			const position = claimPosition();
			current.content.push({
				kind: 'image',
				relationshipId: drawing.relationshipId,
				widthPx: drawing.widthPx,
				heightPx: drawing.heightPx,
				// The wrapper says where; the image says how big. Its own extent
				// wins over the wrapper's width, which is usually the full column.
				...(position ? { position: { ...position, widthPx: drawing.widthPx } } : {}),
			});
		}
		pendingParagraphs.push(parseParagraph(paragraph, relationships, orderedNumberingIds));
	}

	/**
	 * Walks paragraphs and tables in document order, recursing through layout
	 * wrappers.
	 *
	 * Recursion is not a nicety: this export nests its **real** tables inside
	 * 1×1 wrappers, so a walk that unwrapped a wrapper by taking only its
	 * paragraphs silently dropped every data table in the document. Measured —
	 * the first run of this parser imported 50 text blocks, 12 images and zero
	 * tables.
	 */
	function walk(container: Element) {
		for (const child of Array.from(container.children)) {
			if (child.tagName === 'w:p') {
				addParagraph(child);
				const properties = firstChild(child, 'w:pPr');
				if (properties && firstChild(properties, 'w:sectPr')) closePage();
			} else if (child.tagName === 'w:tbl') {
				flushParagraphs();
				const table = parseTable(child, relationships, orderedNumberingIds);
				const position = readTablePosition(child, geometry.margins, contentWidthPx) ?? undefined;
				if (isLayoutWrapper(table)) {
					const cell = firstChild(firstChild(child, 'w:tr')!, 'w:tc');
					if (cell) {
						const shading = (table as { rows: { cells: DocxCell[] }[] }).rows[0]!.cells[0]!.backgroundColor;
						wrapperBackground = shading;
						wrapperPosition = position;
						walk(cell);
						flushParagraphs(shading);
						wrapperBackground = undefined;
						wrapperPosition = undefined;
					}
				} else {
					current.content.push({ ...table, ...(position ? { position } : {}) });
				}
			} else if (child.tagName === 'w:sectPr') {
				closePage();
			}
		}
	}
	walk(body);
	closePage();

	return { pages, ...geometry, showPageNumbers: false };
}

/** The whole archive → the parsed description, including where each image's bytes live. */
export async function parseDocx(buffer: ArrayBuffer): Promise<ParsedDocx> {
	const files = await readZip(buffer);
	const documentXml = zipText(files, 'word/document.xml');
	if (!documentXml) throw new Error('That file is not a Word document — it has no word/document.xml.');

	const relationships = readRelationships(zipText(files, 'word/_rels/document.xml.rels'));
	const parsed = parseDocumentXml(documentXml, relationships, readOrderedNumberingIds(zipText(files, 'word/numbering.xml')));

	// Only `word/media/*` — the relationship table also names styles.xml, the
	// header and the numbering definitions, which are parts, not pictures.
	const mediaByRelationshipId = new Map<string, string>();
	for (const [id, target] of relationships) {
		if (target.startsWith('word/media/') && files.has(target)) mediaByRelationshipId.set(id, target);
	}

	// PandaDoc's footer is a bare PAGE field — no text of its own — which is
	// exactly what the template's own page numbering already does.
	const footer = Object.keys(Object.fromEntries(files)).find((name) => /^word\/footer/.test(name));
	const showPageNumbers = footer ? (zipText(files, footer) ?? '').includes('PAGE') : false;

	return { ...parsed, showPageNumbers, mediaByRelationshipId, files };
}

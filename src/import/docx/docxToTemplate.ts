import type { Block, BlockPlacement, Page, RichTextDoc, RichTextNode, TableCell, TemplateBody } from '../../editor/types';
import { clampPlacement } from '../../editor/commands';
import { pageDimensions } from '../../editor/pagination/pageDimensions';
import { TEXT_STYLE_COLORS, MAX_TEXT_STYLE_SIZE, MIN_TEXT_STYLE_SIZE } from '../../editor/textStyles';
import { allVariables } from '../../editor/variables/systemVariables';
import type { DocxCell, DocxContent, DocxParagraph, DocxPosition, DocxRun, ParsedDocx } from './parseDocx';

/**
 * A parsed `.docx` → a `TemplateBody`.
 *
 * Pure: images arrive already uploaded (see `importDocx.ts`), so this whole
 * layer is testable without a backend, and the mapping decisions below are
 * assertable one at a time.
 */

/** An uploaded image, keyed by the relationship id it came from. */
export interface ImportedImage {
	assetId: string;
	url: string;
}

export interface DocxImportResult {
	body: TemplateBody;
	/** Tokens found in the text that no variable in this app defines — left as literal text, and reported so nothing is silently invented. */
	unmappedTokens: string[];
	counts: { pages: number; textBlocks: number; images: number; tables: number; backgrounds: number };
}

// ─── Styling ─────────────────────────────────────────────────────────────────

function channels(hex: string): [number, number, number] {
	return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * The nearest house colour, by plain RGB distance.
 *
 * Grayson's call (2026-09-04): snap rather than preserve. PandaDoc's navy is
 * `#004C83` and Skyline's is `#094D82` — a difference nobody can see and every
 * document would otherwise carry forever, un-nameable by the style selector.
 * Snapping means imported text arrives wearing real house styles.
 */
export function nearestHouseColor(hex: string): string {
	const [r, g, b] = channels(hex);
	let best = hex;
	let bestDistance = Infinity;
	for (const candidate of TEXT_STYLE_COLORS) {
		const [cr, cg, cb] = channels(candidate.hex);
		const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate.hex;
		}
	}
	return best;
}

/** The nearest size the catalogue actually offers — even px, 10 to 80. */
export function nearestHouseSize(px: number): number {
	const clamped = Math.min(MAX_TEXT_STYLE_SIZE, Math.max(MIN_TEXT_STYLE_SIZE, px));
	return Math.round(clamped / 2) * 2;
}

// ─── Runs → ProseMirror ──────────────────────────────────────────────────────

const TOKEN = /\[([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)\]/g;

function marksFor(run: DocxRun): RichTextNode['marks'] {
	const marks: NonNullable<RichTextNode['marks']> = [];
	if (run.bold) marks.push({ type: 'bold' });
	if (run.italic) marks.push({ type: 'italic' });
	if (run.underline) marks.push({ type: 'underline' });
	if (run.strike) marks.push({ type: 'strike' });

	const attrs: Record<string, string> = {};
	if (run.colorHex) attrs.color = nearestHouseColor(run.colorHex);
	if (run.sizePx) attrs.fontSize = `${nearestHouseSize(run.sizePx)}px`;
	if (Object.keys(attrs).length > 0) marks.push({ type: 'textStyle', attrs });

	if (run.href) marks.push({ type: 'link', attrs: { href: run.href } });
	return marks.length > 0 ? marks : undefined;
}

/**
 * A run's text, with `[Client.Company]`-style tokens lifted out into real
 * variable chips.
 *
 * PandaDoc's DOCX export writes its merge fields as their literal token text,
 * and this app's variable keys are the same shape — so the chips import rather
 * than arriving as dead text that looks right and resolves to nothing. A token
 * this app doesn't define is **left as text** and reported: inventing a
 * variable that no CRM field feeds would produce "[… not provided]" in a real
 * document, which is worse than plain text that reads correctly.
 */
function runToNodes(run: DocxRun, knownKeys: Set<string>, unmapped: Set<string>): RichTextNode[] {
	const marks = marksFor(run);
	const nodes: RichTextNode[] = [];
	let cursor = 0;

	TOKEN.lastIndex = 0;
	for (let match = TOKEN.exec(run.text); match !== null; match = TOKEN.exec(run.text)) {
		const key = match[1]!;
		if (!knownKeys.has(key)) {
			unmapped.add(key);
			continue;
		}
		if (match.index > cursor) nodes.push(text(run.text.slice(cursor, match.index), marks));
		// The chip carries no style of its own — it inherits the run's, which is
		// what "this word in this sentence" means.
		nodes.push({ type: 'variable', attrs: { key, fallback: null } });
		cursor = match.index + match[0].length;
	}
	if (cursor < run.text.length) nodes.push(text(run.text.slice(cursor), marks));
	return nodes;
}

function text(value: string, marks: RichTextNode['marks']): RichTextNode {
	return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraphNode(paragraph: DocxParagraph, knownKeys: Set<string>, unmapped: Set<string>): RichTextNode {
	const content = paragraph.runs.flatMap((run) => runToNodes(run, knownKeys, unmapped));
	return {
		type: 'paragraph',
		...(paragraph.align ? { attrs: { textAlign: paragraph.align } } : {}),
		...(content.length > 0 ? { content } : {}),
	};
}

/**
 * Paragraphs → a doc, grouping consecutive list items into one list node.
 *
 * Nesting level is deliberately flattened. This export's 67 list paragraphs are
 * bullets under headings, not outlines, and a faithful `w:ilvl` mapping means
 * reconstructing numbering.xml's level definitions for a shape the source
 * doesn't use.
 */
function paragraphsToDoc(paragraphs: DocxParagraph[], knownKeys: Set<string>, unmapped: Set<string>): RichTextDoc {
	const content: RichTextNode[] = [];
	let list: { ordered: boolean; items: RichTextNode[] } | null = null;

	const flushList = () => {
		if (!list) return;
		content.push({ type: list.ordered ? 'orderedList' : 'bulletList', content: list.items });
		list = null;
	};

	for (const paragraph of paragraphs) {
		const node = paragraphNode(paragraph, knownKeys, unmapped);
		if (!paragraph.list) {
			flushList();
			content.push(node);
			continue;
		}
		if (list && list.ordered !== paragraph.list.ordered) flushList();
		list ??= { ordered: paragraph.list.ordered, items: [] };
		list.items.push({ type: 'listItem', content: [node] });
	}
	flushList();

	// ProseMirror will not accept an empty doc.
	return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

// ─── Content → blocks ────────────────────────────────────────────────────────

function newBlock<T extends { type: string }>(block: T) {
	return { id: crypto.randomUUID(), locked: false, style: {}, ...block };
}

/**
 * A wrapper's absolute position → a `BlockPlacement`, clamped onto the paper.
 *
 * **No height.** `BlockPlacement.height` is optional precisely so a block can
 * size to its content, and it has to here: this app re-typesets everything in
 * Montserrat, so an imported paragraph rarely occupies the same number of lines
 * it did in PandaDoc's face. A pinned height would clip the overflow; an
 * unpinned one lets it grow, which is visible and editable.
 */
function placementFrom(position: DocxPosition, pageWidthPx: number, pageHeightPx: number): BlockPlacement {
	return clampPlacement({ x: position.xPx, y: position.yPx, width: position.widthPx }, pageWidthPx, pageHeightPx);
}

function cellFrom(cell: DocxCell, knownKeys: Set<string>, unmapped: Set<string>): TableCell {
	return {
		doc: paragraphsToDoc(cell.paragraphs, knownKeys, unmapped),
		colspan: cell.colspan,
		rowspan: 1,
		style: cell.backgroundColor ? { backgroundColor: cell.backgroundColor } : {},
	};
}

function blockFrom(
	content: DocxContent,
	images: Map<string, ImportedImage>,
	knownKeys: Set<string>,
	unmapped: Set<string>,
	page: { widthPx: number; heightPx: number }
): Block | null {
	const placement = content.position ? { placement: placementFrom(content.position, page.widthPx, page.heightPx) } : {};
	if (content.kind === 'text') {
		return newBlock({
			type: 'text' as const,
			doc: paragraphsToDoc(content.paragraphs, knownKeys, unmapped),
			// A layout wrapper's shading is the band of colour behind the text —
			// dropping it would lose most of what makes these pages look designed.
			style: content.backgroundColor ? { backgroundColor: content.backgroundColor } : {},
			...placement,
		});
	}

	if (content.kind === 'image') {
		const image = images.get(content.relationshipId);
		// An image whose upload failed is skipped rather than written as a block
		// pointing at nothing — a broken tile in the editor is worse than a gap
		// the summary already names.
		if (!image) return null;
		return newBlock({
			type: 'image' as const,
			assetId: image.assetId,
			url: image.url,
			// Left empty deliberately. The DOCX does carry `wp:docPr descr`, but
			// PandaDoc fills it with "Picture" and "Page background" — text that
			// would satisfy the validator's missing-alt check while telling a
			// screen reader nothing. An empty alt keeps the warning, which is the
			// author's cue to write a real one.
			alt: '',
			width: content.widthPx,
			height: content.heightPx,
			shape: 'rect' as const,
			...placement,
		});
	}

	const headerRow = content.rows[0]?.cells.some((cell) => cell.backgroundColor) ?? false;
	return newBlock({
		type: 'table' as const,
		rows: content.rows.map((row) => ({ cells: row.cells.map((cell) => cellFrom(cell, knownKeys, unmapped)) })),
		columnWidths: content.columnWidths,
		headerRow,
		...placement,
	});
}

/** 816×1056 is Letter at 96dpi; A4 is 794×1123. Anything else is treated as Letter, which is what this app draws by default. */
function pageSizeOf(widthPx: number): TemplateBody['settings']['pageSize'] {
	return Math.abs(widthPx - 794) < Math.abs(widthPx - 816) ? 'A4' : 'LETTER';
}

/**
 * Builds the imported body **onto** the template's existing one, keeping its
 * roles, variables and theme.
 *
 * The seeded `Contact (Signer)` / `Skyline Signer` pair and the theme are this
 * app's own defaults, not the DOCX's to overwrite — a `.docx` has no idea who
 * signs anything.
 */
export function docxToTemplateBody(parsed: ParsedDocx, images: Map<string, ImportedImage>, base: TemplateBody): DocxImportResult {
	const knownKeys = new Set(allVariables(base.variables).map((variable) => variable.key));
	const unmapped = new Set<string>();
	const counts = { pages: 0, textBlocks: 0, images: 0, tables: 0, backgrounds: 0 };
	const pageSize = pageSizeOf(parsed.pageWidthPx);
	const orientation = parsed.pageWidthPx > parsed.pageHeightPx ? 'landscape' : 'portrait';
	// The page this app will actually draw, which is what a placement is
	// measured against — not the DOCX's own numbers, which can be a rounding
	// apart from the canvas's.
	const { width: canvasWidth, height: canvasHeight } = pageDimensions(pageSize, orientation);
	const pageBox = { widthPx: canvasWidth, heightPx: canvasHeight };

	const pages: Page[] = parsed.pages.map((page, index): Page => {
		const blocks: Block[] = [];
		for (const content of page.content) {
			const block = blockFrom(content, images, knownKeys, unmapped, pageBox);
			if (!block) continue;
			blocks.push(block);
			if (content.kind === 'text') counts.textBlocks += 1;
			else if (content.kind === 'image') counts.images += 1;
			else counts.tables += 1;
		}

		const background = page.backgroundRelationshipId ? images.get(page.backgroundRelationshipId) : undefined;
		if (background) counts.backgrounds += 1;

		return {
			id: crypto.randomUUID(),
			name: `Page ${index + 1}`,
			order: index,
			blocks,
			...(background ? { background: { assetId: background.assetId, imageUrl: background.url } } : {}),
		};
	});
	counts.pages = pages.length;

	return {
		body: {
			...base,
			pages,
			settings: {
				...base.settings,
				pageSize,
				orientation,
				margins: parsed.margins,
				showPageNumbers: parsed.showPageNumbers,
			},
		},
		unmappedTokens: [...unmapped].sort(),
		counts,
	};
}

import type { Block, BlockId, RichTextDoc, RichTextNode, TableCell, TemplateBody } from '../types';

export interface HeadingEntry {
	/** Unique per occurrence — not a domain id, headings have none of their own (§2.1: derived, never stored). */
	id: string;
	/** The top-level block (a page's own `blocks` entry) that contains this heading, however deeply nested — what `blockPageNumbers` is keyed by, since pagination only ever assigns a page to a top-level block. */
	blockId: BlockId;
	/** 1–3, from the heading node's own `attrs.level`. */
	level: number;
	text: string;
}

/**
 * §4.5: "Headings feed the TOC." — walks every page's blocks (recursing into
 * `ColumnsBlock` columns and `TableBlock` cells, same convention
 * `collectAllFields` already established) looking for Tiptap `heading` nodes
 * in a text doc, filtered to `level <= maxLevel` (`TableOfContentsBlock.
 * levels`, §4.5's "heading depth to include, 1–3"). Order matches document
 * order — pages, then each page's blocks top to bottom, matching how a
 * reader encounters them.
 *
 * Headings are always direct children of a doc's top-level `content` array,
 * never nested inside a paragraph or another heading (ProseMirror's own
 * schema — both are block-level node types) — so this only inspects one
 * level of `doc.content`, unlike `collectAllFields`'s node-by-node recursion
 * for inline atoms that really can appear anywhere.
 */
export function collectHeadings(body: TemplateBody, maxLevel: number): HeadingEntry[] {
	const headings: HeadingEntry[] = [];
	for (const page of body.pages) {
		for (const block of page.blocks) collectHeadingsFromBlock(block, block.id, maxLevel, headings);
	}
	return headings;
}

function collectHeadingsFromBlock(block: Block, topLevelBlockId: BlockId, maxLevel: number, out: HeadingEntry[]): void {
	if (block.type === 'text') {
		collectHeadingsFromDoc(block.doc, topLevelBlockId, maxLevel, out);
		return;
	}
	if (block.type === 'table') {
		for (const row of block.rows) {
			for (const cell of row.cells) collectHeadingsFromCell(cell, topLevelBlockId, maxLevel, out);
		}
		return;
	}
	if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) collectHeadingsFromBlock(child, topLevelBlockId, maxLevel, out);
		}
		return;
	}
	if (block.type === 'smart_content') {
		for (const child of block.children) collectHeadingsFromBlock(child, topLevelBlockId, maxLevel, out);
	}
}

function collectHeadingsFromCell(cell: TableCell, topLevelBlockId: BlockId, maxLevel: number, out: HeadingEntry[]): void {
	collectHeadingsFromDoc(cell.doc, topLevelBlockId, maxLevel, out);
}

function collectHeadingsFromDoc(doc: RichTextDoc, topLevelBlockId: BlockId, maxLevel: number, out: HeadingEntry[]): void {
	for (const node of doc.content) {
		if (node.type !== 'heading') continue;
		const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
		if (level > maxLevel) continue;
		out.push({ id: `${topLevelBlockId}-${out.length}`, blockId: topLevelBlockId, level, text: extractText(node) });
	}
}

function extractText(node: RichTextNode): string {
	if (node.text) return node.text;
	if (!node.content) return '';
	return node.content.map(extractText).join('');
}

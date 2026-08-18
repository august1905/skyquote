import type { Block, FillableField, Page, RichTextDoc, RichTextNode, TableCell, TemplateBody } from '../types';

/**
 * Fields have no central registry (§6.2: "Fields live INLINE in rich text...
 * or as standalone blocks") — a field's full data lives wherever it was
 * placed: a `FieldBlock.field`, or a `fillableField` node's `attrs.field`
 * buried inside some text block's or table cell's `RichTextDoc`. Anything
 * that needs to reason about "every field in this template" (name
 * uniqueness, the validation surface, role-deletion reassignment) walks the
 * whole tree via this one function rather than re-deriving its own partial
 * version.
 */
export function collectAllFields(body: TemplateBody): FillableField[] {
	const fields: FillableField[] = [];
	for (const page of body.pages) collectFieldsFromPage(page, fields);
	return fields;
}

function collectFieldsFromPage(page: Page, out: FillableField[]): void {
	for (const block of page.blocks) collectFieldsFromBlock(block, out);
}

function collectFieldsFromBlock(block: Block, out: FillableField[]): void {
	if (block.type === 'field') {
		out.push(block.field);
		return;
	}
	if (block.type === 'text') {
		collectFieldsFromDoc(block.doc, out);
		return;
	}
	if (block.type === 'table') {
		for (const row of block.rows) {
			for (const cell of row.cells) collectFieldsFromCell(cell, out);
		}
		return;
	}
	if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) collectFieldsFromBlock(child, out);
		}
	}
}

function collectFieldsFromCell(cell: TableCell, out: FillableField[]): void {
	collectFieldsFromDoc(cell.doc, out);
}

function collectFieldsFromDoc(doc: RichTextDoc, out: FillableField[]): void {
	for (const node of doc.content) collectFieldsFromNode(node, out);
}

function collectFieldsFromNode(node: RichTextNode, out: FillableField[]): void {
	if (node.type === 'fillableField' && node.attrs?.field) {
		out.push(node.attrs.field as FillableField);
	}
	if (node.content) {
		for (const child of node.content) collectFieldsFromNode(child, out);
	}
}

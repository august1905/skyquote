import type { Block, RichTextDoc, RichTextNode, TemplateBody } from '../types';

/** Every distinct `[Key]`-shaped substring in a plain string (the template name) — a tiny token scan, not a doc tree. Same regex `computeValidationIssues.ts`'s own (unexported) copy uses. */
export function collectVariableKeysFromText(text: string, out: string[]): void {
	const pattern = /\[([^[\]]+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text))) out.push(match[1]!);
}

function collectVariableKeysFromDoc(doc: RichTextDoc, out: string[]): void {
	for (const node of doc.content) collectVariableKeysFromNode(node, out);
}

function collectVariableKeysFromNode(node: RichTextNode, out: string[]): void {
	if (node.type === 'variable' && typeof node.attrs?.key === 'string') out.push(node.attrs.key);
	if (node.content) for (const child of node.content) collectVariableKeysFromNode(child, out);
}

function collectFromBlock(block: Block, out: string[]): void {
	if (block.type === 'text') {
		collectVariableKeysFromDoc(block.doc, out);
	} else if (block.type === 'table') {
		for (const row of block.rows) for (const cell of row.cells) collectVariableKeysFromDoc(cell.doc, out);
	} else if (block.type === 'columns') {
		for (const column of block.columns) for (const child of column) collectFromBlock(child, out);
	}
}

/**
 * Every distinct variable key actually referenced anywhere in the
 * template — inline `variable` chips (recursing into `ColumnsBlock` columns
 * and `TableBlock` cells, same location set `computeValidationIssues.ts`'s
 * own walker covers) plus the template name's own `[Key]` tokens.
 * Deduplicated, in first-seen order.
 */
export function collectVariableKeys(body: TemplateBody, templateName: string): string[] {
	const raw: string[] = [];
	for (const page of body.pages) {
		for (const block of page.blocks) collectFromBlock(block, raw);
	}
	collectVariableKeysFromText(templateName, raw);
	return [...new Set(raw)];
}

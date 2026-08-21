import type { Block, ImageBlock, RichTextDoc, RichTextNode, TemplateBody } from '../types';
import { collectAllFields } from '../fields/collectFields';
import { allVariables } from '../variables/systemVariables';

export interface ValidationIssue {
	/** Stable across recomputation for the same underlying problem — used as the list's React key, nothing else. */
	id: string;
	message: string;
	severity: 'error' | 'warning';
}

function collectVariableKeysFromDoc(doc: RichTextDoc, out: string[]): void {
	for (const node of doc.content) collectVariableKeysFromNode(node, out);
}

function collectVariableKeysFromNode(node: RichTextNode, out: string[]): void {
	if (node.type === 'variable' && typeof node.attrs?.key === 'string') out.push(node.attrs.key);
	if (node.content) for (const child of node.content) collectVariableKeysFromNode(child, out);
}

function collectFromBlock(block: Block, variableKeys: string[], images: ImageBlock[]): void {
	if (block.type === 'text') {
		collectVariableKeysFromDoc(block.doc, variableKeys);
	} else if (block.type === 'image') {
		images.push(block);
	} else if (block.type === 'table') {
		for (const row of block.rows) {
			for (const cell of row.cells) collectVariableKeysFromDoc(cell.doc, variableKeys);
		}
	} else if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) collectFromBlock(child, variableKeys, images);
		}
	} else if (block.type === 'smart_content') {
		// Same reasoning as collectVariableKeys.ts: a rule can gate on a
		// variable that's never inserted as an inline chip anywhere.
		for (const rule of block.rules) {
			if (rule.subject.kind === 'variable') variableKeys.push(rule.subject.ref);
		}
		for (const child of block.children) collectFromBlock(child, variableKeys, images);
	}
}

/** Every `[Key]`-shaped substring in the template name (§3's header bar) — its own tiny token scan, not a doc tree. */
function collectVariableKeysFromTemplateName(name: string, out: string[]): void {
	const pattern = /\[([^[\]]+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(name))) out.push(match[1]!);
}

/**
 * §9.4's persistent validation surface. Only the checks that have something
 * real to check against are implemented — `empty required pricing tables`
 * and `smart-content rules referencing deleted variables/fields` aren't
 * checked yet; the former still has no real requirement to violate (no
 * "required pricing table" concept exists), and the latter is a real gap
 * worth adding if stale rule references turn out to be common in practice.
 */
export function computeValidationIssues(body: TemplateBody, templateName: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const fields = collectAllFields(body);

	// "Fields with no role" — structurally prevented everywhere a field can
	// be created or a role deleted (§6.1 rule 1/4), so this should always be
	// empty in practice. Checked anyway: it's cheap, and it's exactly what
	// the spec asks the indicator to surface if that invariant is ever
	// violated by a future bug.
	for (const field of fields) {
		if (!field.roleId) {
			issues.push({ id: `field-no-role-${field.id}`, message: `"${field.name}" has no role assigned.`, severity: 'error' });
		}
	}

	// Duplicate field names (§6.1 rule 2 — names are the merge key, must be unique).
	const fieldsByName = new Map<string, number>();
	for (const field of fields) fieldsByName.set(field.name, (fieldsByName.get(field.name) ?? 0) + 1);
	for (const [name, count] of fieldsByName) {
		if (count > 1) {
			issues.push({ id: `dup-field-name-${name}`, message: `${count} fields are named "${name}" — field names must be unique.`, severity: 'error' });
		}
	}

	// One pass collecting both remaining checks' raw material.
	const variableKeys: string[] = [];
	const images: ImageBlock[] = [];
	for (const page of body.pages) {
		for (const block of page.blocks) collectFromBlock(block, variableKeys, images);
	}
	collectVariableKeysFromTemplateName(templateName, variableKeys);

	// Unresolved variables with no default — every distinct variable key
	// actually referenced (inline chips + the template name), checked
	// against whether it resolves to a known variable with a default value.
	const known = new Map(allVariables(body.variables).map((v) => [v.key, v]));
	const seenKeys = new Set<string>();
	for (const key of variableKeys) {
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		const def = known.get(key);
		if (!def || !def.defaultValue) {
			issues.push({ id: `unresolved-variable-${key}`, message: `Variable "${key}" has no default value set.`, severity: 'warning' });
		}
	}

	// Images missing alt text.
	for (const image of images) {
		if (!image.alt.trim()) {
			issues.push({ id: `image-no-alt-${image.id}`, message: 'An image is missing alt text.', severity: 'warning' });
		}
	}

	return issues;
}

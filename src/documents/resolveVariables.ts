import type { Block, RichTextDoc, RichTextNode, TemplateBody, VariableDef } from '../editor/types';
import { allVariables } from '../editor/variables/systemVariables';
import { collectVariableKeys } from '../editor/variables/collectVariableKeys';
import type { DocumentTotals } from '../pricing/computeTotals';
import { formatMoney } from '../pricing/formatMoney';

/** Every variable key the template actually uses, resolved to its final literal string. */
export type ResolvedVariableValues = Record<string, string>;

function resolveComputedVariable(key: string, def: VariableDef, totals: DocumentTotals, now: Date): string {
	if (key === 'Document.Total') return formatMoney(totals.total, totals.currency);
	// `timeZone: 'UTC'` makes this deterministic regardless of the browser's
	// own timezone — otherwise a document created near midnight could show a
	// different calendar date than intended depending on where it's viewed.
	if (key === 'Document.Date') return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
	// No other `source: 'computed'` key exists yet (systemVariables.ts's own
	// list is exhaustive today) — falls back to the same "default, or a
	// visible placeholder" rule an ordinary unresolved variable gets, rather
	// than silently rendering empty if one is ever added without updating
	// this switch.
	return def.defaultValue || `[${def.label} not provided]`;
}

/**
 * §11 step 3 + §11.1: "unresolved variables render as their `defaultValue`,
 * or as a visible placeholder if none — never as an empty string". Priority
 * per key: `source: 'computed'` variables are resolved programmatically
 * (never asked of the wizard's admin — there's no form field for
 * `Document.Total`/`Document.Date`); everything else prefers what the
 * wizard's "fill variables" step was actually typed, then the variable's own
 * `defaultValue`, then the placeholder.
 */
export function computeResolvedVariableValues(params: {
	body: TemplateBody;
	templateName: string;
	wizardValues: Record<string, string>;
	totals: DocumentTotals;
	now: Date;
}): ResolvedVariableValues {
	const keys = collectVariableKeys(params.body, params.templateName);
	const known = new Map(allVariables(params.body.variables).map((v) => [v.key, v] as const));
	const result: ResolvedVariableValues = {};

	for (const key of keys) {
		const def = known.get(key);
		if (def?.source === 'computed') {
			result[key] = resolveComputedVariable(key, def, params.totals, params.now);
			continue;
		}
		const typed = params.wizardValues[key]?.trim();
		if (typed) {
			result[key] = typed;
			continue;
		}
		if (def?.defaultValue) {
			result[key] = def.defaultValue;
			continue;
		}
		result[key] = `[${def?.label ?? key} not provided]`;
	}

	return result;
}

/** Substitutes every `[Key]` token in a plain string (the template name → the document's title) — an unknown key is left as its literal `[Key]` text rather than silently dropped. */
export function resolveTitle(name: string, values: ResolvedVariableValues): string {
	return name.replace(/\[([^[\]]+)\]/g, (whole, key: string) => values[key] ?? whole);
}

function resolveNode(node: RichTextNode, values: ResolvedVariableValues): RichTextNode {
	if (node.type === 'variable' && typeof node.attrs?.key === 'string') {
		const key = node.attrs.key;
		// A ProseMirror text node can't hold an empty string — `values` should
		// always carry a non-empty placeholder for every key (see
		// computeResolvedVariableValues), this is just a defensive backstop.
		return { type: 'text', text: values[key] || ' ' };
	}
	if (node.content) return { ...node, content: node.content.map((child) => resolveNode(child, values)) };
	return node;
}

function resolveDoc(doc: RichTextDoc, values: ResolvedVariableValues): RichTextDoc {
	return { ...doc, content: doc.content.map((node) => resolveNode(node, values)) };
}

/**
 * §11.1's "freeze": every `variable` node throughout the template — inline
 * chips, recursing into `ColumnsBlock` columns and `TableBlock` cells, same
 * location set `collectVariableKeys` covers — becomes a plain literal text
 * node. `FillableField`s are untouched: "fields remain unfilled; they become
 * interactive in the recipient signing view" (§11.1), not resolved here.
 */
export function resolveVariablesInBody(body: TemplateBody, values: ResolvedVariableValues): TemplateBody {
	return { ...body, pages: body.pages.map((page) => ({ ...page, blocks: page.blocks.map((block) => resolveBlockVariables(block, values)) })) };
}

function resolveBlockVariables(block: Block, values: ResolvedVariableValues): Block {
	if (block.type === 'text') return { ...block, doc: resolveDoc(block.doc, values) };
	if (block.type === 'table') {
		return { ...block, rows: block.rows.map((row) => ({ cells: row.cells.map((cell) => ({ ...cell, doc: resolveDoc(cell.doc, values) })) })) };
	}
	if (block.type === 'columns') {
		return { ...block, columns: block.columns.map((column) => column.map((child) => resolveBlockVariables(child, values))) };
	}
	return block;
}

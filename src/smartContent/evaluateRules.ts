/**
 * §4.5/§4.2's `SmartContentBlock` rule evaluation. Pure — no editor store, no
 * document-fetching — so the same function drives both the editor's
 * author-mode "preview as if true/false" toggle (a manual override, not a
 * real evaluation) and the real evaluation in the recipient-facing
 * `DocumentBlockView`.
 *
 * A `variable`-kind rule can only be checked where a resolved variable value
 * is actually available. Variables are frozen to literal text once, at
 * document-creation time (`resolveVariables.ts`) — the *values* used for that
 * freeze have to be threaded into this context too (`DocumentBody.
 * resolvedVariableValues`), since nothing else after that point can
 * reconstruct them. `field`/`pricing_total` rules, by contrast, are
 * evaluated fresh every render — a recipient's field entries and (once
 * recipient-editable pricing exists) a pricing table's live total can both
 * still change after the document is created.
 */
import type { BlockId, ConditionRule, Money, SmartContentBlock } from '../editor/types';
import type { FieldValue } from '../editor/fields/FieldPreview';

export interface SmartContentContext {
	resolvedVariables: Record<string, string>;
	fieldValues: Record<string, FieldValue>;
	/** Keyed by the pricing_table/quote_builder block's own id (`ConditionRule.subject.ref`) — see `computeTotals.ts`'s `BlockTotals.blockId`. */
	pricingTotals: Record<BlockId, Money>;
}

export const EMPTY_SMART_CONTENT_CONTEXT: SmartContentContext = { resolvedVariables: {}, fieldValues: {}, pricingTotals: {} };

function isEmptyValue(value: string | number | boolean | undefined): boolean {
	return value === undefined || value === '';
}

function resolveSubjectValue(rule: ConditionRule, ctx: SmartContentContext): string | number | boolean | undefined {
	switch (rule.subject.kind) {
		case 'variable':
			return ctx.resolvedVariables[rule.subject.ref];
		case 'field':
			return ctx.fieldValues[rule.subject.ref];
		case 'pricing_total':
			return ctx.pricingTotals[rule.subject.ref];
	}
}

/** `rule.value` as a plain string for string-shaped comparisons — `null` (the "no value entered yet" state for `is_empty`/`is_not_empty`) reads as `''`, never the literal text `"null"`. */
function ruleValueAsString(rule: ConditionRule): string {
	return rule.value === null ? '' : String(rule.value);
}

export function evaluateRule(rule: ConditionRule, ctx: SmartContentContext): boolean {
	const actual = resolveSubjectValue(rule, ctx);
	switch (rule.operator) {
		case 'is_empty':
			return isEmptyValue(actual);
		case 'is_not_empty':
			return !isEmptyValue(actual);
		case 'contains':
			return !isEmptyValue(actual) && String(actual).toLowerCase().includes(ruleValueAsString(rule).toLowerCase());
		case 'gt':
		case 'lt': {
			const a = Number(actual);
			const b = Number(rule.value);
			if (Number.isNaN(a) || Number.isNaN(b)) return false;
			return rule.operator === 'gt' ? a > b : a < b;
		}
		case 'eq':
		case 'neq': {
			const matches = String(actual ?? '') === ruleValueAsString(rule);
			return rule.operator === 'eq' ? matches : !matches;
		}
	}
}

/** No rules configured yet reads as "always visible" — nothing to gate on, and a freshly-inserted-but-not-yet-configured smart content block hiding its own contents by default would look like a bug, not a deliberate empty filter. */
export function evaluateSmartContent(block: SmartContentBlock, ctx: SmartContentContext): boolean {
	if (block.rules.length === 0) return true;
	const results = block.rules.map((rule) => evaluateRule(rule, ctx));
	return block.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

import { describe, expect, it } from 'vitest';
import type { ConditionRule, SmartContentBlock } from '../editor/types';
import { money } from '../editor/types';
import { evaluateRule, evaluateSmartContent, type SmartContentContext } from './evaluateRules';

function makeBlock(rules: ConditionRule[], match: 'all' | 'any' = 'all'): SmartContentBlock {
	return { id: 'smart-1', type: 'smart_content', locked: false, style: {}, name: 'Smart content', rules, match, children: [] };
}

const ctx: SmartContentContext = {
	resolvedVariables: { 'Client.Company': 'Acme Co', 'Client.Empty': '' },
	fieldValues: { 'field-1': 'yes', 'field-checkbox': true },
	pricingTotals: { 'pricing-1': money(15000) },
};

describe('evaluateRule', () => {
	it('eq matches a resolved variable against a literal string', () => {
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Acme Co' }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Other Co' }, ctx)).toBe(false);
	});

	it('neq is the exact negation of eq', () => {
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'neq', value: 'Other Co' }, ctx)).toBe(true);
	});

	it('gt/lt compare a pricing total numerically', () => {
		expect(evaluateRule({ subject: { kind: 'pricing_total', ref: 'pricing-1' }, operator: 'gt', value: 10000 }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'pricing_total', ref: 'pricing-1' }, operator: 'lt', value: 10000 }, ctx)).toBe(false);
	});

	it('gt/lt against a non-numeric actual value is false rather than throwing', () => {
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'gt', value: 5 }, ctx)).toBe(false);
	});

	it('contains is case-insensitive and checks the actual value, not the rule value', () => {
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'contains', value: 'acme' }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'contains', value: 'zzz' }, ctx)).toBe(false);
	});

	it('is_empty/is_not_empty treat an unresolved ref and an empty string the same way', () => {
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Empty' }, operator: 'is_empty', value: null }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Unknown' }, operator: 'is_empty', value: null }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'is_not_empty', value: null }, ctx)).toBe(true);
	});

	it('reads a field value, including a boolean checkbox value', () => {
		expect(evaluateRule({ subject: { kind: 'field', ref: 'field-1' }, operator: 'eq', value: 'yes' }, ctx)).toBe(true);
		expect(evaluateRule({ subject: { kind: 'field', ref: 'field-checkbox' }, operator: 'eq', value: 'true' }, ctx)).toBe(true);
	});
});

describe('evaluateSmartContent', () => {
	it('is always visible when there are no rules — nothing to gate on', () => {
		expect(evaluateSmartContent(makeBlock([]), ctx)).toBe(true);
	});

	it('match "all" requires every rule to pass', () => {
		const passing: ConditionRule = { subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Acme Co' };
		const failing: ConditionRule = { subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Nope' };
		expect(evaluateSmartContent(makeBlock([passing, passing], 'all'), ctx)).toBe(true);
		expect(evaluateSmartContent(makeBlock([passing, failing], 'all'), ctx)).toBe(false);
	});

	it('match "any" requires only one rule to pass', () => {
		const passing: ConditionRule = { subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Acme Co' };
		const failing: ConditionRule = { subject: { kind: 'variable', ref: 'Client.Company' }, operator: 'eq', value: 'Nope' };
		expect(evaluateSmartContent(makeBlock([passing, failing], 'any'), ctx)).toBe(true);
		expect(evaluateSmartContent(makeBlock([failing, failing], 'any'), ctx)).toBe(false);
	});
});

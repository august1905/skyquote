import { describe, expect, it } from 'vitest';
import { money } from '../editor/types';
import { formatMoney, parseMoneyInput } from './formatMoney';

/**
 * Written to replace an e2e test ("the currency input changes how every total is
 * formatted") that spent a template creation, an editor load and several
 * autosaves to prove what these twelve assertions prove for free. The wiring —
 * that the block's currency input reaches `formatMoney` at all — is still
 * covered by the pricing spec's main test; only the formatting rules moved here.
 */
describe('formatMoney', () => {
	it('renders cents as a currency amount, with thousands separators', () => {
		expect(formatMoney(money(150000), 'USD')).toBe('$1,500.00');
		expect(formatMoney(money(123456789), 'USD')).toBe('$1,234,567.89');
	});

	it('formats a different currency with its own symbol', () => {
		expect(formatMoney(money(2500), 'EUR')).toBe('€25.00');
		expect(formatMoney(money(2500), 'GBP')).toBe('£25.00');
	});

	it('keeps two decimal places for a whole amount', () => {
		expect(formatMoney(money(1000), 'USD')).toBe('$10.00');
	});

	it('renders zero rather than an empty string', () => {
		expect(formatMoney(money(0), 'USD')).toBe('$0.00');
	});

	it('renders a negative amount (a discount line) as negative', () => {
		expect(formatMoney(money(-2500), 'USD')).toBe('-$25.00');
	});

	it('falls back to a plain number + code for an unrecognized currency instead of throwing', () => {
		// Reachable in normal use: the pricing block's currency field is a free
		// text input, so every partial value typed into it lands here.
		expect(formatMoney(money(2500), 'XX')).toBe('25.00 XX');
	});

	it('falls back for a half-typed currency code', () => {
		expect(formatMoney(money(2500), 'U')).toBe('25.00 U');
	});
});

describe('parseMoneyInput', () => {
	it('converts major units to minor units', () => {
		expect(parseMoneyInput('12.5')).toBe(1250);
	});

	it('rounds to the nearest cent rather than truncating', () => {
		expect(parseMoneyInput('0.005')).toBe(1);
		expect(parseMoneyInput('10.994')).toBe(1099);
	});

	it('handles a whole number', () => {
		expect(parseMoneyInput('42')).toBe(4200);
	});

	it('returns null for input that is not a number, so a caller can ignore the keystroke', () => {
		expect(parseMoneyInput('abc')).toBeNull();
		expect(parseMoneyInput('')).toBe(0); // Number('') is 0 — empty means zero, not invalid.
	});

	it('returns null for Infinity rather than writing it into a Money field', () => {
		expect(parseMoneyInput('Infinity')).toBeNull();
	});
});

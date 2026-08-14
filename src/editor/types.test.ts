import { describe, expect, it } from 'vitest';
import { money, ZERO_MONEY } from './types';

describe('money', () => {
	it('accepts integer minor units', () => {
		expect(money(500)).toBe(500);
		expect(money(0)).toBe(ZERO_MONEY);
	});

	it('rejects non-integer values — §7.3: money is integer minor units, never a float', () => {
		expect(() => money(5.5)).toThrow(/integer minor units/);
	});

	it('rejects NaN', () => {
		expect(() => money(NaN)).toThrow(/integer minor units/);
	});
});

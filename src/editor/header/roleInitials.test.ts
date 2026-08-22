import { describe, expect, it } from 'vitest';
import { roleInitials } from './roleInitials';

describe('roleInitials', () => {
	it('takes one letter from each of the first two words', () => {
		expect(roleInitials('Casey Client')).toBe('CC');
		expect(roleInitials('Sales Rep')).toBe('SR');
	});

	it('takes two letters from a single-word role, so the chip reads as a chip and not a dot', () => {
		expect(roleInitials('Client')).toBe('CL');
		expect(roleInitials('Seller')).toBe('SE');
	});

	it('ignores extra words beyond the first two', () => {
		expect(roleInitials('Head Of Procurement')).toBe('HO');
	});

	it('collapses stray whitespace rather than treating it as a word', () => {
		expect(roleInitials('  Casey   Client  ')).toBe('CC');
	});

	it('uppercases whatever it was given', () => {
		expect(roleInitials('client contact')).toBe('CC');
	});

	it('falls back rather than throwing on a nameless role', () => {
		// A role with an empty name is reachable: the Roles panel lets you clear
		// the field while typing, and the stack still has to render something.
		expect(roleInitials('')).toBe('??');
		expect(roleInitials('   ')).toBe('??');
	});

	it('handles a single-character name without padding it out of nothing', () => {
		expect(roleInitials('X')).toBe('X');
	});
});

import { describe, expect, it } from 'vitest';
import { dealVariableValues } from './dealVariableValues';
import type { CrmDeal } from '../../api/zohoCrm';

function deal(overrides: Partial<CrmDeal> = {}): CrmDeal {
	return {
		id: '1000000123456',
		name: 'Riverside Office — Nightly Clean',
		amount: 4500.5,
		currency: null,
		stage: 'Proposal/Price Quote',
		closingDate: '2026-09-30',
		accountName: 'Riverside Property Group',
		contactName: 'Dana Whitfield',
		modifiedAt: '2026-08-20T14:03:11-05:00',
		accountId: '1000000222222',
		contactId: '1000000333333',
		ownerName: 'Grayson Wiesner',
		contact: { id: '1000000333333', name: 'Dana Whitfield', email: 'dana@riversidepg.com', phone: '555-0134' },
		...overrides,
	};
}

describe('dealVariableValues', () => {
	it('maps a complete deal onto every client and deal variable', () => {
		expect(dealVariableValues(deal(), 'USD')).toEqual({
			'Client.Name': 'Dana Whitfield',
			'Client.Company': 'Riverside Property Group',
			'Client.Email': 'dana@riversidepg.com',
			'Deal.Name': 'Riverside Office — Nightly Clean',
			'Deal.Amount': '$4,500.50',
			'Deal.Stage': 'Proposal/Price Quote',
			'Deal.CloseDate': 'September 30, 2026',
			'Deal.Owner': 'Grayson Wiesner',
		});
	});

	it('omits keys the CRM has no value for rather than setting them blank', () => {
		const values = dealVariableValues(
			deal({ amount: null, stage: null, closingDate: null, accountName: null, ownerName: null, contact: null, contactName: null }),
			'USD'
		);
		expect(values).toEqual({ 'Deal.Name': 'Riverside Office — Nightly Clean' });
		// Absent, not empty — an empty string reads as "cleared on purpose" and
		// would suppress the variable's own default value downstream.
		expect('Client.Email' in values).toBe(false);
	});

	it('prefers the contact record name over the name cached on the deal lookup', () => {
		const values = dealVariableValues(deal({ contactName: 'Dana Whitfield', contact: { id: '1', name: 'Dana Whitfield-Cole', email: null, phone: null } }), 'USD');
		expect(values['Client.Name']).toBe('Dana Whitfield-Cole');
	});

	it('falls back to the deal lookup name when the contact record could not be read', () => {
		expect(dealVariableValues(deal({ contact: null }), 'USD')['Client.Name']).toBe('Dana Whitfield');
	});

	it('rounds the amount to whole cents at the boundary', () => {
		expect(dealVariableValues(deal({ amount: 1234.567 }), 'USD')['Deal.Amount']).toBe('$1,234.57');
	});

	it("uses the deal's own currency when the CRM org has multi-currency on", () => {
		expect(dealVariableValues(deal({ amount: 100, currency: 'EUR' }), 'USD')['Deal.Amount']).toBe('€100.00');
	});

	it('renders the close date in UTC, so it never shows the day before the CRM does', () => {
		// Parsed as local time, 2026-01-01 renders as December 31 anywhere west of
		// Greenwich — including every US timezone this app is used in.
		expect(dealVariableValues(deal({ closingDate: '2026-01-01' }), 'USD')['Deal.CloseDate']).toBe('January 1, 2026');
	});

	it('drops an unparseable close date instead of rendering "Invalid Date"', () => {
		expect('Deal.CloseDate' in dealVariableValues(deal({ closingDate: 'not-a-date' }), 'USD')).toBe(false);
	});
});

// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipientDraft } from './types';

/**
 * What must never regress here: **a sender role is bound to a real app user,
 * not a typed email.** The customer row keeps free-text (prefilled from the
 * CRM deal); the sender row is a dropdown of active accounts, defaulting to
 * whoever is creating the document — a misspelled teammate email would
 * quietly send the countersignature link into the void.
 */

const listAppUsers = vi.hoisted(() => vi.fn());
vi.mock('../../api/users', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../api/users')>()),
	listAppUsers,
}));

const useAuth = vi.hoisted(() => vi.fn());
vi.mock('../../auth/AuthContext', () => ({ useAuth }));

const { RecipientsStep } = await import('./RecipientsStep');

const USERS = [
	{ id: 'u1', firstName: 'Grayson', lastName: 'Wiesner', email: 'grayson@skylineclean.com' },
	{ id: 'u2', firstName: 'Mariah', lastName: 'LaRonge', email: 'mariah@skylineclean.com' },
];

function drafts(): RecipientDraft[] {
	return [
		{ roleId: 'role-client', roleName: 'Client', name: '', email: '', signingOrder: '', isSender: false },
		{ roleId: 'role-sender', roleName: 'Countersigner', name: '', email: '', signingOrder: '', isSender: true },
	];
}

/**
 * Renders the step the way the wizard does — over real state — so an updater
 * actually lands. A `vi.fn()` `onChange` can only show what a handler *asked*
 * for, which is exactly the distinction the prefill/typing race turned on.
 */
function renderStateful(initial: RecipientDraft[] = drafts()) {
	const seen: RecipientDraft[][] = [];
	function Harness() {
		const [recipients, setRecipients] = useState(initial);
		seen.push(recipients);
		return <RecipientsStep recipients={recipients} onChange={setRecipients} />;
	}
	render(<Harness />);
	return { current: () => seen[seen.length - 1]! };
}

beforeEach(() => {
	listAppUsers.mockResolvedValue({ users: USERS });
	useAuth.mockReturnValue({
		status: 'authenticated',
		user: { id: 'u1', email: 'grayson@skylineclean.com', first_name: 'Grayson', last_name: 'Wiesner', role: 'admin' },
		refresh: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('RecipientsStep', () => {
	it('gives the sender role a user dropdown and the customer role free-text inputs', async () => {
		render(<RecipientsStep recipients={drafts()} onChange={vi.fn()} />);
		expect(screen.getByLabelText('Client name')).toBeTruthy();
		expect(screen.getByLabelText('Client email')).toBeTruthy();
		expect(screen.getByLabelText('Countersigner user')).toBeTruthy();
		expect(screen.queryByLabelText('Countersigner email')).toBeNull();
		await waitFor(() => expect(listAppUsers).toHaveBeenCalled());
	});

	it('defaults an empty sender row to whoever is creating the document', () => {
		const { current } = renderStateful();
		expect(current()[1]).toMatchObject({ name: 'Grayson Wiesner', email: 'grayson@skylineclean.com' });
		// The customer row is not touched by the default.
		expect(current()[0]).toMatchObject({ name: '', email: '' });
	});

	it('writes updaters, so a prefill and a keystroke raised from the same snapshot both survive', () => {
		// The regression this guards: both writes used to be built from an array
		// captured at render time, so whichever landed second silently discarded
		// the other — in practice the countersigner's row, which left the
		// wizard's Next disabled with nothing on screen explaining why.
		//
		// Asserted at the seam rather than by racing the two in jsdom: React's
		// test renderer flushes effects before any event can interleave, so the
		// real ordering can't be reproduced here (the e2e wizard walk does hit
		// it). What *is* checkable is the property that makes the race
		// impossible — every write is a function of current state, so replaying
		// them against one base still merges.
		const onChange = vi.fn();
		render(<RecipientsStep recipients={drafts()} onChange={onChange} />);
		fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Casey Client' } });

		expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
		const merged = onChange.mock.calls.reduce((acc: RecipientDraft[], [write]) => {
			expect(typeof write).toBe('function');
			return (write as (current: RecipientDraft[]) => RecipientDraft[])(acc);
		}, drafts());
		expect(merged[0]).toMatchObject({ name: 'Casey Client' });
		expect(merged[1]).toMatchObject({ name: 'Grayson Wiesner', email: 'grayson@skylineclean.com' });
	});

	it('binds the chosen user into the draft on selection', async () => {
		// Already-assigned sender, so the current-user default effect stays quiet
		// and the only change comes from the pick itself.
		const assigned = drafts().map((d) => (d.isSender ? { ...d, name: 'Grayson Wiesner', email: 'grayson@skylineclean.com' } : d));
		const { current } = renderStateful(assigned);
		const select = screen.getByLabelText<HTMLSelectElement>('Countersigner user');
		await waitFor(() => expect(select.disabled).toBe(false));
		fireEvent.change(select, { target: { value: 'u2' } });
		expect(current()[1]).toMatchObject({ name: 'Mariah LaRonge', email: 'mariah@skylineclean.com' });
	});

	it('falls back to free-text inputs when the user list cannot load', async () => {
		listAppUsers.mockRejectedValue(new Error('down'));
		render(<RecipientsStep recipients={drafts()} onChange={vi.fn()} />);
		await waitFor(() => expect(screen.getByLabelText('Countersigner email')).toBeTruthy());
		expect(screen.queryByLabelText('Countersigner user')).toBeNull();
	});
});

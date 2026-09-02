// @vitest-environment jsdom
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
		const onChange = vi.fn();
		render(<RecipientsStep recipients={drafts()} onChange={onChange} />);
		const updated = onChange.mock.calls[0]?.[0] as RecipientDraft[];
		expect(updated[1]).toMatchObject({ name: 'Grayson Wiesner', email: 'grayson@skylineclean.com' });
		// The customer row is not touched by the default.
		expect(updated[0]).toMatchObject({ name: '', email: '' });
	});

	it('binds the chosen user into the draft on selection', async () => {
		const onChange = vi.fn();
		// Already-assigned sender, so the current-user default effect stays quiet
		// and the only onChange comes from the pick itself.
		const assigned = drafts().map((d) => (d.isSender ? { ...d, name: 'Grayson Wiesner', email: 'grayson@skylineclean.com' } : d));
		render(<RecipientsStep recipients={assigned} onChange={onChange} />);
		const select = screen.getByLabelText<HTMLSelectElement>('Countersigner user');
		await waitFor(() => expect(select.disabled).toBe(false));
		fireEvent.change(select, { target: { value: 'u2' } });
		const updated = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as RecipientDraft[];
		expect(updated[1]).toMatchObject({ name: 'Mariah LaRonge', email: 'mariah@skylineclean.com' });
	});

	it('falls back to free-text inputs when the user list cannot load', async () => {
		listAppUsers.mockRejectedValue(new Error('down'));
		render(<RecipientsStep recipients={drafts()} onChange={vi.fn()} />);
		await waitFor(() => expect(screen.getByLabelText('Countersigner email')).toBeTruthy());
		expect(screen.queryByLabelText('Countersigner user')).toBeNull();
	});
});

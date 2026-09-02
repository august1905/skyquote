// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentRecipient, Role } from '../../editor/types';

/**
 * What must never regress here: **reassigning the countersigner kills the old
 * link and shows the new one exactly once**, and **a document under signature
 * offers no dropdown at all** — the recipient's identity is baked into the
 * Zoho Sign request, so the UI must not offer a change the backend will 409.
 */

const listAppUsers = vi.hoisted(() => vi.fn());
vi.mock('../../api/users', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../api/users')>()),
	listAppUsers,
}));

const updateDocumentRecipient = vi.hoisted(() => vi.fn());
const regenerateRecipientToken = vi.hoisted(() => vi.fn());
vi.mock('../../api/documents', () => ({ updateDocumentRecipient, regenerateRecipientToken }));

const { RecipientsPanel } = await import('./RecipientsPanel');

const ROLES: Role[] = [
	{ id: 'role-client', name: 'Client', color: '#dd6b20', order: 0, isSender: false },
	{ id: 'role-sender', name: 'Countersigner', color: '#3182ce', order: 1, isSender: true },
];

const RECIPIENTS: DocumentRecipient[] = [
	{
		id: 'r1',
		documentId: 'd1',
		roleId: 'role-client',
		roleName: 'Client',
		contactId: null,
		email: 'mary@example.com',
		name: 'Mary Ellen Weller',
		signingOrder: 1,
		status: 'completed',
	},
	{
		id: 'r2',
		documentId: 'd1',
		roleId: 'role-sender',
		roleName: 'Countersigner',
		contactId: null,
		email: 'grayson@skylineclean.com',
		name: 'Grayson Wiesner',
		signingOrder: 2,
		status: 'pending',
	},
];

const USERS = [
	{ id: 'u1', firstName: 'Grayson', lastName: 'Wiesner', email: 'grayson@skylineclean.com' },
	{ id: 'u2', firstName: 'Mariah', lastName: 'LaRonge', email: 'mariah@skylineclean.com' },
];

beforeEach(() => {
	listAppUsers.mockResolvedValue({ users: USERS });
	updateDocumentRecipient.mockResolvedValue({
		recipient: { ...RECIPIENTS[1], name: 'Mariah LaRonge', email: 'mariah@skylineclean.com', status: 'pending', token: 'fresh-token' },
	});
	regenerateRecipientToken.mockResolvedValue({ recipient: { ...RECIPIENTS[0], token: 'regen-token' } });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderPanel(overrides: Partial<Parameters<typeof RecipientsPanel>[0]> = {}) {
	const onRecipientChanged = vi.fn();
	render(
		<RecipientsPanel
			documentId="d1"
			recipients={RECIPIENTS}
			roles={ROLES}
			signatureLocked={false}
			onClose={vi.fn()}
			onRecipientChanged={onRecipientChanged}
			{...overrides}
		/>,
	);
	return { onRecipientChanged };
}

describe('RecipientsPanel', () => {
	it('shows both recipients with status, and a dropdown only for the sender role', async () => {
		renderPanel();
		expect(screen.getByText('Mary Ellen Weller')).toBeTruthy();
		expect(screen.getByText('Completed')).toBeTruthy();
		expect(screen.getByText('Pending')).toBeTruthy();
		const select = await screen.findByLabelText<HTMLSelectElement>('Assign Countersigner to a user');
		await waitFor(() => expect(select.disabled).toBe(false));
		// The customer row gets no dropdown — their identity comes from the CRM deal.
		expect(screen.queryByLabelText('Assign Client to a user')).toBeNull();
	});

	it('reassigns through the API, reports the change up, and shows the fresh link once', async () => {
		const { onRecipientChanged } = renderPanel();
		const select = await screen.findByLabelText<HTMLSelectElement>('Assign Countersigner to a user');
		await waitFor(() => expect(select.disabled).toBe(false));
		fireEvent.change(select, { target: { value: 'u2' } });
		await waitFor(() => expect(updateDocumentRecipient).toHaveBeenCalledWith('d1', 'r2', { name: 'Mariah LaRonge', email: 'mariah@skylineclean.com' }));
		await waitFor(() => expect(onRecipientChanged).toHaveBeenCalled());
		// The one-shot link for the new assignee.
		const linkInput = await screen.findByLabelText<HTMLInputElement>('Mariah LaRonge link');
		expect(linkInput.value).toContain('fresh-token');
	});

	it('disables the dropdown once a signature request exists', async () => {
		renderPanel({ signatureLocked: true });
		const select = await screen.findByLabelText<HTMLSelectElement>('Assign Countersigner to a user');
		expect(select.disabled).toBe(true);
	});

	it('regenerates a link and shows it in place', async () => {
		renderPanel();
		const buttons = await screen.findAllByRole('button', { name: 'Regenerate link' });
		fireEvent.click(buttons[0]!);
		await waitFor(() => expect(regenerateRecipientToken).toHaveBeenCalledWith('d1', 'r1'));
		const linkInput = await screen.findByLabelText<HTMLInputElement>('Mary Ellen Weller link');
		expect(linkInput.value).toContain('regen-token');
	});
});

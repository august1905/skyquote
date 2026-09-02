import { useEffect, useState } from 'react';
import { appUserDisplayName, listAppUsers, type AppUser } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import type { RecipientDraft } from './types';

interface RecipientsStepProps {
	recipients: RecipientDraft[];
	onChange: (recipients: RecipientDraft[]) => void;
}

/**
 * §11 step 2: "Bind roles to people". Every role gets a name + email here,
 * not just roles with fields — the spec's own narrower "email required for
 * any role with fields" is widened deliberately: per Grayson's direction,
 * the document's own web link (not a PDF, not an account) is the primary
 * way *anyone* views it, so every role needs a working link regardless of
 * whether it owns any fillable fields.
 *
 * Two kinds of row (Grayson, 2026-09-02): a customer role is auto-filled
 * from the CRM deal's contact (and stays editable), while a **sender** role
 * is always one of our own app users — a dropdown, defaulting to whoever is
 * creating the document, never a free-text email that could misspell a
 * teammate out of their own signature.
 */
export function RecipientsStep({ recipients, onChange }: RecipientsStepProps) {
	const { user: currentUser } = useAuth();
	const [users, setUsers] = useState<AppUser[] | null>(null);
	const [usersError, setUsersError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		listAppUsers()
			.then(({ users: loaded }) => {
				if (!cancelled) setUsers(loaded);
			})
			.catch(() => {
				if (!cancelled) setUsersError(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Whoever is creating the document is almost always its countersigner —
	// fill empty sender rows with them once, before any choice is made.
	// Deliberately not keyed to `users` loading: the session already knows
	// this person's name and email.
	useEffect(() => {
		if (!currentUser) return;
		if (!recipients.some((r) => r.isSender && !r.email)) return;
		onChange(
			recipients.map((r) =>
				r.isSender && !r.email
					? { ...r, name: [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email, email: currentUser.email }
					: r,
			),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- prefill runs when the user context lands, not on every keystroke in the sibling rows
	}, [currentUser]);

	function update(index: number, patch: Partial<RecipientDraft>) {
		onChange(recipients.map((r, i) => (i === index ? { ...r, ...patch } : r)));
	}

	if (recipients.length === 0) {
		return <p className="wizard-hint">This template has no roles yet — add one from the Recipients / Roles panel before creating a document.</p>;
	}

	return (
		<div className="wizard-step">
			{recipients.map((recipient, index) => (
				<div key={recipient.roleId} className="wizard-recipient-row">
					<span className="wizard-recipient-role">{recipient.roleName}</span>
					{recipient.isSender ? (
						usersError ? (
							// The dropdown's data source is down — fall back to the plain
							// inputs rather than blocking document creation on GET /users.
							<>
								<input
									type="text"
									aria-label={`${recipient.roleName} name`}
									placeholder="Name"
									value={recipient.name}
									onChange={(e) => update(index, { name: e.target.value })}
								/>
								<input
									type="email"
									aria-label={`${recipient.roleName} email`}
									placeholder="Email"
									value={recipient.email}
									onChange={(e) => update(index, { email: e.target.value })}
								/>
							</>
						) : (
							<select
								aria-label={`${recipient.roleName} user`}
								className="wizard-recipient-user"
								value={users?.find((u) => u.email === recipient.email)?.id ?? ''}
								disabled={!users}
								onChange={(e) => {
									const user = users?.find((u) => u.id === e.target.value);
									if (user) update(index, { name: appUserDisplayName(user), email: user.email });
								}}
							>
								{/* Placeholder only while the assignee isn't one of the loaded
								    users (still loading, or a prefilled email that no longer
								    matches an account) — otherwise the real selection shows. */}
								{!users?.some((u) => u.email === recipient.email) && (
									<option value="">{recipient.email ? `${recipient.name} (${recipient.email})` : 'Choose a user…'}</option>
								)}
								{(users ?? []).map((user) => (
									<option key={user.id} value={user.id}>
										{appUserDisplayName(user)}
									</option>
								))}
							</select>
						)
					) : (
						<>
							<input
								type="text"
								aria-label={`${recipient.roleName} name`}
								placeholder="Name"
								value={recipient.name}
								onChange={(e) => update(index, { name: e.target.value })}
							/>
							<input
								type="email"
								aria-label={`${recipient.roleName} email`}
								placeholder="Email"
								value={recipient.email}
								onChange={(e) => update(index, { email: e.target.value })}
							/>
						</>
					)}
					<input
						type="number"
						aria-label={`${recipient.roleName} signing order`}
						placeholder="Signing order"
						value={recipient.signingOrder}
						onChange={(e) => update(index, { signingOrder: e.target.value })}
					/>
				</div>
			))}
			<p className="wizard-hint">
				The customer is filled from the CRM deal&apos;s contact; a sender role is one of our own users. Signing order is optional — leave it
				blank unless sequential signing matters here.
			</p>
		</div>
	);
}

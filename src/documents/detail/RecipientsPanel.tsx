import { useEffect, useMemo, useState } from 'react';
import { regenerateRecipientToken, updateDocumentRecipient, type DocumentRecipientWithToken } from '../../api/documents';
import { appUserDisplayName, listAppUsers, type AppUser } from '../../api/users';
import type { DocumentRecipient, Role } from '../../editor/types';
import { RecipientLinkRow } from '../RecipientLinkRow';

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
	pending: 'Pending',
	viewed: 'Viewed',
	completed: 'Completed',
	declined: 'Declined',
};

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	return parts
		.slice(0, 2)
		.map((part) => part[0]!.toUpperCase())
		.join('');
}

interface RecipientsPanelProps {
	documentId: string;
	recipients: DocumentRecipient[];
	/** The document body's role definitions — `isSender` is what marks the internal countersigner's row as reassignable. */
	roles: Role[];
	/** True once a Zoho Sign request exists. Recipients are locked then — their identity is baked into the request — and the panel says so instead of offering a dropdown that would 409. */
	signatureLocked: boolean;
	onClose: () => void;
	/** Lets the page keep its own copy of the recipients in step after a reassign, without a refetch. */
	onRecipientChanged: (recipient: DocumentRecipient) => void;
}

/**
 * The document's people, PandaDoc-style: the customer (bound from the CRM
 * deal at creation) and the internal countersigner, who is one of our own
 * app users and can be swapped from a dropdown until signing locks the
 * document. Every recipient's link can be regenerated here — that moved in
 * from the old flat "Recipients" section this panel replaces.
 */
export function RecipientsPanel({ documentId, recipients, roles, signatureLocked, onClose, onRecipientChanged }: RecipientsPanelProps) {
	const [users, setUsers] = useState<AppUser[] | null>(null);
	const [usersError, setUsersError] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// A fresh raw link exists only in the response that (re)generated it —
	// held here until the panel unmounts, same "shown once" rule as creation.
	const [freshLinks, setFreshLinks] = useState<Record<string, DocumentRecipientWithToken>>({});

	const senderRoleIds = useMemo(() => new Set(roles.filter((role) => role.isSender).map((role) => role.id)), [roles]);
	const roleColorById = useMemo(() => new Map(roles.map((role) => [role.id, role.color])), [roles]);

	// Fetched when the panel opens, not when the page loads — most opens of a
	// document never touch the dropdown.
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

	async function handleReassign(recipient: DocumentRecipient, user: AppUser) {
		setBusyId(recipient.id);
		setError(null);
		try {
			const { recipient: updated } = await updateDocumentRecipient(documentId, recipient.id, {
				name: appUserDisplayName(user),
				email: user.email,
			});
			setFreshLinks((prev) => ({ ...prev, [recipient.id]: updated }));
			onRecipientChanged(updated);
		} catch {
			setError('Could not reassign this recipient.');
		} finally {
			setBusyId(null);
		}
	}

	async function handleRegenerate(recipient: DocumentRecipient) {
		setBusyId(recipient.id);
		setError(null);
		try {
			const { recipient: updated } = await regenerateRecipientToken(documentId, recipient.id);
			setFreshLinks((prev) => ({ ...prev, [recipient.id]: updated }));
		} catch {
			setError('Could not regenerate this link.');
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="document-rail-panel recipients-rail-panel" aria-label="Recipients">
			<div className="document-rail-panel-header">
				<h2>Recipients</h2>
				<button type="button" aria-label="Close recipients panel" onClick={onClose}>
					×
				</button>
			</div>
			<p className="document-rail-panel-hint">
				The customer comes from the CRM deal; the countersigner is one of our own users
				{signatureLocked ? ' — locked now that signing is under way.' : '.'}
			</p>
			{error && (
				<p className="document-rail-panel-error" role="alert">
					{error}
				</p>
			)}
			<ol className="recipients-panel-list">
				{recipients.map((recipient, index) => {
					const isInternal = senderRoleIds.has(recipient.roleId);
					const fresh = freshLinks[recipient.id];
					const selectedUser = users?.find((user) => user.email === recipient.email) ?? null;
					return (
						<li key={recipient.id} className="recipients-panel-row">
							<span className="recipients-panel-index">{index + 1}</span>
							<span
								className="recipients-panel-avatar"
								style={{ background: `color-mix(in srgb, ${roleColorById.get(recipient.roleId) ?? '#94a3b8'} 18%, #fff)` }}
							>
								{initials(recipient.name)}
							</span>
							<div className="recipients-panel-who">
								<span className="recipients-panel-name">{recipient.name}</span>
								<span className="recipients-panel-email">{recipient.email}</span>
								<span className="recipients-panel-role">{recipient.roleName}</span>
								{isInternal && (
									<div className="recipients-panel-assign">
										{usersError ? (
											<span className="recipients-panel-assign-error">Couldn&apos;t load users.</span>
										) : (
											<select
												aria-label={`Assign ${recipient.roleName} to a user`}
												value={selectedUser?.id ?? ''}
												disabled={signatureLocked || !users || busyId === recipient.id}
												onChange={(e) => {
													const user = users?.find((u) => u.id === e.target.value);
													if (user && user.email !== recipient.email) void handleReassign(recipient, user);
												}}
											>
												{/* The stored assignee may predate this feature or have been
												    deactivated since — keep them visible rather than silently
												    showing the first user as if they were assigned. */}
												{!selectedUser && <option value="">{recipient.name || recipient.email}</option>}
												{(users ?? []).map((user) => (
													<option key={user.id} value={user.id}>
														{appUserDisplayName(user)}
													</option>
												))}
											</select>
										)}
									</div>
								)}
								{fresh && <RecipientLinkRow documentId={documentId} name={fresh.name} roleName={fresh.roleName} token={fresh.token} />}
								{!fresh && (
									<button
										type="button"
										className="recipients-panel-regenerate"
										disabled={busyId === recipient.id}
										onClick={() => void handleRegenerate(recipient)}
									>
										{busyId === recipient.id ? 'Working…' : 'Regenerate link'}
									</button>
								)}
							</div>
							<span className={`recipients-panel-status recipients-panel-status-${recipient.status}`}>
								{RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

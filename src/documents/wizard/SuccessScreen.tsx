import { useState } from 'react';
import type { CreateDocumentResult, DocumentRecipientWithToken } from '../../api/documents';

interface SuccessScreenProps {
	result: CreateDocumentResult;
	onClose: () => void;
}

/**
 * A recipient's raw link is only ever shown once — right here, or again
 * later via a regenerate-link action if this screen is closed before
 * copying (see routes/documents.js's regenerate-token endpoint). Same
 * "shown once, hashed thereafter" rule a password-reset link already
 * follows. Email delivery isn't wired up (Catalyst Email is blocked — see
 * BUILD_STATUS.md's "Blocked/parked" section), so copying and sending these
 * manually is the real workflow for now, not a placeholder for one.
 */
export function SuccessScreen({ result, onClose }: SuccessScreenProps) {
	const [copiedId, setCopiedId] = useState<string | null>(null);

	function linkFor(recipient: DocumentRecipientWithToken): string {
		return `${window.location.origin}/d/${result.document.id}/${recipient.token}`;
	}

	async function copyLink(recipient: DocumentRecipientWithToken) {
		try {
			await navigator.clipboard.writeText(linkFor(recipient));
			setCopiedId(recipient.id);
		} catch {
			// Clipboard permission can be denied — the link is still selectable/
			// copyable by hand from the (readOnly, focusable) input below, so
			// this isn't a dead end, just a missed shortcut.
		}
	}

	return (
		<div className="wizard-step">
			<p className="wizard-success-heading">&ldquo;{result.document.title}&rdquo; was created.</p>
			<p className="wizard-hint">Copy each recipient&apos;s link below and send it yourself.</p>
			{result.recipients.map((recipient) => (
				<div key={recipient.id} className="wizard-link-row">
					<span className="wizard-link-recipient">
						{recipient.name} ({recipient.roleName})
					</span>
					<input
						type="text"
						readOnly
						aria-label={`${recipient.name} link`}
						value={linkFor(recipient)}
						onFocus={(e) => e.currentTarget.select()}
					/>
					<button type="button" onClick={() => void copyLink(recipient)}>
						{copiedId === recipient.id ? 'Copied!' : 'Copy link'}
					</button>
				</div>
			))}
			<div className="wizard-nav-buttons">
				<button type="button" onClick={onClose}>
					Done
				</button>
			</div>
		</div>
	);
}

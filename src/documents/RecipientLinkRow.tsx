import { useState } from 'react';

interface RecipientLinkRowProps {
	documentId: string;
	name: string;
	roleName: string;
	token: string;
}

/**
 * One recipient's raw link, shown exactly once — right after it's
 * generated (`CreateDocumentWizard`'s success screen) or regenerated (the
 * Documents list's detail view). Never persisted raw anywhere past this
 * point (see `routes/documents.js`'s regenerate-token endpoint) — same
 * "shown once, hashed thereafter" rule a password-reset link already
 * follows.
 */
export function RecipientLinkRow({ documentId, name, roleName, token }: RecipientLinkRowProps) {
	const [copied, setCopied] = useState(false);
	const link = `${window.location.origin}/d/${documentId}/${token}`;

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			// Clipboard permission can be denied — the link is still selectable/
			// copyable by hand from the (readOnly, focusable) input below, so
			// this isn't a dead end, just a missed shortcut.
		}
	}

	return (
		<div className="wizard-link-row">
			<span className="wizard-link-recipient">
				{name} ({roleName})
			</span>
			<input type="text" readOnly aria-label={`${name} link`} value={link} onFocus={(e) => e.currentTarget.select()} />
			<button type="button" onClick={() => void copyLink()}>
				{copied ? 'Copied!' : 'Copy link'}
			</button>
		</div>
	);
}

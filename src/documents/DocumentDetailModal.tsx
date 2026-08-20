import { useEffect, useState } from 'react';
import { getDocument, regenerateRecipientToken, type DocumentRecipientWithToken, type GetDocumentResult } from '../api/documents';
import { formatMoney } from '../pricing/formatMoney';
import { RecipientLinkRow } from './RecipientLinkRow';
import './wizard/wizard.css';
import './documentDetail.css';

interface DocumentDetailModalProps {
	documentId: string;
	onClose: () => void;
}

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
	pending: 'Pending',
	viewed: 'Viewed',
	completed: 'Completed',
	declined: 'Declined',
};

/**
 * The Documents list's detail view — reuses the wizard's own modal
 * card/overlay styling rather than a second one. Its one real job: recover
 * a recipient's link after it's been lost. A raw token is never stored
 * (see `routes/documents.js`'s regenerate-token endpoint), so "recover" here
 * always means *replace* — regenerating invalidates whatever link that
 * recipient had before, shown via the same `RecipientLinkRow` the wizard's
 * success screen uses.
 */
export function DocumentDetailModal({ documentId, onClose }: DocumentDetailModalProps) {
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [data, setData] = useState<GetDocumentResult | null>(null);
	const [regenerated, setRegenerated] = useState<Record<string, DocumentRecipientWithToken>>({});
	const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getDocument(documentId)
			.then((result) => {
				if (cancelled) return;
				setData(result);
				setStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [documentId]);

	async function handleRegenerate(recipientId: string) {
		setRegeneratingId(recipientId);
		setError(null);
		try {
			const result = await regenerateRecipientToken(documentId, recipientId);
			setRegenerated((prev) => ({ ...prev, [recipientId]: result.recipient }));
		} catch {
			setError('Could not regenerate this link.');
		} finally {
			setRegeneratingId(null);
		}
	}

	return (
		<div className="wizard-overlay" onClick={onClose}>
			<div className="wizard-card" onClick={(e) => e.stopPropagation()}>
				<div className="wizard-header">
					<h2>{data?.document.title ?? 'Document'}</h2>
					<button type="button" aria-label="Close document detail" onClick={onClose}>
						×
					</button>
				</div>
				{status === 'loading' && <p>Loading…</p>}
				{status === 'error' && <p role="alert">Couldn&apos;t load this document.</p>}
				{status === 'ready' && data && (
					<div className="wizard-step">
						<p>
							<strong>Status:</strong> {data.document.status}
						</p>
						<p>
							<strong>Total:</strong> {formatMoney(data.document.computedTotal, data.document.currency)}
						</p>
						<p>
							<strong>Recipients</strong>
						</p>
						{data.recipients.map((recipient) => {
							const fresh = regenerated[recipient.id];
							return (
								<div key={recipient.id} className="document-detail-recipient">
									{fresh ? (
										<RecipientLinkRow documentId={documentId} name={fresh.name} roleName={fresh.roleName} token={fresh.token} />
									) : (
										<div className="document-detail-recipient-row">
											<span>
												{recipient.name} ({recipient.roleName}) — {RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}
											</span>
											<button
												type="button"
												disabled={regeneratingId === recipient.id}
												onClick={() => void handleRegenerate(recipient.id)}
											>
												{regeneratingId === recipient.id ? 'Regenerating…' : 'Regenerate link'}
											</button>
										</div>
									)}
								</div>
							);
						})}
						{error && (
							<p className="wizard-error" role="alert">
								{error}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

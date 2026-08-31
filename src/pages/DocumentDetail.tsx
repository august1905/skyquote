import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { resolveAssetUrl } from '../api/assets';
import { SignatureSender } from '../documents/SignatureSender';
import type { SendForSignatureResult } from '../api/documents';
import {
	deleteDocument,
	getDocument,
	regenerateRecipientToken,
	type DocumentRecipientWithToken,
	type GetDocumentResult,
} from '../api/documents';
import AppShell from '../components/AppShell';
import { DocumentPages } from '../documents/DocumentPages';
import { RecipientLinkRow } from '../documents/RecipientLinkRow';
import type { DocumentStatus } from '../editor/types';
import { formatMoney } from '../pricing/formatMoney';
import { computeTotals } from '../pricing/computeTotals';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import '../documents/wizard/wizard.css';
import '../documents/documentDetail.css';
import './DocumentDetail.css';

const STATUS_LABEL: Record<DocumentStatus, string> = {
	draft: 'Draft',
	sent: 'Sent',
	viewed: 'Viewed',
	completed: 'Completed',
	declined: 'Declined',
};

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
	pending: 'Pending',
	viewed: 'Viewed',
	completed: 'Completed',
	declined: 'Declined',
};

/**
 * A document, opened internally — the whole document, rendered.
 *
 * Grayson, 2026-08-22: "When I click on a document off of the document list, or
 * anywhere, I want it to actually open, in that tab. Right now it just shows a
 * few pieces of info." It did: a modal listing status, total and recipients,
 * which is *metadata about* a quote rather than the quote. The renderer already
 * existed for the recipient's link view; it just had never been pointed at an
 * internal reader.
 *
 * Two things this view is deliberately not:
 *
 * - **Not editable.** A document is a frozen snapshot (§11.1) — the thing you
 *   edit is the template it came from. Every field renders as submitted, with
 *   `viewerRoleId: null` so nothing is live: this reader is not a recipient, and
 *   letting staff type into a customer's signature box would be forging it.
 * - **Not a recipient's view.** Field values already submitted are shown as
 *   values, and asset URLs resolve through the session-authenticated
 *   `/assets/:id/file` rather than a recipient's token-gated mirror.
 */
function DocumentDetail() {
	const { documentId } = useParams<{ documentId: string }>();
	const navigate = useNavigate();
	const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
	const [data, setData] = useState<GetDocumentResult | null>(null);
	const [regenerated, setRegenerated] = useState<Record<string, DocumentRecipientWithToken>>({});
	// §4's signature send. `sending` mounts the offscreen renderer that measures
	// the fields; it unmounts as soon as the send resolves either way.
	const [sending, setSending] = useState(false);
	const [sendResult, setSendResult] = useState<SendForSignatureResult | null>(null);
	const [sendError, setSendError] = useState<string | null>(null);
	const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!documentId) {
			setStatus('not-found');
			return;
		}
		let cancelled = false;
		setStatus('loading');
		getDocument(documentId)
			.then((result) => {
				if (cancelled) return;
				setData(result);
				setStatus('ready');
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setStatus(err instanceof ApiError && err.status === 404 ? 'not-found' : 'error');
			});
		return () => {
			cancelled = true;
		};
	}, [documentId]);

	// Built unconditionally so the hook order never depends on `status` — the same
	// rules-of-hooks reason `DocumentView` builds its own this way.
	const smartContentContext: SmartContentContext = useMemo(() => {
		if (!data) return { resolvedVariables: {}, fieldValues: {}, pricingTotals: {} };
		const totals = computeTotals(data.body);
		return {
			resolvedVariables: data.body.resolvedVariableValues ?? {},
			fieldValues: data.body.fieldValues ?? {},
			pricingTotals: Object.fromEntries(totals.blocks.map((b) => [b.blockId, b.total])),
		};
	}, [data]);

	// Nothing here changes a field, but `DocumentPages` needs the shape. `readOnly`
	// is the honest description of this view rather than a state it can leave.
	const fieldInteraction = useMemo(
		() => ({ fieldValues: data?.body.fieldValues ?? {}, onFieldChange: () => undefined, readOnly: true }),
		[data],
	);

	const resolveImageSrc = useCallback((assetId: string) => resolveAssetUrl(`/assets/${assetId}/file`), []);

	async function handleRegenerate(recipientId: string) {
		if (!documentId) return;
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

	async function handleDelete() {
		if (!documentId) return;
		setDeleting(true);
		setError(null);
		try {
			await deleteDocument(documentId);
			void navigate('/documents');
		} catch {
			setError('Could not delete this document.');
			setDeleting(false);
		}
	}

	if (status === 'loading') {
		return (
			<AppShell>
				<p>Loading…</p>
			</AppShell>
		);
	}

	if (status === 'not-found' || status === 'error' || !data || !documentId) {
		return (
			<AppShell>
				<p role="alert">{status === 'not-found' ? "That document doesn't exist any more." : "Couldn't load this document."}</p>
				<button type="button" onClick={() => void navigate('/documents')}>
					Back to Documents
				</button>
			</AppShell>
		);
	}

	const { document: meta, recipients } = data;

	return (
		<AppShell>
			<div className="document-detail">
				<div className="document-detail-header">
					<div>
						<button type="button" className="document-detail-back" onClick={() => void navigate('/documents')}>
							← Documents
						</button>
						<h1>{meta.title}</h1>
						<p className="document-detail-meta">
							<span className={`documents-status-pill documents-status-${meta.status}`}>{STATUS_LABEL[meta.status]}</span>
							<span>{formatMoney(meta.computedTotal, meta.currency)}</span>
							<span>Created {new Date(meta.createdAt).toLocaleDateString()}</span>
						</p>
					</div>
					<div className="document-detail-actions">
						{confirmingDelete ? (
							<div className="document-detail-confirm" role="group" aria-label="Confirm delete">
								{/* Spelled out because it genuinely can't be undone: a token is
								    stored only as a hash, so a deleted document's links can be
								    neither recovered nor reissued. */}
								<span>Delete this document? Every recipient&apos;s link stops working, permanently.</span>
								<button type="button" disabled={deleting} onClick={() => void handleDelete()}>
									{deleting ? 'Deleting…' : 'Yes, delete'}
								</button>
								<button type="button" onClick={() => setConfirmingDelete(false)}>
									Keep it
								</button>
							</div>
						) : (
							<button type="button" className="document-detail-delete" onClick={() => setConfirmingDelete(true)}>
								Delete
							</button>
						)}
					</div>
				</div>

				{error && (
					<p className="wizard-error" role="alert">
						{error}
					</p>
				)}

				<section className="document-detail-signature" aria-label="Signature">
					<h2>Signature</h2>
					{meta.signRequestId || sendResult ? (
						<p className="document-detail-signature-sent">
							Sent for signature. Recipients sign inside their own document link — Zoho Sign never emails them separately.
						</p>
					) : (
						<>
							{/* Signing normally sets itself up as the document is created, so
							    reaching this state means that didn't happen — usually the
							    document has no signature field at all, or the send failed and
							    the wizard sent whoever created it here. Saying which it is
							    would need the event trail; naming the retry is what matters. */}
							<p className="document-detail-signature-hint">
								Not set up for signing. Sends this document to Zoho Sign and turns on in-document signing for every recipient who has a field
								to fill.
							</p>
							<button type="button" className="document-detail-send-signature" disabled={sending} onClick={() => {
								setSendError(null);
								setSending(true);
							}}>
								{sending ? 'Sending…' : 'Send for signature'}
							</button>
						</>
					)}
					{sendError && (
						<p className="wizard-error" role="alert">
							{sendError}
						</p>
					)}
					{sendResult && sendResult.skipped.length > 0 && (
						// Named rather than dropped silently: a role with nothing to sign is
						// almost always a template that forgot a field, and the author is the
						// only person who can still fix it.
						<p className="document-detail-signature-skipped">
							No field to sign for: {sendResult.skipped.map((s) => s.roleName).join(', ')}. They can still read the document.
						</p>
					)}
					{sending && data.body && (
						<SignatureSender
							documentId={meta.id}
							body={data.body}
							// Documents aren't paginated anywhere yet — that map is built by the
							// editor's canvas, which isn't mounted here. Empty means each authored
							// page renders as one sheet, and `SignatureSender` refuses to send
							// rather than guess if any sheet actually overflows.
							blockPageNumbers={new Map()}
							onFinished={(error, result) => {
								setSending(false);
								setSendError(error);
								setSendResult(result);
							}}
						/>
					)}
				</section>

				<section className="document-detail-recipients" aria-label="Recipients">
					<h2>Recipients</h2>
					{recipients.map((recipient) => {
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
										<button type="button" disabled={regeneratingId === recipient.id} onClick={() => void handleRegenerate(recipient.id)}>
											{regeneratingId === recipient.id ? 'Regenerating…' : 'Regenerate link'}
										</button>
									</div>
								)}
							</div>
						);
					})}
				</section>

				{/* The document itself. `viewerRoleId: null` — see the module comment. */}
				<div className="document-detail-render">
					<DocumentPages
						body={data.body}
						resolveImageSrc={resolveImageSrc}
						viewerRoleId={null}
						fieldInteraction={fieldInteraction}
						smartContentContext={smartContentContext}
					/>
				</div>
			</div>
		</AppShell>
	);
}

export default DocumentDetail;

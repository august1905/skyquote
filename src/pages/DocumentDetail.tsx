import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { resolveAssetUrl } from '../api/assets';
import { SignatureSender } from '../documents/SignatureSender';
import type { SendForSignatureResult } from '../api/documents';
import { deleteDocument, getDocument, type GetDocumentResult } from '../api/documents';
import AppShell from '../components/AppShell';
import { DocumentPages } from '../documents/DocumentPages';
import { DocumentRail, type DocumentRailPanelKey } from '../documents/detail/DocumentRail';
import { RecipientsPanel } from '../documents/detail/RecipientsPanel';
import { AuditTrailPanel } from '../documents/detail/AuditTrailPanel';
import { toAuditEntries } from '../documents/detail/auditTrail';
import type { DocumentRecipient, DocumentStatus } from '../editor/types';
import { formatMoney } from '../pricing/formatMoney';
import { computeTotals } from '../pricing/computeTotals';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import '../documents/wizard/wizard.css';
import './DocumentDetail.css';

const STATUS_LABEL: Record<DocumentStatus, string> = {
	draft: 'Draft',
	sent: 'Sent',
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
 *
 * The metadata that used to be flat sections lives in the side tab rail now
 * (the editor's RightRail pattern): Recipients — the customer plus the
 * internal countersigner — and the Audit trail, `DocumentEvents` rendered as
 * a timeline.
 */
function DocumentDetail() {
	const { documentId } = useParams<{ documentId: string }>();
	const navigate = useNavigate();
	const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
	const [data, setData] = useState<GetDocumentResult | null>(null);
	// Recipients is the panel someone opening this page is most likely here
	// for (who has it, have they signed) — so it starts open, like PandaDoc.
	const [openPanel, setOpenPanel] = useState<DocumentRailPanelKey | null>('recipients');
	// §4's signature send. `sending` mounts the offscreen renderer that measures
	// the fields; it unmounts as soon as the send resolves either way.
	const [sending, setSending] = useState(false);
	const [sendResult, setSendResult] = useState<SendForSignatureResult | null>(null);
	const [sendError, setSendError] = useState<string | null>(null);
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

	// Escape closes the open panel — same affordance every closable surface in
	// the app has. Plain listener rather than the editor's useCloseOnEscape:
	// that hook's stack gate exists for the editor's own layered surfaces.
	useEffect(() => {
		if (openPanel === null) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpenPanel(null);
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [openPanel]);

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

	const auditEntries = useMemo(() => (data ? toAuditEntries(data.events, data.recipients) : []), [data]);

	const resolveImageSrc = useCallback((assetId: string) => resolveAssetUrl(`/assets/${assetId}/file`), []);

	// The audit panel's Refresh — one explicit refetch, not a poll: Data Store
	// reads are billed, and webhook-delivered events are rare enough that the
	// person watching for one can press the button.
	const refresh = useCallback(async () => {
		if (!documentId) return;
		try {
			setData(await getDocument(documentId));
		} catch {
			// Keep showing what we have — a failed refresh isn't a failed page.
		}
	}, [documentId]);

	const handleRecipientChanged = useCallback((recipient: DocumentRecipient) => {
		setData((prev) =>
			prev
				? { ...prev, recipients: prev.recipients.map((r) => (r.id === recipient.id ? { ...r, ...recipient } : r)) }
				: prev,
		);
	}, []);

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
		<AppShell scroll="self">
			<div className="document-detail-layout">
				<div className="document-detail-scroll">
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
										Not set up for signing. Sends this document to Zoho Sign and turns on in-document signing for every recipient who has a
										field to fill.
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
				</div>

				<DocumentRail openPanel={openPanel} onToggle={(panel) => setOpenPanel((current) => (current === panel ? null : panel))}>
					{openPanel === 'recipients' && (
						<RecipientsPanel
							documentId={documentId}
							recipients={recipients}
							roles={data.body.roles ?? []}
							signatureLocked={Boolean(meta.signRequestId)}
							onClose={() => setOpenPanel(null)}
							onRecipientChanged={handleRecipientChanged}
						/>
					)}
					{openPanel === 'audit' && (
						<AuditTrailPanel entries={auditEntries} documentTitle={meta.title} onClose={() => setOpenPanel(null)} onRefresh={refresh} />
					)}
				</DocumentRail>
			</div>
		</AppShell>
	);
}

export default DocumentDetail;

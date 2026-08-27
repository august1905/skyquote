import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { declineDocument, getPublicDocument, resolvePublicAssetUrl, submitDocumentFields, type PublicDocumentView } from '../api/documents';
import { SigningPanel } from '../documents/SigningPanel';
import { collectAllFields } from '../editor/fields/collectFields';
import type { FieldValue } from '../editor/fields/FieldPreview';
import type { FillableField } from '../editor/types';
import { computeTotals } from '../pricing/computeTotals';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import { DocumentPages } from '../documents/DocumentPages';
import type { FieldInteraction } from '../documents/RichTextView';
import './DocumentView.css';

/**
 * A recipient's own web-link view (§11) — deliberately outside `AppShell`
 * and every `RequireAuth`/`RequireAdmin` guard in App.tsx: a recipient never
 * logs in, they open a per-recipient secret link (`routes/publicDocumentView.js`
 * verifies the token, not a session). This is the primary way a document is
 * ever seen — per product direction, PDF export is secondary, most people
 * only ever open this page.
 *
 * Scope, stated plainly rather than left implicit: a recipient's own field
 * renders live and their entries submit for real (`routes/publicDocumentView.js`'s
 * submit route, stored on the Document's own Stratus body — see
 * `src/api/documents.ts`'s `DocumentBody`). Recipient-side pricing
 * interactivity (picking/unpicking optional items, choosing a quote-builder
 * option) is a separate, still-not-built story — see BUILD_STATUS.md.
 * `file_upload`/`billing_details` fields stay a preview of interactivity,
 * never actually submitted — no upload endpoint, no payment provider (§16
 * Q7 is still an open product question).
 */

function isRequiredFieldMissing(field: FillableField, value: FieldValue | undefined): boolean {
	if (!field.required) return false;
	// Never actually submitted (see the module doc comment) — nothing to require yet.
	if (field.type === 'file_upload' || field.type === 'billing_details') return false;
	if (field.type === 'checkbox' || field.type === 'signature' || field.type === 'initials' || field.type === 'stamp') {
		return value !== true;
	}
	return !(typeof value === 'string' && value.trim().length > 0);
}

function DocumentView() {
	const { documentId, token } = useParams<{ documentId: string; token: string }>();
	const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
	const [data, setData] = useState<PublicDocumentView | null>(null);
	const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
	const [recipientStatus, setRecipientStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	// §4's embedded signing. Opened by the recipient, never automatically: the
	// signing URL behind it is single-use and expires in two minutes.
	const [signingOpen, setSigningOpen] = useState(false);

	useEffect(() => {
		if (!documentId || !token) {
			setStatus('not-found');
			return;
		}
		let cancelled = false;
		setStatus('loading');
		getPublicDocument(documentId, token)
			.then((result) => {
				if (cancelled) return;
				setData(result);
				setFieldValues(result.body.fieldValues ?? {});
				setRecipientStatus(result.recipient.status);
				setStatus('ready');
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setStatus(err instanceof ApiError && err.status === 404 ? 'not-found' : 'error');
			});
		return () => {
			cancelled = true;
		};
	}, [documentId, token]);

	// Built even while `data` is still null (falls back to empty) so this hook
	// runs on every render regardless of `status` — an early return above a
	// conditionally-skipped hook would violate the rules of hooks the moment
	// `status` flips from `loading` to `ready`.
	const smartContentContext: SmartContentContext = useMemo(() => {
		if (!data) return { resolvedVariables: {}, fieldValues: {}, pricingTotals: {} };
		const totals = computeTotals(data.body);
		return {
			resolvedVariables: data.body.resolvedVariableValues ?? {},
			fieldValues,
			pricingTotals: Object.fromEntries(totals.blocks.map((b) => [b.blockId, b.total])),
		};
	}, [data, fieldValues]);

	if (status === 'loading') {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status">Loading…</p>
			</div>
		);
	}

	if (status === 'not-found') {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status" role="alert">
					This link is invalid or has expired.
				</p>
			</div>
		);
	}

	if (status === 'error' || !data || !documentId || !token) {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status" role="alert">
					Something went wrong loading this document. Try reloading the page.
				</p>
			</div>
		);
	}

	const myFields = collectAllFields(data.body).filter((field) => field.roleId === data.recipient.roleId);
	const isFrozen = recipientStatus === 'completed' || recipientStatus === 'declined';
	// `awaitingSignature` is really "this recipient is registered with Zoho Sign",
	// and it stays true after they sign — the backend never clears the ids. That's
	// what lets this page tell a *signed* document from one whose fields were
	// merely submitted, without needing a new field from the API.
	const registeredWithSign = data.document.awaitingSignature;
	const missingRequired = myFields.filter((field) => isRequiredFieldMissing(field, fieldValues[field.id]));
	const fieldInteraction: FieldInteraction = {
		fieldValues,
		onFieldChange: (fieldId, value) => setFieldValues((prev) => ({ ...prev, [fieldId]: value })),
		readOnly: isFrozen,
		// Only when Zoho Sign actually has this document. Before that there is
		// nothing for a signature box to report or open, so it stays the plain
		// toggle. Note this stays set *after* signing — that's the whole point:
		// the box has to be able to say "Signed", not fall back to looking empty.
		signing: registeredWithSign
			? {
					status: recipientStatus === 'completed' ? 'signed' : recipientStatus === 'declined' ? 'declined' : 'awaiting',
					open: () => setSigningOpen(true),
				}
			: undefined,
	};

	async function handleSubmit() {
		if (missingRequired.length > 0) return;
		setSubmitting(true);
		setActionError(null);
		try {
			const result = await submitDocumentFields(documentId!, token!, fieldValues);
			setRecipientStatus(result.recipientStatus);
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : 'Could not submit your responses.');
		} finally {
			setSubmitting(false);
		}
	}

	async function handleDecline() {
		if (!window.confirm('Decline this document? This cannot be undone.')) return;
		setSubmitting(true);
		setActionError(null);
		try {
			const result = await declineDocument(documentId!, token!);
			setRecipientStatus(result.recipientStatus);
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : 'Could not record your response.');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="doc-view-shell">
			<header className="doc-view-header">
				<h1>{data.document.title}</h1>
				<span className="doc-view-recipient-badge">
					Viewing as {data.recipient.name} ({data.recipient.roleName})
					{recipientStatus === 'completed' && (
						<span className="doc-view-status-pill doc-view-status-completed"> · {registeredWithSign ? 'Signed' : 'Submitted'}</span>
					)}
					{recipientStatus === 'declined' && <span className="doc-view-status-pill doc-view-status-declined"> · Declined</span>}
				</span>
			</header>
			<DocumentPages
				body={data.body}
				resolveImageSrc={(assetId) => resolvePublicAssetUrl(documentId, token, assetId)}
				viewerRoleId={data.recipient.roleId}
				fieldInteraction={fieldInteraction}
				smartContentContext={smartContentContext}
			/>
			{/* Signing happens here, in the document, not in an inbox — recipients
			    are registered with Zoho Sign as embedded signers, which stops it
			    emailing them a link of its own. Shown only once the sender has
			    actually sent the document for signature. */}
			{data.document.awaitingSignature && !isFrozen && (
				<div className="doc-view-sign-bar">
					<p>Ready to sign? You can do it right here — no email, no account.</p>
					<button type="button" className="doc-view-sign-button" onClick={() => setSigningOpen(true)}>
						Sign this document
					</button>
				</div>
			)}
			{signingOpen && (
				<SigningPanel
					documentId={documentId}
					token={token}
					onClose={() => setSigningOpen(false)}
					// Already confirmed against the server by the panel itself, so there's
					// nothing to re-check here — see SigningPanel for why it never trusts
					// Zoho Sign's postMessage on its own.
					onSettled={(status) => {
						setRecipientStatus(status);
						setSigningOpen(false);
					}}
				/>
			)}
			{/* Always shown, regardless of whether this role owns any fields —
			    a recipient can still decline (or just mark "done") a document
			    with nothing to fill in; only Submit's enabled-state depends on
			    whether there's a required field left blank. */}
			<div className="doc-view-actions">
				{isFrozen ? (
					<p className="doc-view-actions-message">
						{recipientStatus !== 'completed'
							? 'You declined this document.'
							: registeredWithSign
								? 'Signed. Thanks — nothing else is needed from you.'
								: 'Thanks — your responses have been submitted.'}
					</p>
				) : (
					<>
						{missingRequired.length > 0 && (
							<p className="doc-view-actions-hint">Fill in before submitting: {missingRequired.map((f) => f.name).join(', ')}</p>
						)}
						{actionError && (
							<p className="doc-view-error" role="alert">
								{actionError}
							</p>
						)}
						<div className="doc-view-actions-buttons">
							<button type="button" onClick={() => void handleDecline()} disabled={submitting}>
								Decline
							</button>
							<button type="button" onClick={() => void handleSubmit()} disabled={submitting || missingRequired.length > 0}>
								{submitting ? 'Submitting…' : 'Submit'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

export default DocumentView;

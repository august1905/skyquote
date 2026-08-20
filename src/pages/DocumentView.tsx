import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { declineDocument, getPublicDocument, submitDocumentFields, type PublicDocumentView } from '../api/documents';
import { collectAllFields } from '../editor/fields/collectFields';
import type { FieldValue } from '../editor/fields/FieldPreview';
import type { FillableField } from '../editor/types';
import { DocumentBlockView } from '../documents/DocumentBlockView';
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
	const missingRequired = myFields.filter((field) => isRequiredFieldMissing(field, fieldValues[field.id]));
	const fieldInteraction: FieldInteraction = {
		fieldValues,
		onFieldChange: (fieldId, value) => setFieldValues((prev) => ({ ...prev, [fieldId]: value })),
		readOnly: isFrozen,
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
					{recipientStatus === 'completed' && <span className="doc-view-status-pill doc-view-status-completed"> · Submitted</span>}
					{recipientStatus === 'declined' && <span className="doc-view-status-pill doc-view-status-declined"> · Declined</span>}
				</span>
			</header>
			<div className="doc-view-pages">
				{data.body.pages.map((page) => (
					<div key={page.id} className="doc-view-page">
						{page.blocks.map((block) => (
							<DocumentBlockView
								key={block.id}
								block={block}
								documentId={documentId}
								token={token}
								viewerRoleId={data.recipient.roleId}
								fieldInteraction={fieldInteraction}
							/>
						))}
					</div>
				))}
			</div>
			{/* Always shown, regardless of whether this role owns any fields —
			    a recipient can still decline (or just mark "done") a document
			    with nothing to fill in; only Submit's enabled-state depends on
			    whether there's a required field left blank. */}
			<div className="doc-view-actions">
				{isFrozen ? (
					<p className="doc-view-actions-message">
						{recipientStatus === 'completed' ? 'Thanks — your responses have been submitted.' : 'You declined this document.'}
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

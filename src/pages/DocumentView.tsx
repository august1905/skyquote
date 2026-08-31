import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
	declineDocument,
	getPublicDocument,
	resolvePublicAssetUrl,
	saveSelections,
	sendConfiguredForSignature,
	submitDocumentFields,
	syncSigningStatus,
	type PublicDocumentView,
} from '../api/documents';
import { SigningPanel } from '../documents/SigningPanel';
import { collectAllFields } from '../editor/fields/collectFields';
import type { FieldValue } from '../editor/fields/FieldPreview';
import type { FillableField } from '../editor/types';
import { computeTotals } from '../pricing/computeTotals';
import type { SmartContentContext } from '../smartContent/evaluateRules';
import { DocumentPages } from '../documents/DocumentPages';
import { SignatureSender } from '../documents/SignatureSender';
import type { PricingInteraction } from '../documents/DocumentBlockView';
import type { FieldInteraction } from '../documents/RichTextView';
import { needsSignature } from '../print/fieldGeometry';
import {
	applyPricingSelections,
	configuredBodyForAgreement,
	defaultSelections,
	hasRecipientChoices,
	selectableItemIds,
	unsatisfiedGroups,
	type PricingSelections,
} from '../pricing/recipientSelections';
import { formatMoney } from '../pricing/formatMoney';
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
 * `src/api/documents.ts`'s `DocumentBody`).
 *
 * **A document that gets signed runs in two steps** (`step`): section 1 is the
 * quote, where optional line items and quote-builder options are the recipient's
 * to choose; section 2 is the same document with everything they declined
 * *removed*, which is what gets rendered to PDF and signed. That ordering is the
 * point — the agreement is produced from the choices rather than before them. A
 * document with no signature line skips all of it and keeps the older
 * fill-in-and-submit form. See `recipient-signing-flow.md`.
 *
 * `file_upload`/`billing_details` fields stay a preview of interactivity,
 * never actually submitted — no upload endpoint, no payment provider (§16
 * Q7 is still an open product question).
 */

function isRequiredFieldMissing(field: FillableField, value: FieldValue | undefined): boolean {
	if (!field.required) return false;
	// Never actually submitted (see the module doc comment) — nothing to require yet.
	if (field.type === 'file_upload' || field.type === 'billing_details') return false;
	// Zoho Sign's business, not Submit's. A signature or set of initials is
	// satisfied in the signing panel and recorded by the webhook, so this form has
	// nothing to gate on — and can't: the local boolean it used to read was written
	// by a toggle that no longer exists on a real document, so leaving it here
	// would make a required signature field block Submit forever.
	if (field.type === 'signature' || field.type === 'initials') return false;
	if (field.type === 'checkbox' || field.type === 'stamp') {
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
	/**
	 * Which half of the flow the customer is in. `configure` is section 1 — read the
	 * quote, tick the line items you want. `agreement` is section 2 — the same
	 * document with the declined items gone, which is the thing that gets rendered
	 * to PDF and signed.
	 */
	const [step, setStep] = useState<'configure' | 'agreement'>('configure');
	const [selections, setSelections] = useState<PricingSelections>({});
	// Mounts the offscreen renderer that measures the fields and sends. Only ever in
	// flight for a few seconds, and only after the customer has confirmed.
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState<string | null>(null);

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
				// Stored choices win over the author's defaults, so returning to a
				// half-configured quote shows what you last picked rather than resetting it.
				setSelections({ ...defaultSelections(result.body), ...(result.body.pricingSelections ?? {}) });
				// A document already sent for signature has nothing left to configure —
				// its PDF was rendered from one specific set of choices and they are now
				// frozen. Landing on section 2 is both correct and less confusing than
				// showing a chooser that refuses to move.
				if (result.document.signatureRequested) setStep('agreement');
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

	/**
	 * Reconciles this recipient's status against Zoho Sign and repaints.
	 *
	 * Used in two places, for the same reason: our own database only learns about a
	 * signature when Zoho Sign's webhook arrives, and anything that reads it before
	 * then reports a signed document as unsigned. Zoho Sign itself always knows.
	 *
	 * Silent on failure by design — this only ever *upgrades* what's on screen, so a
	 * failed reconcile leaves the page exactly as it already was. There is nothing
	 * to tell the recipient and nothing for them to do about it.
	 */
	const refreshSigningStatus = useCallback(async () => {
		if (!documentId || !token) return;
		try {
			const fresh = await syncSigningStatus(documentId, token);
			setRecipientStatus(fresh.recipientStatus);
		} catch {
			// Deliberately swallowed — see above.
		}
	}, [documentId, token]);

	/**
	 * One reconcile on load, and only when it could tell us something new.
	 *
	 * Gated on being registered with Zoho Sign and *not* already finished, which is
	 * exactly the window where our stored status can be stale — a webhook that was
	 * delayed, dropped, or never configured. A recipient who has already signed
	 * never triggers this again, so the steady-state cost is nothing, and a document
	 * nobody sent for signature never triggers it at all.
	 *
	 * This is what makes a lost webhook survivable rather than permanent: before it,
	 * a signed document whose webhook went missing showed its signature boxes as
	 * unsigned forever, still inviting a signature Zoho Sign would refuse.
	 */
	useEffect(() => {
		if (status !== 'ready' || !data) return;
		if (!data.document.awaitingSignature) return;
		if (recipientStatus === 'completed' || recipientStatus === 'declined') return;
		void refreshSigningStatus();
		// Deliberately keyed on the load, not on `recipientStatus` — this is a
		// one-shot catch-up, and the panel's own poll covers everything after it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status, data, refreshSigningStatus]);

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

	/**
	 * Whether this document goes through configure → review → sign at all.
	 *
	 * Narrower than "has fields Zoho Sign could place": a quote with a text box and
	 * no signature line is a questionnaire, and putting it through a signing
	 * ceremony would be theatre. Those keep the older fill-in-and-submit form
	 * unchanged.
	 */
	const isSigningDocument = needsSignature(data.body);
	const locked = data.document.signatureRequested;
	const canChoose = hasRecipientChoices(data.body) && !locked;
	// Section 1 renders this: every row still present, unticked ones merely excluded
	// from the total, because a hidden row is one you cannot choose.
	const configuredBody = applyPricingSelections(data.body, selections);
	// Section 2 renders this, and it is what gets rendered to PDF and signed:
	// declined rows are gone, not greyed.
	const agreementBody = configuredBodyForAgreement(data.body, selections);
	const shownBody = step === 'agreement' ? agreementBody : configuredBody;
	const agreementTotals = computeTotals(agreementBody);
	const groupProblems = unsatisfiedGroups(data.body, selections);

	const myFields = collectAllFields(data.body).filter((field) => field.roleId === data.recipient.roleId);
	const isFrozen = recipientStatus === 'completed' || recipientStatus === 'declined';
	// `awaitingSignature` is really "this recipient is registered with Zoho Sign",
	// and it stays true after they sign — the backend never clears the ids. That's
	// what lets this page tell a *signed* document from one whose fields were
	// merely submitted, without needing a new field from the API.
	const registeredWithSign = data.document.awaitingSignature;
	const missingRequired = myFields.filter((field) => isRequiredFieldMissing(field, fieldValues[field.id]));
	/**
	 * Section 1's chooser. Given only in the `configure` step and only when the
	 * document is unlocked — its absence is what makes section 2 and the print tree
	 * render the configured *result* rather than a set of controls.
	 */
	const pricingInteraction: PricingInteraction | undefined =
		step === 'configure' && canChoose
			? { selections, onChange: setSelections, selectable: selectableItemIds(data.body), readOnly: locked || isFrozen }
			: undefined;
	const fieldInteraction: FieldInteraction = {
		fieldValues,
		onFieldChange: (fieldId, value) => setFieldValues((prev) => ({ ...prev, [fieldId]: value })),
		readOnly: isFrozen,
		// Always set here, `not-sent` included — this is a real document, and that
		// alone is what a signature box needs to know to stop pretending. Leaving it
		// undefined when Zoho Sign hadn't heard of the document made the box fall
		// through to the template editor's preview toggle, which is the bug this
		// page existed to avoid. Note it also stays set *after* signing: the box has
		// to be able to say "Signed" rather than fall back to looking empty.
		signing: {
			status: !registeredWithSign
				? 'not-sent'
				: recipientStatus === 'completed'
					? 'signed'
					: recipientStatus === 'declined'
						? 'declined'
						: 'awaiting',
			open: () => setSigningOpen(true),
		},
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

	/**
	 * End of section 1: save the choices, then move to the agreement.
	 *
	 * Saving first, and refusing to advance if it fails, is deliberate. Section 2
	 * renders the agreement from `selections` held in this component, but the PDF is
	 * built by the **server** from the stored ones — so advancing on a failed save
	 * would show the customer one thing and sign another.
	 */
	async function handleContinueToAgreement() {
		if (groupProblems.length > 0) return;
		setSubmitting(true);
		setActionError(null);
		try {
			if (canChoose) await saveSelections(documentId!, token!, selections);
			setStep('agreement');
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : 'Could not save your choices.');
		} finally {
			setSubmitting(false);
		}
	}

	/**
	 * Section 2's confirm: renders the agreement, sends it to Zoho Sign, and opens
	 * the signing panel.
	 *
	 * This is the moment the record is created — deliberately *after* the customer
	 * has chosen, which is the whole point of the flow. It replaced sending at
	 * document creation, where the PDF necessarily predated every choice in it.
	 */
	function handleConfirmAndSign() {
		setPrepareError(null);
		setPreparing(true);
	}

	async function handleSendFinished(error: string | null) {
		setPreparing(false);
		if (error) {
			setPrepareError(error);
			return;
		}
		// Re-read rather than assume: the send stored `sign_request_id` and this
		// recipient's `sign_action_id`, and the panel cannot mint an embed token until
		// both are visible here.
		try {
			const fresh = await getPublicDocument(documentId!, token!);
			setData(fresh);
			setRecipientStatus(fresh.recipient.status);
			if (fresh.document.awaitingSignature) setSigningOpen(true);
		} catch {
			// The document is sent regardless; a failed refetch just means the customer
			// presses the sign button themselves rather than the panel opening for them.
			setPrepareError('Your document is ready, but the page could not refresh. Reload to sign.');
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
			{/* Only for documents that actually get signed — a plain form has one step
			    and numbering it would invent a process that isn't there. */}
			{isSigningDocument && !isFrozen && (
				<ol className="doc-view-steps" aria-label="Progress">
					<li className={step === 'configure' ? 'doc-view-step-current' : 'doc-view-step-done'}>
						1. {canChoose ? 'Choose what you need' : 'Review your quote'}
					</li>
					<li className={step === 'agreement' ? 'doc-view-step-current' : undefined}>2. Review &amp; sign</li>
				</ol>
			)}
			<DocumentPages
				body={shownBody}
				resolveImageSrc={(assetId) => resolvePublicAssetUrl(documentId, token, assetId)}
				viewerRoleId={data.recipient.roleId}
				fieldInteraction={fieldInteraction}
				pricingInteraction={pricingInteraction}
				smartContentContext={smartContentContext}
			/>
			{/* End of section 1. Shown only for documents that get signed and only
			    before anything is locked; a plain form keeps its own Submit below. */}
			{isSigningDocument && step === 'configure' && !locked && !isFrozen && (
				<div className="doc-view-sign-bar">
					<div className="doc-view-continue-summary">
						<p>
							{canChoose ? 'Happy with your selections?' : 'Ready to continue?'} Your total is{' '}
							<strong>{formatMoney(agreementTotals.total, agreementTotals.currency)}</strong>.
						</p>
						{groupProblems.length > 0 && (
							<p className="doc-view-actions-hint" role="alert">
								{groupProblems
									.map((g) => (g.reason === 'none-chosen' ? `Choose an option for ${g.groupName}` : `Choose only one option for ${g.groupName}`))
									.join('; ')}
							</p>
						)}
					</div>
					<button
						type="button"
						className="doc-view-sign-button"
						disabled={submitting || groupProblems.length > 0}
						onClick={() => void handleContinueToAgreement()}
					>
						{submitting ? 'Saving…' : 'Continue'}
					</button>
				</div>
			)}
			{/* Section 2's confirm — the last moment before a record exists. Spelled
			    out, because pressing this is what turns a quote into an agreement. */}
			{isSigningDocument && step === 'agreement' && !locked && !isFrozen && (
				<div className="doc-view-sign-bar">
					<div className="doc-view-continue-summary">
						<p>
							<strong>This is what you&apos;ll sign.</strong> It shows only the items you chose, totalling{' '}
							<strong>{formatMoney(agreementTotals.total, agreementTotals.currency)}</strong>. Once you continue, these choices are fixed.
						</p>
						{prepareError && (
							<p className="doc-view-error" role="alert">
								{prepareError}
							</p>
						)}
					</div>
					<div className="doc-view-actions-buttons">
						<button type="button" onClick={() => setStep('configure')} disabled={preparing}>
							Back
						</button>
						<button type="button" className="doc-view-sign-button" onClick={handleConfirmAndSign} disabled={preparing}>
							{preparing ? 'Preparing your document…' : 'Confirm and sign'}
						</button>
					</div>
				</div>
			)}
			{/* Offscreen, mounted only while the send is in flight. Rendering the
			    agreement is the only way to measure where its signature fields sit, and
			    it is the *agreement* body — declined line items already removed — that
			    becomes the PDF. Nothing here is shown to anybody. */}
			{preparing && (
				<SignatureSender
					documentId={documentId}
					body={agreementBody}
					// Documents aren't paginated (that map is the editor canvas's, and it
					// isn't mounted here), so each authored page is one sheet and
					// `SignatureSender` refuses rather than guess if one overflows.
					blockPageNumbers={new Map()}
					// A recipient has no session: both the send and every image URL have to
					// go through their token-gated routes or the render 401s.
					send={(input) => sendConfiguredForSignature(documentId, token, input)}
					resolveImageSrc={(assetId) => resolvePublicAssetUrl(documentId, token, assetId)}
					onFinished={(error) => void handleSendFinished(error)}
				/>
			)}
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
			{/* The confirmation, in the same place the invitation was.
			    Every signature box already turns green and says "✓ Signed", but those
			    sit wherever the author put them — potentially pages up, and easy to
			    scroll past. This is the one that lands where the recipient was last
			    looking, which is the button they just pressed. */}
			{registeredWithSign && recipientStatus === 'completed' && (
				<div className="doc-view-sign-bar doc-view-sign-bar-signed" role="status">
					<p>
						<span aria-hidden="true">✓ </span>
						<strong>Signed.</strong> Your signature is recorded with Zoho Sign — there&apos;s nothing else to do.
					</p>
				</div>
			)}
			{signingOpen && (
				<SigningPanel
					documentId={documentId}
					token={token}
					// Closing by hand **re-checks**, it doesn't just hide the panel.
					// This was the bug: Zoho Sign posts no completion message, so the
					// panel could only close itself once a webhook had landed — about 8
					// seconds. Long enough that the obvious thing to do is press X, which
					// fired this handler instead of `onSettled` and left the page showing
					// "Click to add your signature" over a document that was already
					// signed, until a full reload. The X closes instantly, as it should,
					// and the answer catches up a moment later.
					onClose={() => {
						setSigningOpen(false);
						void refreshSigningStatus();
					}}
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
						{!isSigningDocument && missingRequired.length > 0 && (
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
							{/* Deliberately absent on a signing document. `submitDocumentFields`
							    marks the recipient `completed`, and on a document with a
							    signature line this page renders `completed` as **Signed** — so
							    Submit was a button that made someone look like they had signed
							    without signing. Signing documents finish through the panel. */}
							{!isSigningDocument && (
								<button type="button" onClick={() => void handleSubmit()} disabled={submitting || missingRequired.length > 0}>
									{submitting ? 'Submitting…' : 'Submit'}
								</button>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

export default DocumentView;

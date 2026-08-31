import apiFetch, { joinUrl } from './client';
import { BACKEND_BASE_URL } from '../config';
import type { DocumentMeta, DocumentRecipient, Money, RoleId, TemplateBody } from '../editor/types';
import type { FieldValue } from '../editor/fields/FieldPreview';

// Same "already camelCase, matches the domain model directly" convention
// templates.ts's own comment describes — routes/documents.js's
// normalize* functions emit exactly these shapes.

export interface CreateDocumentRecipientInput {
	roleId: RoleId;
	roleName: string;
	email: string;
	name: string;
	signingOrder: number | null;
}

export interface CreateDocumentInput {
	title: string;
	sourceTemplateId: string;
	sourceTemplateVersion: number;
	currency: string;
	computedTotal: Money;
	/** Already resolved — variables replaced with literal values, pricing already frozen. See src/documents/resolveVariables.ts. */
	body: DocumentBody;
	recipients: CreateDocumentRecipientInput[];
}

/**
 * A recipient's `token` is only ever present in a response the instant it's
 * (re)generated — `GET /documents/:id` never includes it, matching the
 * backend's "shown once, hashed thereafter" rule (same as a password-reset
 * link).
 */
export interface DocumentRecipientWithToken extends DocumentRecipient {
	token: string;
}

export interface CreateDocumentResult {
	document: DocumentMeta;
	recipients: DocumentRecipientWithToken[];
}

export function createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult> {
	return apiFetch<CreateDocumentResult>('/documents', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

/** Every document, newest first — no folders/tabs/search yet, unlike the Templates list. */
export function listDocuments(): Promise<{ documents: DocumentMeta[] }> {
	return apiFetch<{ documents: DocumentMeta[] }>('/documents');
}

/**
 * One thing that happened to a document, newest first.
 *
 * Separate from `status`, which is overwritten in place and can only ever say
 * where a document is *now*. These say how it got there — when it was sent, when
 * the recipient opened the signing panel, when they signed.
 */
export interface DocumentEvent {
	id: string;
	/** `null` for a document-level event, like being sent. */
	recipientId: string | null;
	eventType: string;
	occurredAt: string | null;
}

export interface GetDocumentResult {
	document: DocumentMeta;
	recipients: DocumentRecipient[];
	/** Empty when nothing has been recorded — the backend writes these best-effort, so an empty list never means an error. */
	events: DocumentEvent[];
	/** The stored body, so the internal view can render the document rather than describe it. */
	body: DocumentBody;
}

export function getDocument(id: string): Promise<GetDocumentResult> {
	return apiFetch<GetDocumentResult>(`/documents/${id}`);
}

/**
 * A real delete — the row, its recipients and its stored body.
 *
 * **Destroys every recipient's link**, unrecoverably: tokens are stored only as
 * hashes, so there is no copy of the link to restore and no regenerating it for a
 * document that no longer exists. Callers must confirm, and say that.
 */
export function deleteDocument(id: string): Promise<{ deleted: boolean }> {
	return apiFetch<{ deleted: boolean }>(`/documents/${id}`, { method: 'DELETE' });
}

export function regenerateRecipientToken(documentId: string, recipientId: string): Promise<{ recipient: DocumentRecipientWithToken }> {
	return apiFetch<{ recipient: DocumentRecipientWithToken }>(`/documents/${documentId}/recipients/${recipientId}/regenerate-token`, {
		method: 'POST',
	});
}

/**
 * A `Document`'s stored body, seen from the recipient side — the same
 * `TemplateBody` shape a template already has, plus `fieldValues`: every
 * field id anyone has submitted so far (see `routes/publicDocumentView.js`'s
 * submit route), keyed by field id. Never filtered per-role in this
 * response — the whole document's *structure* is already visible to every
 * recipient regardless of role (only editing another role's field is
 * blocked), so withholding other roles' already-submitted values here would
 * be an inconsistent, easily-bypassed half-measure rather than a real
 * boundary.
 */
export interface DocumentBody extends TemplateBody {
	fieldValues?: Record<string, FieldValue>;
	/**
	 * The flat variable-key → literal-string map computed once at
	 * document-creation time (`resolveVariables.ts`'s `computeResolvedVariableValues`),
	 * used to freeze every `variable` chip into plain text. That freeze is
	 * one-way — nothing after creation can reconstruct the original values —
	 * so a `SmartContentBlock` rule that gates on a `variable` subject needs
	 * this persisted alongside the frozen body, not just the frozen text
	 * itself. See `src/smartContent/evaluateRules.ts`.
	 */
	resolvedVariableValues?: Record<string, string>;
}

/** What a recipient's own unauthenticated link resolves to — deliberately a much narrower shape than `GetDocumentResult`: no other recipient's name/email/token, no `sourceTemplateId`/`version`/audit fields. */
export interface PublicDocumentView {
	document: {
		id: string;
		title: string;
		currency: string;
		computedTotal: Money;
		/** True once the sender has sent this for signature *and* this recipient has something to sign — both, since a recipient with no fields is never registered with Zoho Sign. */
		awaitingSignature: boolean;
	};
	recipient: { roleId: RoleId; roleName: string; name: string; status: DocumentRecipient['status'] };
	body: DocumentBody;
}

export function getPublicDocument(documentId: string, token: string): Promise<PublicDocumentView> {
	return apiFetch<PublicDocumentView>(`/public/documents/${documentId}/${encodeURIComponent(token)}`);
}

export interface SubmitFieldsResult {
	recipientStatus: DocumentRecipient['status'];
	documentStatus: DocumentMeta['status'];
}

/** Submits every field value this recipient has filled in so far. The backend re-checks each field id actually belongs to this recipient's own role before accepting it — see `routes/publicDocumentView.js`; nothing here should be trusted as the only enforcement. */
export function submitDocumentFields(documentId: string, token: string, values: Record<string, FieldValue>): Promise<SubmitFieldsResult> {
	return apiFetch<SubmitFieldsResult>(`/public/documents/${documentId}/${encodeURIComponent(token)}/submit`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}

export function declineDocument(documentId: string, token: string): Promise<SubmitFieldsResult> {
	return apiFetch<SubmitFieldsResult>(`/public/documents/${documentId}/${encodeURIComponent(token)}/decline`, {
		method: 'POST',
	});
}

export interface EmbedTokenResult {
	/** Zoho Sign's one-time signing URL, for an iframe. */
	signUrl: string;
	/** Two minutes, per Zoho Sign. Passed through so the UI can offer "try again" rather than showing a blank frame. */
	expiresInSeconds: number;
}

/**
 * A fresh signing URL for this recipient's Zoho Sign panel.
 *
 * **Call this from the click, never on page load.** The URL Zoho Sign returns is
 * single-use and expires after two minutes, so one fetched when the document
 * rendered would be dead by the time anyone scrolled to the bottom of it.
 */
export function requestSigningUrl(documentId: string, token: string): Promise<EmbedTokenResult> {
	return apiFetch<EmbedTokenResult>(`/public/documents/${documentId}/${encodeURIComponent(token)}/embed-token`, {
		method: 'POST',
	});
}

export interface SendForSignatureResult {
	signRequestId: string;
	signers: Array<{ recipientId: string; roleName: string; email: string; fieldCount: number }>;
	/** Recipients with no signable field. Zoho Sign never hears about them; they keep their link and can still read the document. */
	skipped: Array<{ recipientId: string; roleName: string }>;
}

/**
 * Hands a document to Zoho Sign.
 *
 * `html` is the document rendered by the browser that laid it out, and `fields`
 * is that same render measured — see `print/fieldGeometry.ts`. Both come from
 * one offscreen render rather than two, so the coordinates can't disagree with
 * the page they were taken from.
 */
/**
 * Long, because this is the slowest call in the app: a SmartBrowz render plus two
 * Zoho Sign round trips, measured at ~15s against the deployed function.
 *
 * Bounded at all, because the alternative is worse than slow. Against a local
 * `catalyst serve` SmartBrowz doesn't work and the request **never resolves** —
 * the same failure `api/pdf.ts` carries a timeout for. Without one, the create
 * wizard's "Setting up signing…" would sit there forever, and the sender would
 * have no way to learn that the document they just made isn't signable.
 */
const SEND_FOR_SIGNATURE_TIMEOUT_MS = 90_000;

export async function sendForSignature(
	documentId: string,
	input: { html: string; fields: unknown[]; format: 'Letter' | 'A4' }
): Promise<SendForSignatureResult> {
	try {
		return await apiFetch<SendForSignatureResult>(`/documents/${documentId}/send-for-signature`, {
			method: 'POST',
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(SEND_FOR_SIGNATURE_TIMEOUT_MS),
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			throw new Error('Zoho Sign took too long to respond.');
		}
		throw error;
	}
}

/**
 * An `ImageBlock.url` inside a resolved document body is still the relative
 * `/assets/:id/file` path a template uses — that route requires a session, a
 * recipient never has one, so it's resolved through the token-gated public
 * mirror instead (`routes/publicDocumentView.js`'s asset route) rather than
 * `resolveAssetUrl` (see src/api/assets.ts), which would 401.
 */
export function resolvePublicAssetUrl(documentId: string, token: string, assetId: string): string {
	return joinUrl(BACKEND_BASE_URL, `/public/documents/${documentId}/${encodeURIComponent(token)}/assets/${assetId}/file`);
}

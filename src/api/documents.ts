import apiFetch, { joinUrl } from './client';
import { BACKEND_BASE_URL } from '../config';
import type { DocumentMeta, DocumentRecipient, Money, RoleId, TemplateBody } from '../editor/types';

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
	body: TemplateBody;
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

export interface GetDocumentResult {
	document: DocumentMeta;
	recipients: DocumentRecipient[];
}

export function getDocument(id: string): Promise<GetDocumentResult> {
	return apiFetch<GetDocumentResult>(`/documents/${id}`);
}

export function regenerateRecipientToken(documentId: string, recipientId: string): Promise<{ recipient: DocumentRecipientWithToken }> {
	return apiFetch<{ recipient: DocumentRecipientWithToken }>(`/documents/${documentId}/recipients/${recipientId}/regenerate-token`, {
		method: 'POST',
	});
}

/** What a recipient's own unauthenticated link resolves to — deliberately a much narrower shape than `GetDocumentResult`: no other recipient's name/email/token, no `sourceTemplateId`/`version`/audit fields. */
export interface PublicDocumentView {
	document: { id: string; title: string; currency: string; computedTotal: Money };
	recipient: { roleId: RoleId; roleName: string; name: string; status: DocumentRecipient['status'] };
	body: TemplateBody;
}

export function getPublicDocument(documentId: string, token: string): Promise<PublicDocumentView> {
	return apiFetch<PublicDocumentView>(`/public/documents/${documentId}/${encodeURIComponent(token)}`);
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

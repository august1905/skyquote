import type { DocumentEvent } from '../../api/documents';
import type { DocumentRecipient } from '../../editor/types';

/**
 * One row of the Audit trail panel — a `DocumentEvent` translated into
 * something a human can read. Kept pure (no React, no fetch) so the
 * translation table is unit-testable: every event type the backend writes
 * should render as a sentence, not leak through as a raw `event_type`.
 */
export interface AuditEntry {
	id: string;
	/** Visual tone of the entry's dot + label: matches `.audit-entry-<tone>` in documentRail.css. */
	tone: 'created' | 'sent' | 'viewed' | 'signed' | 'completed' | 'declined' | 'neutral';
	label: string;
	description: string;
	occurredAt: string | null;
}

/** `detail` is stored as raw text and is *usually* JSON — but a webhook payload that failed to stringify, or a hand-inserted row, must degrade to "no detail" rather than crash the panel. */
function parseDetail(detail: string | null): Record<string, unknown> {
	if (!detail) return {};
	try {
		const parsed: unknown = JSON.parse(detail);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function toAuditEntries(events: DocumentEvent[], recipients: DocumentRecipient[]): AuditEntry[] {
	const recipientName = (id: string | null): string => {
		if (!id) return '';
		return recipients.find((r) => r.id === id)?.name ?? '';
	};

	return events.map((event) => {
		const detail = parseDetail(event.detail);
		const who = recipientName(event.recipientId);
		const actor = str(detail.userName);
		let tone: AuditEntry['tone'] = 'neutral';
		let label = event.eventType;
		let description = who ? `${who} — ${event.eventType}` : event.eventType;

		switch (event.eventType) {
			case 'document_created':
				tone = 'created';
				label = 'Created';
				description = `${actor || 'Someone'} created this document`;
				break;
			case 'document_viewed':
				tone = 'viewed';
				label = 'Viewed';
				description = who ? `${who} viewed this document` : 'This document was viewed by one of the recipients';
				break;
			case 'recipient_reassigned': {
				const to = detail.to && typeof detail.to === 'object' ? (detail.to as Record<string, unknown>) : {};
				tone = 'neutral';
				label = 'Recipient changed';
				const roleName = str(detail.roleName);
				description = `${actor || 'Someone'} reassigned ${roleName || 'a recipient'}${str(to.name) ? ` to ${str(to.name)}` : ''}`;
				break;
			}
			case 'sent_for_signature':
				tone = 'sent';
				label = 'Sent';
				description = 'Sent for signature';
				break;
			case 'configured_and_sent_for_signature':
				tone = 'sent';
				label = 'Sent';
				description = who ? `${who} confirmed their selections and continued to signing` : 'Selections confirmed and sent for signature';
				break;
			case 'signing_panel_opened':
				tone = 'viewed';
				label = 'Signing opened';
				description = who ? `${who} opened the signing panel` : 'The signing panel was opened';
				break;
			case 'signing_status_reconciled':
				tone = 'neutral';
				label = 'Status updated';
				description = 'Signing status refreshed from Zoho Sign';
				break;
			case 'fields_submitted':
				tone = 'completed';
				label = 'Submitted';
				description = who ? `${who} submitted their responses` : 'Responses were submitted';
				break;
			case 'document_completed':
				tone = 'completed';
				label = 'Completed';
				description = 'Every recipient has finished — document completed';
				break;
			case 'document_declined':
				tone = 'declined';
				label = 'Declined';
				description = who ? `${who} declined this document` : 'This document was declined';
				break;
			// Zoho Sign's webhook event names, recorded verbatim by
			// routes/zohoSignWebhook.js. `RequestSubmitted` isn't in that
			// file's own list but arrives live (seen 2026-09-02) — Zoho Sign
			// sends every enabled event type, not just the ones we map.
			case 'RequestSubmitted':
				tone = 'sent';
				label = 'Sent';
				description = 'The signature request was created in Zoho Sign';
				break;
			case 'RequestViewed':
				tone = 'viewed';
				label = 'Viewed';
				description = who ? `${who} viewed the signature request` : 'The signature request was viewed';
				break;
			case 'RequestSigningSuccess':
			case 'RequestSigned':
				tone = 'signed';
				label = 'Signed';
				description = who ? `${who} signed this document` : 'This document was signed';
				break;
			case 'RequestCompleted':
				tone = 'completed';
				label = 'Completed';
				description = 'All signatures collected — document completed';
				break;
			case 'RequestRejected':
			case 'RequestDeclined':
				tone = 'declined';
				label = 'Declined';
				description = who ? `${who} declined to sign` : 'The signature request was declined';
				break;
			case 'RequestExpired':
				tone = 'neutral';
				label = 'Expired';
				description = 'The signature request expired';
				break;
			case 'RequestRecalled':
				tone = 'neutral';
				label = 'Recalled';
				description = 'The signature request was recalled';
				break;
		}

		return { id: event.id, tone, label, description, occurredAt: event.occurredAt };
	});
}

/**
 * "about 22 hours ago" — PandaDoc-style relative time for the trail. Falls
 * back to a plain date past a week: "3 weeks ago" makes the reader do date
 * math that `Sep 1, 2026` already did.
 */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
	if (!iso) return '';
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return '';
	const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return hours === 1 ? 'about an hour ago' : `about ${hours} hours ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
	return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The panel's "Export as CSV" — the same entries the panel shows, one row per event, oldest first (a spreadsheet reads down the page in time order even though the panel reads up). */
export function auditTrailCsv(entries: AuditEntry[]): string {
	const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
	const header = 'Time,Event,Description';
	const rows = [...entries]
		.reverse()
		.map((entry) => [entry.occurredAt ?? '', entry.label, entry.description].map(escape).join(','));
	return [header, ...rows].join('\n');
}

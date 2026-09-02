import { describe, expect, it } from 'vitest';
import type { DocumentEvent } from '../../api/documents';
import type { DocumentRecipient } from '../../editor/types';
import { auditTrailCsv, formatRelativeTime, toAuditEntries } from './auditTrail';

function first(...args: Parameters<typeof toAuditEntries>) {
	const [entry] = toAuditEntries(...args);
	if (!entry) throw new Error('expected at least one entry');
	return entry;
}

const recipients: DocumentRecipient[] = [
	{
		id: 'r1',
		documentId: 'd1',
		roleId: 'role-client',
		roleName: 'Client',
		contactId: null,
		email: 'mary@example.com',
		name: 'Mary Ellen Weller',
		signingOrder: 1,
		status: 'completed',
	},
];

function event(overrides: Partial<DocumentEvent>): DocumentEvent {
	return { id: 'e1', recipientId: null, eventType: 'unknown', detail: null, occurredAt: '2026-09-01T12:00:00.000Z', ...overrides };
}

describe('toAuditEntries', () => {
	it('names the creator from the event detail, not the recipients list', () => {
		const entry = first(
			[event({ eventType: 'document_created', detail: JSON.stringify({ userName: 'Mariah LaRonge' }) })],
			recipients
		);
		expect(entry.label).toBe('Created');
		expect(entry.tone).toBe('created');
		expect(entry.description).toBe('Mariah LaRonge created this document');
	});

	it('names the recipient on recipient-scoped events', () => {
		const entry = first([event({ eventType: 'document_viewed', recipientId: 'r1' })], recipients);
		expect(entry.description).toBe('Mary Ellen Weller viewed this document');
		expect(entry.tone).toBe('viewed');
	});

	it('maps Zoho Sign webhook names onto signing language', () => {
		const signed = first([event({ eventType: 'RequestSigned', recipientId: 'r1' })], recipients);
		expect(signed.label).toBe('Signed');
		expect(signed.tone).toBe('signed');
		expect(signed.description).toBe('Mary Ellen Weller signed this document');

		const completed = first([event({ eventType: 'RequestCompleted' })], recipients);
		expect(completed.tone).toBe('completed');

		// Not in zohoSignWebhook.js's own list, but arrives live — Zoho Sign
		// sends every enabled event type.
		const submitted = first([event({ eventType: 'RequestSubmitted' })], recipients);
		expect(submitted.label).toBe('Sent');
	});

	it('describes a reassignment from its detail payload', () => {
		const entry = first(
			[
				event({
					eventType: 'recipient_reassigned',
					detail: JSON.stringify({ userName: 'Grayson W', roleName: 'Countersigner', to: { name: 'Mariah LaRonge' } }),
				}),
			],
			recipients
		);
		expect(entry.description).toBe('Grayson W reassigned Countersigner to Mariah LaRonge');
	});

	it('survives unknown event types and malformed detail instead of crashing the panel', () => {
		const unknown = first([event({ eventType: 'SomethingNew', detail: '{not json' })], recipients);
		expect(unknown.label).toBe('SomethingNew');
		expect(unknown.tone).toBe('neutral');
	});
});

describe('formatRelativeTime', () => {
	const now = new Date('2026-09-02T12:00:00.000Z');
	it('reads like PandaDoc at each magnitude', () => {
		expect(formatRelativeTime('2026-09-02T11:59:40.000Z', now)).toBe('just now');
		expect(formatRelativeTime('2026-09-02T11:45:00.000Z', now)).toBe('15 minutes ago');
		expect(formatRelativeTime('2026-09-01T14:00:00.000Z', now)).toBe('about 22 hours ago');
		expect(formatRelativeTime('2026-08-30T12:00:00.000Z', now)).toBe('3 days ago');
	});
	it('falls back to a plain date past a week', () => {
		expect(formatRelativeTime('2026-08-01T12:00:00.000Z', now)).toMatch(/Aug 1, 2026/);
	});
	it('returns empty for null or garbage rather than NaN text', () => {
		expect(formatRelativeTime(null, now)).toBe('');
		expect(formatRelativeTime('not-a-date', now)).toBe('');
	});
});

describe('auditTrailCsv', () => {
	it('emits oldest-first rows with quotes escaped', () => {
		const entries = toAuditEntries(
			[
				event({ id: 'e2', eventType: 'document_viewed', recipientId: 'r1', occurredAt: '2026-09-02T10:00:00.000Z' }),
				event({ id: 'e1', eventType: 'document_created', detail: JSON.stringify({ userName: 'A "B" C' }), occurredAt: '2026-09-01T10:00:00.000Z' }),
			],
			recipients
		);
		const csv = auditTrailCsv(entries);
		const lines = csv.split('\n');
		expect(lines[0]).toBe('Time,Event,Description');
		expect(lines[1]).toContain('2026-09-01');
		expect(lines[1]).toContain('A ""B"" C created this document');
		expect(lines[2]).toContain('2026-09-02');
	});
});

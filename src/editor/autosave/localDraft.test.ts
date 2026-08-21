// @vitest-environment jsdom
// localStorage is a DOM API, so this file opts into jsdom per vitest.config.ts's
// own convention (the suite defaults to 'node' to avoid paying jsdom's cost
// for the many files that are plain logic).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateBody } from '../types';
import { makeBody } from '../commands/testFixtures';
import { clearLocalDraft, describeDraft, readLocalDraft, writeLocalDraft, type LocalDraft } from './localDraft';

function makeDraft(overrides: Partial<LocalDraft> = {}): LocalDraft {
	return {
		templateId: 'template-1',
		baseVersion: 3,
		name: 'Proposal',
		body: makeBody(),
		savedAt: '2026-08-21T12:00:00.000Z',
		...overrides,
	};
}

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('writeLocalDraft / readLocalDraft', () => {
	it('round-trips a draft', () => {
		const draft = makeDraft();
		writeLocalDraft('user-1', draft);
		expect(readLocalDraft('user-1', 'template-1')).toEqual(draft);
	});

	it('returns null when nothing has been written', () => {
		expect(readLocalDraft('user-1', 'template-1')).toBeNull();
	});

	// The reason drafts are keyed by user as well as template: on a shared
	// machine, one person's unsent work must not be offered to the next.
	it('keeps different users’ drafts for the same template apart', () => {
		writeLocalDraft('user-1', makeDraft({ name: 'Mine' }));
		writeLocalDraft('user-2', makeDraft({ name: 'Theirs' }));

		expect(readLocalDraft('user-1', 'template-1')?.name).toBe('Mine');
		expect(readLocalDraft('user-2', 'template-1')?.name).toBe('Theirs');
	});

	it('keeps different templates for the same user apart', () => {
		writeLocalDraft('user-1', makeDraft({ templateId: 'a', name: 'A' }));
		writeLocalDraft('user-1', makeDraft({ templateId: 'b', name: 'B' }));

		expect(readLocalDraft('user-1', 'a')?.name).toBe('A');
		expect(readLocalDraft('user-1', 'b')?.name).toBe('B');
	});

	it('clearLocalDraft removes only the draft it names', () => {
		writeLocalDraft('user-1', makeDraft({ templateId: 'a' }));
		writeLocalDraft('user-1', makeDraft({ templateId: 'b' }));

		clearLocalDraft('user-1', 'a');

		expect(readLocalDraft('user-1', 'a')).toBeNull();
		expect(readLocalDraft('user-1', 'b')).not.toBeNull();
	});
});

describe('readLocalDraft — untrusted input', () => {
	// This data was written by a possibly-older build and is hand-editable in
	// devtools, so it gets validated rather than cast.
	it('drops a draft that isn’t valid JSON, and clears it so it can’t keep failing', () => {
		localStorage.setItem('skyquote:draft:user-1:template-1', '{ not json');
		expect(readLocalDraft('user-1', 'template-1')).toBeNull();
		expect(localStorage.getItem('skyquote:draft:user-1:template-1')).toBeNull();
	});

	it('drops a draft missing required fields rather than half-trusting it', () => {
		localStorage.setItem('skyquote:draft:user-1:template-1', JSON.stringify({ templateId: 'template-1' }));
		expect(readLocalDraft('user-1', 'template-1')).toBeNull();
	});

	it('drops a draft whose body has no pages array — the one shape the editor would choke on', () => {
		localStorage.setItem(
			'skyquote:draft:user-1:template-1',
			JSON.stringify({ templateId: 'template-1', baseVersion: 1, name: 'x', savedAt: 'now', body: { pages: 'not an array' } })
		);
		expect(readLocalDraft('user-1', 'template-1')).toBeNull();
	});
});

describe('storage failures never break editing', () => {
	it('writeLocalDraft swallows a quota error', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});
		// The assertion is simply that this doesn't throw: a template too large
		// to fit in localStorage must still be editable.
		expect(() => writeLocalDraft('user-1', makeDraft())).not.toThrow();
	});

	it('readLocalDraft returns null when storage itself throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('SecurityError');
		});
		expect(readLocalDraft('user-1', 'template-1')).toBeNull();
	});

	it('clearLocalDraft swallows a storage error', () => {
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('SecurityError');
		});
		expect(() => clearLocalDraft('user-1', 'template-1')).not.toThrow();
	});
});

describe('describeDraft', () => {
	it('is not stale when the draft was based on the server’s current version', () => {
		expect(describeDraft(makeDraft({ baseVersion: 5 }), 5).isStale).toBe(false);
	});

	it('is stale when someone has saved the template since the draft was written', () => {
		expect(describeDraft(makeDraft({ baseVersion: 4 }), 6).isStale).toBe(true);
	});

	it('is not stale when the draft is somehow ahead — a save whose response never arrived, not someone else’s work', () => {
		// Reachable when a save succeeded server-side but the response was lost:
		// the row advanced, this client didn't hear about it. Warning about
		// replacing "their version" would be wrong; it's the user's own.
		expect(describeDraft(makeDraft({ baseVersion: 7 }), 6).isStale).toBe(false);
	});
});

describe('draft bodies are stored whole', () => {
	it('preserves a multi-page body exactly, since the draft is what gets restored into the editor', () => {
		const body: TemplateBody = makeBody();
		writeLocalDraft('user-1', makeDraft({ body }));
		expect(readLocalDraft('user-1', 'template-1')?.body).toEqual(body);
	});
});

import type { TemplateBody } from '../types';

/**
 * §13's data-integrity requirement: "Never lose user content — offline queue
 * for pending saves, restore-from-local-draft on reconnect."
 *
 * Until this existed, a save that failed (offline, a 500, a dropped
 * connection) left the only copy of the user's work in a React store — so
 * closing the tab lost it silently. This keeps a copy on the device instead,
 * written well before any network attempt, and offers it back on next open.
 *
 * **Keyed by user *and* template.** A draft is unsent work belonging to one
 * person; on a shared machine, offering it to whoever opens the template next
 * would be both wrong and a small privacy leak.
 *
 * Every operation swallows its own errors. `localStorage` throws for reasons
 * that have nothing to do with this app being correct — quota exhausted by a
 * large template, Safari private browsing, storage disabled by policy — and
 * none of them should be able to break editing. A draft is a safety net, so
 * failing to write one must never be worse than not having tried.
 */

const KEY_PREFIX = 'skyquote:draft:';

export interface LocalDraft {
	templateId: string;
	/** The server `version` this draft was based on — lets the restore prompt tell "my unsent work" from "work based on a copy the server has since moved past". */
	baseVersion: number;
	name: string;
	body: TemplateBody;
	/** ISO timestamp of when the draft was written, for the restore prompt's "from 3 minutes ago". */
	savedAt: string;
}

function key(userId: string, templateId: string): string {
	return `${KEY_PREFIX}${userId}:${templateId}`;
}

export function writeLocalDraft(userId: string, draft: LocalDraft): void {
	try {
		localStorage.setItem(key(userId, draft.templateId), JSON.stringify(draft));
	} catch {
		// Quota, private browsing, storage disabled — see the module comment.
		// Deliberately silent: the user is mid-edit and there is nothing they
		// could usefully do about it.
	}
}

export function readLocalDraft(userId: string, templateId: string): LocalDraft | null {
	let raw: string | null;
	try {
		raw = localStorage.getItem(key(userId, templateId));
	} catch {
		return null;
	}
	if (!raw) return null;

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isLocalDraft(parsed)) {
			// Written by an older shape, or corrupted. Dropped rather than
			// half-trusted — a malformed draft restored into the editor would
			// be worse than no draft at all.
			clearLocalDraft(userId, templateId);
			return null;
		}
		return parsed;
	} catch {
		clearLocalDraft(userId, templateId);
		return null;
	}
}

export function clearLocalDraft(userId: string, templateId: string): void {
	try {
		localStorage.removeItem(key(userId, templateId));
	} catch {
		// Same reasoning as writeLocalDraft.
	}
}

/**
 * Structural check rather than a cast. This data crosses a real trust
 * boundary — it was written by a possibly-older build of this app and can be
 * edited by hand in devtools — so it gets the same treatment as anything else
 * coming from outside (see `getBlockRegistryEntry`'s note on why blocks from
 * Stratus degrade instead of throwing).
 */
function isLocalDraft(value: unknown): value is LocalDraft {
	if (typeof value !== 'object' || value === null) return false;
	const draft = value as Partial<LocalDraft>;
	return (
		typeof draft.templateId === 'string' &&
		typeof draft.baseVersion === 'number' &&
		typeof draft.name === 'string' &&
		typeof draft.savedAt === 'string' &&
		typeof draft.body === 'object' &&
		draft.body !== null &&
		Array.isArray(draft.body.pages)
	);
}

/**
 * Whether a stored draft is worth offering back.
 *
 * A draft is only interesting if it holds work the server hasn't got. The
 * autosave clears it on every successful save, so a draft that still exists
 * *is* unsent work — with one exception worth handling explicitly: a draft
 * whose `baseVersion` is behind the server's current version was based on a
 * copy someone has since saved over. That's still offered (discarding
 * someone's work silently is the one outcome this module exists to prevent),
 * but the caller can warn that restoring will replace newer content.
 */
export function describeDraft(draft: LocalDraft, serverVersion: number): { isStale: boolean } {
	return { isStale: draft.baseVersion < serverVersion };
}

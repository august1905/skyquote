import apiFetch from './client';
import type { TemplateMeta, TemplateBody } from '../editor/types';

// Unlike auth.ts/adminUsers.ts, these response shapes are already camelCase —
// routes/templates.js's normalizeTemplateMeta emits exactly the TemplateMeta
// shape the editor's domain model expects, rather than mirroring Data Store
// column names the way the older auth routes do. New domain data gets to
// match its consumer; the auth routes stay snake_case because changing them
// would touch code that's already deployed and tested.

export interface TemplateEnvelope {
	meta: TemplateMeta;
	body: TemplateBody;
}

export function createTemplate(input: { name?: string } = {}): Promise<TemplateEnvelope> {
	return apiFetch<TemplateEnvelope>('/templates', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

export function getTemplate(id: string): Promise<TemplateEnvelope> {
	return apiFetch<TemplateEnvelope>(`/templates/${id}`);
}

export interface SaveTemplateInput {
	/** The version last read — the save fails with a 409 ApiError if it's stale. */
	version: number;
	name?: string;
	body: TemplateBody;
}

/**
 * Rejects with an `ApiError` whose `.status` is 409 if `version` is stale —
 * see routes/templates.js's optimistic-concurrency check (spec §9.2). The
 * conflict body also carries `current_version`, which a caller could use to
 * decide whether to reload or offer an overwrite; not surfaced as a typed
 * field yet because nothing reads it until the autosave conflict UI exists.
 */
export function saveTemplate(id: string, input: SaveTemplateInput): Promise<{ meta: TemplateMeta }> {
	return apiFetch<{ meta: TemplateMeta }>(`/templates/${id}`, {
		method: 'PUT',
		body: JSON.stringify(input),
	});
}

/**
 * §12's exclusive edit lock. Grayson's decision (2026-08-21): one editor at a
 * time, everyone else refused entry — deliberately simpler than the spec's
 * suggested presence + soft locking, and simpler than real-time co-editing,
 * which is explicitly not wanted.
 */
export interface TemplateLock {
	userId: string;
	userName: string;
	/** When the current holder first took the lock — preserved across heartbeats, so "editing since" stays meaningful. */
	acquiredAt: string;
}

/**
 * Takes the lock, or refreshes it if already held by this user — one call for
 * both, since a heartbeat needs exactly the same "am I still the holder"
 * check as acquiring.
 *
 * Throws `ApiError` with status 409 when someone else holds it; the message is
 * already human-readable ("Sam is editing this template"), so callers don't
 * need to reassemble it from the body.
 */
export function acquireTemplateLock(id: string): Promise<{ lock: TemplateLock }> {
	return apiFetch<{ lock: TemplateLock }>(`/templates/${id}/lock`, { method: 'POST' });
}

/**
 * Releases the lock. `keepalive` so the request still goes out when this is
 * fired from a page-unload path — without it the browser cancels in-flight
 * fetches as the page tears down, and the lock would sit there until its
 * heartbeat went stale.
 */
export function releaseTemplateLock(id: string): Promise<void> {
	return apiFetch<void>(`/templates/${id}/lock`, { method: 'DELETE', keepalive: true });
}

/** Who holds the lock, if anyone — for the blocked screen to poll without *attempting* to take it (which would let a background tab silently steal it the moment it went stale). */
export function readTemplateLock(id: string): Promise<{ lock: TemplateLock | null }> {
	return apiFetch<{ lock: TemplateLock | null }>(`/templates/${id}/lock`);
}

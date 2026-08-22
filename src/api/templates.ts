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

/** A user's display name, for the list's Owner column. Sent as a separate map so twenty templates by one person carry their name once. */
export interface TemplateOwner {
	id: string;
	name: string;
}

export interface TemplateListResponse {
	templates: TemplateMeta[];
	owners: TemplateOwner[];
}

/**
 * Every non-archived template, metadata only — no bodies, so the list page
 * costs one request no matter how many templates exist.
 *
 * Unsorted as far as callers should be concerned: the page groups by folder, so
 * the query order isn't the visible order. Sort with `sortTemplates`.
 */
export function listTemplates(): Promise<TemplateListResponse> {
	return apiFetch<TemplateListResponse>('/templates');
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
 * §3's header ⋮ "Rename" and "Move" — metadata only.
 *
 * Deliberately not `saveTemplate`: that needs the whole body and a matching
 * `version`, so moving a template between folders would otherwise have to
 * upload its content and could lose a race with an in-flight autosave. This
 * doesn't bump `version` at all, which is why a move can't invalidate a
 * colleague's pending save.
 *
 * `folderId: null` means the root, which is a real destination.
 */
export function patchTemplate(id: string, patch: { name?: string; folderId?: string | null }): Promise<{ meta: TemplateMeta }> {
	return apiFetch<{ meta: TemplateMeta }>(`/templates/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
}

/**
 * §3's header ⋮ "Delete" — **archives**, so it's reversible.
 *
 * The backend sets `archived_time`, which every read path already treats as
 * gone. From the user's side this is deletion; what it isn't is destruction of
 * somebody's accumulated work on a mis-click. There's no restore UI yet.
 */
export function deleteTemplate(id: string): Promise<{ archived: boolean }> {
	return apiFetch<{ archived: boolean }>(`/templates/${id}`, { method: 'DELETE' });
}

/**
 * §3's header ⋮ "Duplicate", composed from two existing routes rather than a
 * new one: `POST /templates` always creates a blank template, so the copy is
 * created and then saved with the source's body.
 *
 * Block and field ids are **kept as-is**, unlike a Content Library insert which
 * re-ids everything. Ids only have to be unique within one body, and this is a
 * separate template — re-idding would break nothing but would also gain
 * nothing, while making the two copies gratuitously hard to compare.
 */
export async function duplicateTemplate(source: { id: string; name: string }, body: TemplateBody): Promise<TemplateEnvelope> {
	const created = await createTemplate({ name: `Copy of ${source.name}`.slice(0, 255) });
	const { meta } = await saveTemplate(created.meta.id, { version: created.meta.version, body });
	return { meta, body };
}

/** One entry in §3's ⋮ "Version history". Metadata only — a snapshot's body is read only when it's restored. */
export interface TemplateVersion {
	id: string;
	templateId: string;
	/** The template's `version` at the moment the snapshot was taken. */
	version: number;
	/** Set for explicit checkpoints ("Before restore", or whatever the author typed); null for automatic ones. */
	label: string | null;
	createdBy: string;
	createdAt: string;
}

export async function listTemplateVersions(id: string): Promise<TemplateVersion[]> {
	const { versions } = await apiFetch<{ versions: TemplateVersion[] }>(`/templates/${id}/versions`);
	return versions;
}

/** An explicit checkpoint. Automatic ones happen every 25 saves; this is for the moment a person actually wants remembered. */
export async function createTemplateVersion(id: string, label?: string): Promise<TemplateVersion> {
	const { version } = await apiFetch<{ version: TemplateVersion }>(`/templates/${id}/versions`, {
		method: 'POST',
		body: JSON.stringify(label ? { label } : {}),
	});
	return version;
}

/** Restores a snapshot, having first snapshotted the current state so the restore is itself undoable. Returns the new current body. */
export function restoreTemplateVersion(id: string, versionId: string): Promise<TemplateEnvelope> {
	return apiFetch<TemplateEnvelope>(`/templates/${id}/versions/${versionId}/restore`, { method: 'POST' });
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

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

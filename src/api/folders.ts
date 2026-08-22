import apiFetch from './client';

export type FolderKind = 'document' | 'template';

export interface Folder {
	id: string;
	name: string;
	kind: FolderKind;
	parentFolderId: string | null;
	createdBy: string;
}

export function listFolders(kind: FolderKind): Promise<Folder[]> {
	return apiFetch<Folder[]>(`/folders?kind=${encodeURIComponent(kind)}`);
}

export function createFolder(input: { name: string; kind: FolderKind; parentFolderId?: string }): Promise<Folder> {
	return apiFetch<Folder>('/folders', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

/** Rename only — re-parenting would need a cycle check and nothing asks for it. */
export function renameFolder(id: string, name: string): Promise<Folder> {
	return apiFetch<Folder>(`/folders/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ name }),
	});
}

/**
 * Deletes an **empty** folder. Rejects with an `ApiError` whose `.status` is 409
 * when it still has contents: cascading would either destroy the templates
 * inside or orphan them against a folder_id that no longer resolves. The 409's
 * message is already human-readable.
 */
export function deleteFolder(id: string): Promise<{ deleted: boolean }> {
	return apiFetch<{ deleted: boolean }>(`/folders/${id}`, { method: 'DELETE' });
}

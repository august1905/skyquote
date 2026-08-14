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

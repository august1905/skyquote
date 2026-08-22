import apiFetch, { joinUrl } from './client';
import { BACKEND_BASE_URL } from '../config';

// routes/assets.js's normalizeAsset shape.
export interface UploadedAsset {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	/** Null for non-image assets (§3's attachments) — that's what this column pair's nullability is for. */
	width: number | null;
	height: number | null;
	createdAt: string;
	createdBy: string;
}

function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== 'string') {
				reject(new Error('Could not read file'));
				return;
			}
			// readAsDataURL yields "data:image/png;base64,AAAA..." — the backend
			// only wants the payload after the comma; it re-derives the real
			// content type itself from the bytes (see routes/assets.js).
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.readAsDataURL(file);
	});
}

export async function uploadImageAsset(file: File): Promise<UploadedAsset> {
	const dataBase64 = await readFileAsBase64(file);
	return apiFetch<UploadedAsset>('/assets', {
		method: 'POST',
		body: JSON.stringify({ filename: file.name, dataBase64 }),
	});
}

/**
 * §3's Attachments panel. A separate endpoint from {@link uploadImageAsset},
 * not a flag on it: the image route only ever accepts four image signatures
 * (that's its whole security story — see `routes/assets.js`), while this one
 * accepts PDFs, Office files, zip, txt/csv and images. Both land in the same
 * `Assets` table.
 */
export async function uploadFileAsset(file: File): Promise<UploadedAsset> {
	const dataBase64 = await readFileAsBase64(file);
	return apiFetch<UploadedAsset>('/assets/files', {
		method: 'POST',
		body: JSON.stringify({ filename: file.name, dataBase64 }),
	});
}

/**
 * The relative path stored on `ImageBlock.url` — deliberately not the fully
 * resolved absolute URL, so a persisted template doesn't bake in whichever
 * `BACKEND_BASE_URL` happened to be active at upload time (dev vs. prod host
 * differ; see config.ts). {@link resolveAssetUrl} resolves it at render time
 * instead.
 */
export function assetFileRelativePath(assetId: string): string {
	return `/assets/${assetId}/file`;
}

export function resolveAssetUrl(relativePath: string): string {
	return joinUrl(BACKEND_BASE_URL, relativePath);
}

/**
 * The image library — the Images section in the sidebar, and the picker the
 * editor's "Image" block opens.
 *
 * Scoped to images server-side: `Assets` also holds §3's attachment files, and a
 * PDF spec sheet has no business appearing in an image picker. Metadata only; the
 * bytes come from `/assets/:id/file` per tile, which the browser caches for a year
 * (assets are immutable — there's no update-in-place endpoint).
 */
export async function listImageAssets(): Promise<UploadedAsset[]> {
	const { assets } = await apiFetch<{ assets: UploadedAsset[] }>('/assets?kind=image');
	return assets;
}

/**
 * Renames an image. `filename` is also its display name — there's no separate
 * `name` column, and adding one would mean two fields meaning the same thing to
 * everyone but the code. The stored object is keyed by uuid, so renaming can't
 * break a template already pointing at it.
 */
export function renameAsset(id: string, filename: string): Promise<UploadedAsset> {
	return apiFetch<UploadedAsset>(`/assets/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ filename }),
	});
}

/**
 * Deletes an image for real — row and stored object.
 *
 * **Nothing can tell whether it's in use.** An `ImageBlock` holds an `assetId`
 * inside a template's or document's Stratus body and there's no reverse index, so
 * a template already using this image will render a broken one afterwards. Say
 * that in the confirmation rather than implying a safety check that doesn't exist.
 */
export function deleteAsset(id: string): Promise<{ deleted: boolean }> {
	return apiFetch<{ deleted: boolean }>(`/assets/${id}`, { method: 'DELETE' });
}

/** Human-readable size for a library tile. Binary units, matching what an OS file browser shows. */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

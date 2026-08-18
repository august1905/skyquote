import apiFetch, { joinUrl } from './client';
import { BACKEND_BASE_URL } from '../config';

// routes/assets.js's normalizeAsset shape.
export interface UploadedAsset {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	width: number | null;
	height: number | null;
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

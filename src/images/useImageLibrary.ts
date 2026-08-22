import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteAsset, listImageAssets, renameAsset, uploadImageAsset, type UploadedAsset } from '../api/assets';
import { imageFileRejectionReason, prependAsset } from './imageLibrary';

export interface UploadProgressEntry {
	/** Stable across the upload's lifetime — filenames aren't unique, so this can't be the name. */
	key: string;
	filename: string;
	state: 'uploading' | 'done' | 'failed';
	error?: string;
}

/**
 * The image library's data layer, shared by the Images page and the editor's
 * picker so both agree on what "the library" contains and how an upload behaves.
 *
 * Uploads are **sequential, not parallel**. Each file is read into base64 in the
 * browser and posted whole (see `api/assets.ts`), so a ten-file drop fired at once
 * would hold ten decoded copies in memory and race ten multi-megabyte requests
 * through one function. One at a time is also what makes per-file progress mean
 * anything.
 */
export function useImageLibrary() {
	const [assets, setAssets] = useState<UploadedAsset[]>([]);
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [uploads, setUploads] = useState<UploadProgressEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	// Not state: it only has to be unique per upload, and bumping state here would
	// re-render for nothing.
	const uploadKey = useRef(0);
	const cancelled = useRef(false);
	/**
	 * Bumped on every successful write. A `refresh` whose response was already in
	 * flight when a write landed is **discarded**: its list predates the write, so
	 * applying it would either drop a just-uploaded image or resurrect a deleted
	 * one. The write's own state update is the authoritative one.
	 *
	 * This matters more than it looks: the mount effect refetches, StrictMode runs
	 * that effect twice, so two list requests are routinely racing whatever the user
	 * does next.
	 */
	const writeSeq = useRef(0);

	useEffect(() => {
		cancelled.current = false;
		return () => {
			cancelled.current = true;
		};
	}, []);

	const refresh = useCallback(async (first = false) => {
		if (first) setStatus('loading');
		const seqAtStart = writeSeq.current;
		try {
			const loaded = await listImageAssets();
			if (cancelled.current) return;
			// Status still advances — the fetch itself succeeded, so the grid is
			// loaded; only this particular snapshot of it is stale.
			setStatus('ready');
			if (writeSeq.current !== seqAtStart) return;
			setAssets(loaded);
		} catch {
			if (cancelled.current) return;
			// A failed refresh after a successful write leaves the existing grid on
			// screen — stale but usable — rather than replacing it with an error page.
			if (first) setStatus('error');
			else setError('Could not refresh the library.');
		}
	}, []);

	useEffect(() => {
		void refresh(true);
	}, [refresh]);

	/**
	 * Uploads files and returns the assets that made it, newest first — the picker
	 * uses that return value to select a just-uploaded image immediately instead of
	 * making the user find it in the grid.
	 */
	const upload = useCallback(
		async (files: File[]): Promise<UploadedAsset[]> => {
			if (files.length === 0) return [];
			setError(null);

			const queued = files.map((file) => ({ file, key: `upload-${(uploadKey.current += 1)}` }));
			setUploads((current) => [
				...current,
				...queued.map(({ file, key }) => ({ key, filename: file.name, state: 'uploading' as const })),
			]);

			const uploaded: UploadedAsset[] = [];
			for (const { file, key } of queued) {
				// Checked client-side first so an obviously-wrong file fails instantly
				// instead of after a multi-megabyte round trip. The server still decides.
				const rejection = imageFileRejectionReason(file);
				if (rejection) {
					setUploads((current) => current.map((u) => (u.key === key ? { ...u, state: 'failed', error: rejection } : u)));
					continue;
				}
				try {
					const asset = await uploadImageAsset(file);
					if (cancelled.current) return uploaded;
					uploaded.unshift(asset);
					writeSeq.current += 1;
					setUploads((current) => current.map((u) => (u.key === key ? { ...u, state: 'done' } : u)));
					// Prepended rather than waiting for a refetch: the grid is sorted
					// newest-first, and a tile that appears the moment its upload finishes
					// is the whole point of per-file progress. Idempotent — see
					// `prependAsset` for the race it survives.
					setAssets((current) => prependAsset(current, asset));
				} catch (err) {
					if (cancelled.current) return uploaded;
					const message = err instanceof Error ? err.message : 'Upload failed';
					setUploads((current) => current.map((u) => (u.key === key ? { ...u, state: 'failed', error: message } : u)));
				}
			}
			return uploaded;
		},
		[],
	);

	/** Clears finished rows, keeping any that failed — a failure the user hasn't read yet shouldn't vanish. */
	const dismissFinishedUploads = useCallback(() => {
		setUploads((current) => current.filter((u) => u.state === 'failed'));
	}, []);

	const dismissUpload = useCallback((key: string) => {
		setUploads((current) => current.filter((u) => u.key !== key));
	}, []);

	const rename = useCallback(async (id: string, filename: string) => {
		setError(null);
		try {
			const updated = await renameAsset(id, filename);
			writeSeq.current += 1;
			setAssets((current) => current.map((asset) => (asset.id === id ? updated : asset)));
		} catch {
			setError('Could not rename that image.');
		}
	}, []);

	const remove = useCallback(async (id: string) => {
		setError(null);
		try {
			await deleteAsset(id);
			writeSeq.current += 1;
			setAssets((current) => current.filter((asset) => asset.id !== id));
		} catch {
			setError('Could not delete that image.');
		}
	}, []);

	return { assets, status, uploads, error, upload, dismissFinishedUploads, dismissUpload, rename, remove, refresh, setError };
}

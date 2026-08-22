import { useMemo, useState } from 'react';
import type { UploadedAsset } from '../api/assets';
import { useCloseOnEscape } from '../editor/a11y/useCloseOnEscape';
import { ImageDropZone } from './ImageDropZone';
import { ImageGrid } from './ImageGrid';
import { UploadProgressList } from './UploadProgressList';
import { filterImages } from './imageLibrary';
import { useImageLibrary } from './useImageLibrary';
import './imageLibrary.css';
import './imageLibraryPicker.css';

interface ImageLibraryPickerProps {
	onPick: (asset: UploadedAsset) => void;
	onClose: () => void;
}

/**
 * Choose an image from the library — what the editor's "Image" block opens.
 *
 * Grayson, 2026-08-22: "when we click on 'Image' within 'Add block', instead of
 * prompting an upload, it opens something to let us choose from the library."
 * Before this, inserting an image *was* an upload, so the same logo got
 * re-uploaded once per template and no one could reuse anything.
 *
 * Uploading is still here, just no longer the only path: a fresh image is the
 * common case the first time, and sending someone to a different screen to add it
 * and then back again would be worse than a picker that can't. A file dropped
 * here is uploaded, highlighted in the grid, and **not** auto-inserted — the pick
 * stays a deliberate click, because a multi-file drop has no single obvious
 * winner and silently inserting one of them would be a surprise.
 */
export function ImageLibraryPicker({ onPick, onClose }: ImageLibraryPickerProps) {
	const { assets, status, uploads, error, upload, dismissFinishedUploads, dismissUpload } = useImageLibrary();
	const [query, setQuery] = useState('');
	const [justUploadedId, setJustUploadedId] = useState<string | null>(null);

	useCloseOnEscape(true, onClose);

	const visible = useMemo(() => filterImages(assets, query), [assets, query]);
	const searching = query.trim().length > 0;

	async function handleFiles(files: File[]) {
		const uploaded = await upload(files);
		// Highlight the first success so it's findable in a grid of a hundred; the
		// grid scrolls it into view.
		if (uploaded[0]) setJustUploadedId(uploaded[0].id);
	}

	return (
		<div className="image-picker-backdrop" onClick={onClose}>
			<div
				className="image-picker"
				role="dialog"
				aria-modal="true"
				aria-label="Choose an image"
				onClick={(event) => event.stopPropagation()}
			>
				<header className="image-picker-header">
					<div>
						<h2>Choose an image</h2>
						<p>From your library, or upload a new one.</p>
					</div>
					<input
						type="search"
						className="image-picker-search"
						aria-label="Search images"
						placeholder="Search…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<button type="button" className="image-picker-close" aria-label="Close image picker" onClick={onClose}>
						×
					</button>
				</header>

				<div className="image-picker-body">
					<ImageDropZone compact onFiles={(files) => void handleFiles(files)} label="Drop a new image here" />
					<UploadProgressList uploads={uploads} onDismissFinished={dismissFinishedUploads} onDismiss={dismissUpload} />

					{error && (
						<p className="image-picker-error" role="alert">
							{error}
						</p>
					)}

					{status === 'loading' && <p className="image-picker-status">Loading your images…</p>}
					{status === 'error' && (
						<p className="image-picker-status" role="alert">
							Couldn&apos;t load your images.
						</p>
					)}

					{status === 'ready' && visible.length === 0 && (
						<div className="image-library-empty">
							{searching ? (
								<>
									<strong>Nothing matches “{query.trim()}”</strong>
									<span>Try part of a filename.</span>
								</>
							) : (
								<>
									<strong>Your library is empty</strong>
									<span>Drop an image above to add your first one.</span>
								</>
							)}
						</div>
					)}

					{status === 'ready' && visible.length > 0 && <ImageGrid assets={visible} onSelect={onPick} highlightId={justUploadedId} />}
				</div>
			</div>
		</div>
	);
}

import { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { ImageDropZone } from '../images/ImageDropZone';
import { ImageGrid } from '../images/ImageGrid';
import { UploadProgressList } from '../images/UploadProgressList';
import { filterImages } from '../images/imageLibrary';
import { useImageLibrary } from '../images/useImageLibrary';
import '../images/imageLibrary.css';
import './Images.css';

/**
 * The Images library — Grayson, 2026-08-22: "The left sidebar needs an Images
 * section, where we can upload images to a library."
 *
 * Before this, an image only existed as a side effect of inserting one: the
 * editor's Image block prompted a file picker, uploaded, and that was the only
 * time anyone ever saw it. The `Assets` table has held every upload since phase 2
 * with nothing to browse it, so the same logo got re-uploaded per template. Now
 * uploading and using are separate steps, and the editor picks from here (see
 * `images/ImageLibraryPicker`).
 *
 * Deletion is the one sharp edge, surfaced rather than smoothed over: an
 * `ImageBlock` stores an `assetId` inside a template's Stratus body and there's no
 * reverse index, so nothing can say whether an image is in use. The confirmation
 * says exactly that.
 */
function Images() {
	const { assets, status, uploads, error, upload, dismissFinishedUploads, dismissUpload, rename, remove } = useImageLibrary();
	const [query, setQuery] = useState('');

	const visible = useMemo(() => filterImages(assets, query), [assets, query]);
	const searching = query.trim().length > 0;

	return (
		<AppShell>
			<div className="images-page">
				<div className="images-header">
					<div>
						<h1>Images</h1>
						<p className="images-subtitle">
							{assets.length === 0
								? 'Upload once, use anywhere in your templates.'
								: `${assets.length} image${assets.length === 1 ? '' : 's'} · available in every template`}
						</p>
					</div>
					<input
						type="search"
						className="images-search"
						aria-label="Search images"
						placeholder="Search images…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>

				<ImageDropZone onFiles={(files) => void upload(files)} />
				<UploadProgressList uploads={uploads} onDismissFinished={dismissFinishedUploads} onDismiss={dismissUpload} />

				{error && (
					<p className="images-error" role="alert">
						{error}
					</p>
				)}

				{status === 'loading' && <p className="images-status">Loading…</p>}
				{status === 'error' && (
					<p className="images-status" role="alert">
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
								<strong>No images yet</strong>
								<span>Drop a few above — logos, site photos, certifications.</span>
							</>
						)}
					</div>
				)}

				{status === 'ready' && visible.length > 0 && (
					<ImageGrid
						assets={visible}
						onRename={(id, filename) => void rename(id, filename)}
						onDelete={(id) => void remove(id)}
					/>
				)}
			</div>
		</AppShell>
	);
}

export default Images;

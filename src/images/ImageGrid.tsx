import { useEffect, useRef, useState } from 'react';
import { formatFileSize, resolveAssetUrl, type UploadedAsset } from '../api/assets';

interface ImageGridProps {
	assets: UploadedAsset[];
	/**
	 * Picker mode: the whole tile is one button that selects. Without it, tiles are
	 * managed in place (rename/delete) and clicking one does nothing — the Images
	 * page is a library, not a chooser.
	 */
	onSelect?: (asset: UploadedAsset) => void;
	onRename?: (id: string, filename: string) => void;
	onDelete?: (id: string) => void;
	/** Marks the tile a picker just uploaded, so it's findable in a grid of a hundred. */
	highlightId?: string | null;
}

/**
 * The library's tiles.
 *
 * Two modes rather than two components: the tile is the same object either way
 * (thumbnail, name, dimensions, size), and duplicating it would mean two sets of
 * aspect-ratio and truncation rules to keep in step.
 *
 * Thumbnails are the **full image**, scaled by CSS. `Assets.thumbnail_path` exists
 * and is always null — no derivative generation exists yet (see BUILD_STATUS.md) —
 * so a library of large photos costs real bandwidth on first paint. Acceptable
 * because `/assets/:id/file` sets a one-year immutable cache and an asset never
 * changes, so it's a first-visit cost only. Worth revisiting if libraries get big.
 */
export function ImageGrid({ assets, onSelect, onRename, onDelete, highlightId = null }: ImageGridProps) {
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [draftName, setDraftName] = useState('');
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const highlightRef = useRef<HTMLLIElement | null>(null);

	// A just-uploaded tile is prepended to a grid that may be scrolled elsewhere.
	useEffect(() => {
		if (highlightId) highlightRef.current?.scrollIntoView({ block: 'nearest' });
	}, [highlightId]);

	function startRename(asset: UploadedAsset) {
		setConfirmingDeleteId(null);
		setRenamingId(asset.id);
		setDraftName(asset.filename);
	}

	function commitRename(asset: UploadedAsset) {
		const next = draftName.trim();
		setRenamingId(null);
		if (!next || next === asset.filename) return;
		onRename?.(asset.id, next);
	}

	return (
		<ul className="image-grid">
			{assets.map((asset) => {
				const src = resolveAssetUrl(`/assets/${asset.id}/file`);
				const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;
				const isRenaming = renamingId === asset.id;
				const isConfirming = confirmingDeleteId === asset.id;

				return (
					<li
						key={asset.id}
						ref={asset.id === highlightId ? highlightRef : null}
						className={`image-tile${asset.id === highlightId ? ' image-tile-highlight' : ''}`}
					>
						{onSelect ? (
							<button type="button" className="image-tile-thumb image-tile-select" onClick={() => onSelect(asset)}>
								{/* `loading="lazy"` matters here: a picker opens over a grid that
								    may hold a hundred images, and none below the fold are wanted yet. */}
								<img src={src} alt={asset.filename} loading="lazy" />
								<span className="image-tile-select-hint">Insert</span>
							</button>
						) : (
							<div className="image-tile-thumb">
								<img src={src} alt={asset.filename} loading="lazy" />
							</div>
						)}

						<div className="image-tile-meta">
							{isRenaming ? (
								<input
									className="image-tile-rename"
									aria-label={`Rename ${asset.filename}`}
									autoFocus
									value={draftName}
									onChange={(event) => setDraftName(event.target.value)}
									onBlur={() => commitRename(asset)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') commitRename(asset);
										// Escape abandons, rather than letting the blur it causes commit
										// a half-typed name.
										if (event.key === 'Escape') setRenamingId(null);
									}}
								/>
							) : (
								<span className="image-tile-name" title={asset.filename}>
									{asset.filename}
								</span>
							)}
							<span className="image-tile-detail">
								{dimensions && <span>{dimensions}</span>}
								<span>{formatFileSize(asset.sizeBytes)}</span>
							</span>
						</div>

						{(onRename || onDelete) && (
							<div className="image-tile-actions">
								{onRename && !isRenaming && (
									<button type="button" aria-label={`Rename ${asset.filename}`} onClick={() => startRename(asset)}>
										Rename
									</button>
								)}
								{onDelete && !isConfirming && (
									<button
										type="button"
										className="image-tile-danger"
										aria-label={`Delete ${asset.filename}`}
										onClick={() => setConfirmingDeleteId(asset.id)}
									>
										Delete
									</button>
								)}
							</div>
						)}

						{isConfirming && (
							<div className="image-tile-confirm" role="group" aria-label={`Confirm delete ${asset.filename}`}>
								{/* Says what it can't check, rather than implying a safety net that
								    doesn't exist: an ImageBlock stores an assetId inside a template's
								    Stratus body, and there's no reverse index to consult. */}
								<span>Delete this image? Any template already using it will show a broken image.</span>
								<div>
									<button
										type="button"
										onClick={() => {
											setConfirmingDeleteId(null);
											onDelete?.(asset.id);
										}}
									>
										Yes, delete
									</button>
									<button type="button" onClick={() => setConfirmingDeleteId(null)}>
										Keep it
									</button>
								</div>
							</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}

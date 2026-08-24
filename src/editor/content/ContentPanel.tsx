import { useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { INSERTABLE_FIELD_KINDS, createImageBlockFromAsset } from '../blocks/insertable';
import { ImageLibraryPicker } from '../../images/ImageLibraryPicker';
import type { BlockType, Role } from '../types';
import { PaletteTile } from './PaletteTile';
import { usePaletteInsert } from './usePaletteInsert';
import {
	BLOCK_ICONS,
	FIELD_ICONS,
	PALETTE_BLOCK_KINDS,
	clickInsertTargetFor,
	type PaletteDragData,
} from './palette';
import './content.css';

// A stable, module-level empty array — a fresh `[]` literal in the selector
// below would be a new reference every render and defeat zustand's equality
// check, re-rendering the panel on every unrelated store change.
const EMPTY_ROLES: Role[] = [];

/**
 * §3 ④'s Content panel: a BLOCKS palette and a role-scoped FILLABLE FIELDS
 * palette, both of which insert on click (§4.1 path 2) and drag onto the canvas
 * (path 1).
 *
 * The canvas keeps its own "+ Add block" menu — it's how you insert into a
 * specific column or smart-content container, and how you add a block to a page
 * far from the one the selection is on. This panel is the always-available
 * palette the reference product leads with; the two share one insertable-kinds
 * list and one insert path (`palette.ts`, `usePaletteInsert`) rather than being
 * two implementations of insertion.
 */
export function ContentPanel({ onClose }: { onClose: () => void }) {
	const body = useEditorStore((s) => s.body);
	const selection = useEditorStore((s) => s.selection);
	// `body?.roles` directly (not `?? []`): the store's array reference is stable
	// while unchanged, so the effect below only runs on a genuine role change.
	const roles = useEditorStore((s) => s.body?.roles) ?? EMPTY_ROLES;
	const placement = useEditorStore((s) => s.palettePlacement);
	const setPalettePlacement = useEditorStore((s) => s.setPalettePlacement);
	const { insertPaletteItem, insertBlockAt } = usePaletteInsert();

	const [fieldRoleId, setFieldRoleId] = useState(roles[0]?.id ?? '');
	const [videoUrl, setVideoUrl] = useState('');
	const [videoBusy, setVideoBusy] = useState(false);

	// Keeps the selector valid as roles are added and removed in the Recipients
	// panel while this one is open — §6.1 rule 1 means a stale id here would
	// otherwise produce a field nobody owns.
	useEffect(() => {
		if (!roles.some((role) => role.id === fieldRoleId)) setFieldRoleId(roles[0]?.id ?? '');
	}, [roles, fieldRoleId]);

	const selectedRole = roles.find((role) => role.id === fieldRoleId);
	const needsInput = placement?.status === 'needsInput' ? placement : null;

	/** §4.1 path 2 — the same tiles, clicked. Where it lands is `clickInsertTargetFor`'s call. */
	function handleTileClick(drag: PaletteDragData, blockType: BlockType) {
		if (!body) return;
		const target = clickInsertTargetFor(body.pages, selection, blockType);
		if (!target) {
			setPalettePlacement({ status: 'error', message: 'Add a page before inserting blocks.' });
			return;
		}
		insertPaletteItem(drag, target);
	}

	async function handleVideoSubmit() {
		const kind = PALETTE_BLOCK_KINDS.find((candidate) => candidate.type === 'video');
		const url = videoUrl.trim();
		if (!needsInput || !kind?.createFromUrl || !url) return;
		setVideoBusy(true);
		try {
			const block = await kind.createFromUrl(url);
			insertBlockAt(block, needsInput.target);
			setPalettePlacement(null);
			setVideoUrl('');
		} catch (err) {
			setPalettePlacement({ status: 'error', message: err instanceof Error ? err.message : "Couldn't read that video URL." });
		} finally {
			setVideoBusy(false);
		}
	}

	return (
		<div className="content-panel">
			<div className="content-panel-header">
				<h2>Content</h2>
				<button type="button" aria-label="Close content panel" onClick={onClose}>
					×
				</button>
			</div>

			{placement?.status === 'error' && (
				<p className="content-panel-error" role="alert">
					{placement.message}
				</p>
			)}

			<p className="content-panel-section-label">Blocks</p>
			<div className="content-panel-grid">
				{PALETTE_BLOCK_KINDS.map((kind) => (
					<PaletteTile
						key={kind.type}
						id={`palette-block-${kind.type}`}
						label={kind.label}
						icon={BLOCK_ICONS[kind.type] ?? '▢'}
						drag={{ kind: 'paletteBlock', blockType: kind.type }}
						onClick={() => handleTileClick({ kind: 'paletteBlock', blockType: kind.type }, kind.type)}
					/>
				))}
			</div>

			<p className="content-panel-section-label">
				Fillable fields for
				{roles.length > 0 && (
					<span className="content-panel-role-select">
						<span className="content-panel-role-dot" style={{ background: selectedRole?.color ?? 'var(--grey-300)' }} aria-hidden="true" />
						<select value={fieldRoleId} onChange={(e) => setFieldRoleId(e.target.value)} aria-label="Role that new fields belong to">
							{roles.map((role) => (
								<option key={role.id} value={role.id}>
									{role.name}
								</option>
							))}
						</select>
					</span>
				)}
			</p>
			{roles.length === 0 ? (
				// No placeholder tiles: §6.1 rule 1 forbids a field without a role, so
				// there is genuinely nothing to offer until one exists.
				<p className="content-panel-hint">
					Add a recipient in the <strong>Recipients / Roles</strong> panel — every field has to belong to someone.
				</p>
			) : (
				<div className="content-panel-grid">
					{INSERTABLE_FIELD_KINDS.map((kind) => (
						<PaletteTile
							key={kind.fieldType}
							id={`palette-field-${kind.fieldType}`}
							label={kind.label}
							icon={FIELD_ICONS[kind.fieldType]}
							{...(selectedRole ? { tint: selectedRole.color } : {})}
							drag={{ kind: 'paletteField', fieldType: kind.fieldType, roleId: fieldRoleId }}
							onClick={() => handleTileClick({ kind: 'paletteField', fieldType: kind.fieldType, roleId: fieldRoleId }, 'field')}
						/>
					))}
				</div>
			)}

			{/* A Video placement, waiting on its URL. Rendered here rather than as a
			    modal because the tile it came from is right above it, and the
			    destination it's headed for is already decided. */}
			{needsInput?.blockType === 'video' && (
				<form
					className="content-panel-url-form"
					onSubmit={(e) => {
						e.preventDefault();
						void handleVideoSubmit();
					}}
				>
					<label htmlFor="palette-video-url">Video URL</label>
					<input
						id="palette-video-url"
						type="url"
						value={videoUrl}
						placeholder="Paste a YouTube or Vimeo URL"
						onChange={(e) => setVideoUrl(e.target.value)}
						autoFocus
					/>
					<div className="content-panel-url-actions">
						<button type="submit" disabled={!videoUrl.trim() || videoBusy}>
							{videoBusy ? 'Adding…' : 'Add video'}
						</button>
						<button
							type="button"
							onClick={() => {
								setPalettePlacement(null);
								setVideoUrl('');
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{needsInput?.blockType === 'image' && (
				<ImageLibraryPicker
					onPick={(asset) => {
						insertBlockAt(createImageBlockFromAsset(asset), needsInput.target);
						setPalettePlacement(null);
					}}
					onClose={() => setPalettePlacement(null)}
				/>
			)}

			{/* Not decoration — the tiles look like buttons, and drag is the half of
			    §4.1 nothing else on screen would suggest. */}
			<p className="content-panel-hint content-panel-hint-footer">
				Click a tile to insert it{selection?.blockId ? ' after the selected block' : ''}, or drag one onto a page.
			</p>
		</div>
	);
}

import { useEffect, useRef, useState } from 'react';
import {
	INSERTABLE_BLOCK_KINDS,
	INSERTABLE_FIELD_KINDS,
	createFieldBlockOfType,
	createImageBlockFromAsset,
	type InsertableBlockKind,
} from '../blocks/insertable';
import { ImageLibraryPicker } from '../../images/ImageLibraryPicker';
import { useEditorStore } from '../store/editorStore';
import { collectAllFields } from '../fields/collectFields';
// Shared with §3 ④'s Content panel — the same block should never be a 🖼 in one
// place and a 🏞 in the other.
import { BLOCK_ICONS } from '../content/palette';
import type { Block, Role } from '../types';
import './canvas.css';

// A stable, module-level empty-array reference — see the `roles` selector
// below for why a fresh `[]` literal on every render would be a problem.
const EMPTY_ROLES: Role[] = [];

interface AddBlockMenuProps {
	onInsert: (block: Block) => void;
	/** Defaults to every top-level-insertable kind; pass a filtered list (e.g. `COLUMN_INSERTABLE_BLOCK_KINDS`) for a nested "+ Add block" menu. */
	kinds?: InsertableBlockKind[];
}

// §4.1's path 2 ("click a palette tile → insert after the currently selected
// block or at page end"), scoped down to "at page end" — there's no
// persistent Content panel/palette yet (that's the right-rail UI §3
// describes, not built in phase 1 or 2's block-catalog slice), so this is a
// lightweight stand-in reachable from the page itself.
export function AddBlockMenu({ onInsert, kinds = INSERTABLE_BLOCK_KINDS }: AddBlockMenuProps) {
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
	const [errorMessage, setErrorMessage] = useState('');
	const [urlDraft, setUrlDraft] = useState('');
	const [pickingImage, setPickingImage] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const body = useEditorStore((s) => s.body);
	// `body?.roles` directly (not `?? []`) — the store's own array reference
	// is stable across renders when unchanged; a fallback literal `[]` would
	// be a brand-new reference every render whenever `body` is momentarily
	// undefined, defeating the effect below's dependency check.
	const roles = useEditorStore((s) => s.body?.roles) ?? EMPTY_ROLES;
	const [fieldRoleId, setFieldRoleId] = useState(roles[0]?.id ?? '');

	// Keep the selected role valid as roles are added/removed elsewhere
	// (Recipients panel) while this menu happens to be open.
	useEffect(() => {
		if (!roles.some((r) => r.id === fieldRoleId)) setFieldRoleId(roles[0]?.id ?? '');
	}, [roles, fieldRoleId]);

	useEffect(() => {
		if (!open) return;
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [open]);

	/**
	 * Inserts a block, then makes sure the author can actually see it.
	 *
	 * The reveal isn't a nicety. Clicking an item in this menu focuses that
	 * button, and the browser scrolls the nearest scrollable ancestor — the
	 * canvas — to bring the focused element into view. This menu is up to 420px
	 * tall, so on a short canvas that scroll runs to hundreds of pixels and the
	 * block that was just inserted ends up *above* the visible area.
	 *
	 * Measured, not guessed: with the editor toolbar two rows tall (85px, which
	 * is what the font-size slider and the per-side spacing controls made it),
	 * inserting a pricing table scrolled the canvas from 0 to 445 and left the
	 * new block 174px off the top of the canvas. Shrinking the toolbar back to
	 * one row in the same run scrolled 12px and left the block plainly visible.
	 * The toolbar is allowed to be two rows; the block still has to be on screen.
	 *
	 * Centred rather than `block: 'nearest'`, which was tried first and is worse
	 * in a way that isn't obvious: `nearest` parks the new block flush against
	 * the top edge of the canvas, and that edge is dnd-kit's auto-scroll zone.
	 * A pricing table sitting there scrolls itself out from under a catalog item
	 * being dragged into it — visible, and still not usable. Centring puts the
	 * new block clear of both edges.
	 *
	 * Instant rather than smooth: the browser's own focus scroll has already
	 * jumped, and animating a second scroll on top of it reads as the canvas
	 * lurching twice.
	 */
	function insert(block: Block) {
		onInsert(block);
		// Next frame, so the block has been committed to the DOM — and after the
		// browser's focus scroll, so this wins rather than races it.
		requestAnimationFrame(() => {
			document.querySelector(`[data-block-id="${block.id}"]`)?.scrollIntoView({ block: 'center' });
		});
	}

	// Video's oEmbed fetch: a real "working" state to show, and a real failure
	// mode (unsupported provider, not found) to surface, unlike the synchronous
	// `create()` kinds. Image used to share this path when inserting meant
	// uploading; it now picks from the library instead, and the picker owns its
	// own progress and errors.
	async function resolveAndInsert(kind: InsertableBlockKind, run: () => Promise<Block>) {
		setOpen(false);
		setStatus('working');
		setErrorMessage('');
		try {
			const block = await run();
			insert(block);
			setStatus('idle');
		} catch (err) {
			setStatus('error');
			setErrorMessage(err instanceof Error ? err.message : `Could not add ${kind.label.toLowerCase()}`);
		}
	}

	function handleUrlSubmit(kind: InsertableBlockKind) {
		if (!kind.createFromUrl) return;
		const url = urlDraft.trim();
		if (!url) return;
		setUrlDraft('');
		void resolveAndInsert(kind, () => kind.createFromUrl!(url));
	}

	return (
		<div className="canvas-add-block-menu" ref={containerRef}>
			<button type="button" className="canvas-add-block" onClick={() => setOpen((o) => !o)} disabled={status === 'working'}>
				{status === 'working' ? 'Adding…' : '+ Add block'}
			</button>
			{open && (
				<div className="canvas-add-block-options" role="menu">
					<p className="canvas-add-block-section-label">Content</p>
					{kinds.map((kind) => {
						const icon = BLOCK_ICONS[kind.type] ?? '▢';

						if (kind.picksFromLibrary) {
							return (
								<button
									key={kind.type}
									type="button"
									role="menuitem"
									onClick={() => {
										setOpen(false);
										setPickingImage(true);
									}}
								>
									<span className="canvas-add-block-icon" aria-hidden="true">
										{icon}
									</span>
									{kind.label}
								</button>
							);
						}
						if (kind.createFromUrl) {
							return (
								<form
									key={kind.type}
									className="canvas-add-block-url-option"
									onSubmit={(e) => {
										e.preventDefault();
										handleUrlSubmit(kind);
									}}
								>
									<input
										type="url"
										className="canvas-add-block-url-input"
										placeholder={kind.urlPlaceholder ?? 'Paste a URL'}
										value={urlDraft}
										onChange={(e) => setUrlDraft(e.target.value)}
										onClick={(e) => e.stopPropagation()}
									/>
									<button type="submit" disabled={!urlDraft.trim()}>
										{kind.label}
									</button>
								</form>
							);
						}
						return (
							<button
								key={kind.type}
								type="button"
								role="menuitem"
								onClick={() => {
									if (kind.create) insert(kind.create());
									setOpen(false);
								}}
							>
								<span className="canvas-add-block-icon" aria-hidden="true">
									{icon}
								</span>
								{kind.label}
							</button>
						);
					})}
					<div className="canvas-add-block-fields-section">
						{roles.length === 0 ? (
							<p className="canvas-add-block-fields-hint">Add a role (Recipients / Roles panel) before placing fields.</p>
						) : (
							<>
								<label className="canvas-add-block-fields-role">
									<span>Fields for</span>
									<select value={fieldRoleId} onChange={(e) => setFieldRoleId(e.target.value)} onClick={(e) => e.stopPropagation()}>
										{roles.map((role) => (
											<option key={role.id} value={role.id}>
												{role.name}
											</option>
										))}
									</select>
								</label>
								{INSERTABLE_FIELD_KINDS.map((kind) => (
									<button
										key={kind.fieldType}
										type="button"
										role="menuitem"
										onClick={() => {
											if (!body) return;
											insert(createFieldBlockOfType(kind.fieldType, fieldRoleId, collectAllFields(body)));
											setOpen(false);
										}}
									>
										<span className="canvas-add-block-icon" aria-hidden="true">
											{BLOCK_ICONS.field}
										</span>
										{kind.label}
									</button>
								))}
							</>
						)}
					</div>
				</div>
			)}
			{status === 'error' && (
				<p className="canvas-add-block-error" role="alert">
					{errorMessage}
				</p>
			)}
			{pickingImage && (
				<ImageLibraryPicker
					onPick={(asset) => {
						setPickingImage(false);
						insert(createImageBlockFromAsset(asset));
					}}
					onClose={() => setPickingImage(false)}
				/>
			)}
		</div>
	);
}

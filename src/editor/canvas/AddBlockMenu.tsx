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
			onInsert(block);
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
									if (kind.create) onInsert(kind.create());
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
											onInsert(createFieldBlockOfType(kind.fieldType, fieldRoleId, collectAllFields(body)));
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
						onInsert(createImageBlockFromAsset(asset));
					}}
					onClose={() => setPickingImage(false)}
				/>
			)}
		</div>
	);
}

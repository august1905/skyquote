import { useEffect, useState } from 'react';
import { createFolder, listFolders, type Folder } from '../../api/folders';
import { patchTemplate } from '../../api/templates';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { useEditorStore } from '../store/editorStore';
import './header.css';

/**
 * §3 ①'s metadata row: `📁 {folderName}` — "click → move-to-folder dialog".
 *
 * The same control is §3's ⋮ "Move", so the menu triggers this dialog rather
 * than implementing its own; one move flow, two entry points.
 *
 * Moving goes through `PATCH /templates/:id`, not the ordinary save: it's
 * metadata, it doesn't touch the body, and it deliberately doesn't bump
 * `version` — a move shouldn't be able to invalidate a colleague's in-flight
 * autosave. See `api/templates.ts`.
 */
export function TemplateFolderChip({ dialogOpen, onDialogOpenChange }: { dialogOpen: boolean; onDialogOpenChange: (open: boolean) => void }) {
	const meta = useEditorStore((s) => s.meta);
	const advanceSavedMeta = useEditorStore((s) => s.advanceSavedMeta);
	const [folders, setFolders] = useState<Folder[]>([]);
	const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
	const [newFolderName, setNewFolderName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useCloseOnEscape(dialogOpen, () => onDialogOpenChange(false));

	// Fetched when the dialog opens, **and** on mount when this template is
	// actually in a folder — §3 asks for `📁 {folderName}`, and the name lives on
	// the folder row, not on the template. Fetching only on dialog-open was tried
	// first and meant a filed template read "📁 In a folder" until someone opened
	// the dialog, which the e2e caught after a reload. A template at the root
	// needs no request at all, which is the common case.
	const needsFolderName = Boolean(meta?.folderId);
	useEffect(() => {
		if (!dialogOpen && !needsFolderName) return;
		let cancelled = false;
		setStatus('loading');
		setError(null);
		listFolders('template')
			.then((loaded) => {
				if (cancelled) return;
				setFolders(loaded);
				setStatus('idle');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [dialogOpen, needsFolderName]);

	if (!meta) return null;

	const currentFolder = folders.find((folder) => folder.id === meta.folderId);
	// Before the list loads, the chip can only say whether there *is* a folder,
	// not which — the name lives on the folder row, not on the template.
	const chipLabel = meta.folderId ? (currentFolder?.name ?? 'In a folder') : 'All templates';

	async function moveTo(folderId: string | null) {
		setBusy(true);
		setError(null);
		try {
			const { meta: updated } = await patchTemplate(meta!.id, { folderId });
			// `advanceSavedMeta`, not `markSaved`: a move must not clear the dirty
			// flag, or an edit made a moment earlier would never be sent.
			advanceSavedMeta(updated);
			onDialogOpenChange(false);
		} catch {
			setError('Could not move this template.');
		} finally {
			setBusy(false);
		}
	}

	async function createAndMove() {
		const name = newFolderName.trim();
		if (!name) return;
		setBusy(true);
		setError(null);
		try {
			const folder = await createFolder({ name, kind: 'template' });
			setFolders((existing) => [...existing, folder]);
			setNewFolderName('');
			await moveTo(folder.id);
		} catch {
			setError('Could not create that folder.');
			setBusy(false);
		}
	}

	return (
		<>
			<button type="button" className="header-folder-chip" onClick={() => onDialogOpenChange(true)} aria-label={`Folder: ${chipLabel}. Move template`}>
				📁 {chipLabel}
			</button>
			{dialogOpen && (
				<div className="header-dialog-backdrop" onClick={() => onDialogOpenChange(false)}>
					<div className="header-dialog" role="dialog" aria-modal="true" aria-label="Move template" onClick={(event) => event.stopPropagation()}>
						<h2>Move template</h2>
						{status === 'loading' && <p className="header-dialog-hint">Loading folders…</p>}
						{status === 'error' && (
							<p className="header-dialog-error" role="alert">
								Couldn&apos;t load folders.
							</p>
						)}
						<ul className="header-dialog-list">
							<li>
								<button type="button" disabled={busy || !meta.folderId} onClick={() => void moveTo(null)}>
									All templates {meta.folderId ? '' : '(current)'}
								</button>
							</li>
							{folders.map((folder) => (
								<li key={folder.id}>
									<button type="button" disabled={busy || folder.id === meta.folderId} onClick={() => void moveTo(folder.id)}>
										{folder.name} {folder.id === meta.folderId ? '(current)' : ''}
									</button>
								</li>
							))}
						</ul>
						<div className="header-dialog-new">
							<input
								type="text"
								aria-label="New folder name"
								placeholder="New folder…"
								value={newFolderName}
								onChange={(event) => setNewFolderName(event.target.value)}
							/>
							<button type="button" disabled={busy || !newFolderName.trim()} onClick={() => void createAndMove()}>
								Create and move
							</button>
						</div>
						{error && (
							<p className="header-dialog-error" role="alert">
								{error}
							</p>
						)}
						<button type="button" className="header-dialog-close" onClick={() => onDialogOpenChange(false)}>
							Cancel
						</button>
					</div>
				</div>
			)}
		</>
	);
}

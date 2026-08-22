import { useState } from 'react';
import type { Folder } from '../api/folders';
import { useCloseOnEscape } from '../editor/a11y/useCloseOnEscape';
import './dialog.css';

interface MoveToFolderDialogProps {
	/** Every folder of this kind, flat. Sub-folders are shown with their path so two "Commercial"s are distinguishable. */
	folders: Folder[];
	/** `null` is the root — a real destination, not a missing value. */
	currentFolderId: string | null;
	/** What's being moved, for the heading: "Move template", "Move 3 templates". */
	title?: string;
	status: 'idle' | 'loading' | 'error';
	/** Disables every action while a move is in flight, so a double-click can't fire two. */
	busy: boolean;
	error: string | null;
	onMove: (folderId: string | null) => void;
	onCreateAndMove: (name: string) => void;
	onClose: () => void;
}

/**
 * The move-to-folder picker, shared by §3 ①'s header chip (and its ⋮ "Move")
 * and the Templates list page's row menu.
 *
 * Purely presentational: it owns the typed folder name and nothing else. Both
 * callers already hold the folder list for their own reasons — the header fetches
 * it to render `📁 {folderName}`, the list page to draw the tree — and both write
 * the move back through different paths (the editor store's `advanceSavedMeta`
 * versus a list refresh). Sharing the markup rather than the data keeps one move
 * dialog without either caller inheriting the other's state.
 *
 * "Create and move" is one action, not two steps, because filing a template into
 * a folder that doesn't exist yet is the common case the first time anyone
 * organizes anything.
 */
export function MoveToFolderDialog({
	folders,
	currentFolderId,
	title = 'Move template',
	status,
	busy,
	error,
	onMove,
	onCreateAndMove,
	onClose,
}: MoveToFolderDialogProps) {
	const [newFolderName, setNewFolderName] = useState('');
	useCloseOnEscape(true, onClose);

	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	// Nesting is shown as a path rather than indentation: this is a flat list of
	// destinations, and "Proposals / Commercial" answers "which one is this?"
	// without the reader having to track how far a row is pushed in.
	function labelFor(folder: Folder): string {
		const parts = [folder.name];
		const seen = new Set([folder.id]);
		let parentId = folder.parentFolderId;
		while (parentId && !seen.has(parentId)) {
			seen.add(parentId);
			const parent = byId.get(parentId);
			if (!parent) break;
			parts.unshift(parent.name);
			parentId = parent.parentFolderId;
		}
		return parts.join(' / ');
	}

	const sorted = [...folders].sort((a, b) => labelFor(a).localeCompare(labelFor(b), undefined, { numeric: true, sensitivity: 'base' }));

	return (
		<div className="app-dialog-backdrop" onClick={onClose}>
			<div className="app-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
				<h2>{title}</h2>
				{status === 'loading' && <p className="app-dialog-hint">Loading folders…</p>}
				{status === 'error' && (
					<p className="app-dialog-error" role="alert">
						Couldn&apos;t load folders.
					</p>
				)}
				<ul className="app-dialog-list">
					<li>
						<button type="button" disabled={busy || currentFolderId === null} onClick={() => onMove(null)}>
							All templates {currentFolderId === null ? '(current)' : ''}
						</button>
					</li>
					{sorted.map((folder) => (
						<li key={folder.id}>
							<button type="button" disabled={busy || folder.id === currentFolderId} onClick={() => onMove(folder.id)}>
								{labelFor(folder)} {folder.id === currentFolderId ? '(current)' : ''}
							</button>
						</li>
					))}
				</ul>
				<div className="app-dialog-new">
					<input
						type="text"
						aria-label="New folder name"
						placeholder="New folder…"
						value={newFolderName}
						onChange={(event) => setNewFolderName(event.target.value)}
					/>
					<button
						type="button"
						disabled={busy || !newFolderName.trim()}
						onClick={() => {
							onCreateAndMove(newFolderName.trim());
							setNewFolderName('');
						}}
					>
						Create and move
					</button>
				</div>
				{error && (
					<p className="app-dialog-error" role="alert">
						{error}
					</p>
				)}
				<button type="button" className="app-dialog-close" onClick={onClose}>
					Cancel
				</button>
			</div>
		</div>
	);
}

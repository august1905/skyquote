import { useState } from 'react';
import { deleteFolder, type Folder } from '../api/folders';
import { ApiError } from '../api/client';
import { useCloseOnEscape } from '../editor/a11y/useCloseOnEscape';

interface FolderRowMenuProps {
	folder: Folder;
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	onRename: () => void;
	onChanged: () => void;
}

/**
 * A folder row's ⋮ menu: Rename, Delete.
 *
 * Delete only works on an empty folder, and the backend's 409 message is shown
 * verbatim rather than replaced with "couldn't delete" — "that folder still has
 * things in it" tells the user what to do next, where a generic failure leaves
 * them clicking again. Emptying the folder first is what the rule exists for:
 * cascading would either destroy the templates inside or orphan them against a
 * folder_id that no longer resolves (see `routes/folders.js`).
 */
export function FolderRowMenu({ folder, open, onToggle, onClose, onRename, onChanged }: FolderRowMenuProps) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useCloseOnEscape(open, onClose);

	async function remove() {
		setBusy(true);
		setError(null);
		try {
			await deleteFolder(folder.id);
			onClose();
			onChanged();
		} catch (err) {
			setError(err instanceof ApiError && err.status === 409 ? err.message : 'Could not delete that folder.');
			setBusy(false);
		}
	}

	return (
		<div className="templates-menu-anchor">
			<button type="button" aria-label={`More actions for folder ${folder.name}`} aria-expanded={open} onClick={onToggle}>
				⋮
			</button>
			{open && (
				<div className="templates-menu" role="menu">
					<button type="button" role="menuitem" onClick={() => { onClose(); onRename(); }}>
						Rename
					</button>
					<button type="button" role="menuitem" className="templates-menu-danger" disabled={busy} onClick={() => void remove()}>
						{busy ? 'Deleting…' : 'Delete'}
					</button>
					{error && (
						<p className="app-dialog-error" role="alert">
							{error}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

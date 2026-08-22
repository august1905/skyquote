import { useState } from 'react';
import { deleteTemplate, duplicateTemplate, getTemplate } from '../api/templates';
import type { TemplateMeta } from '../editor/types';
import { useCloseOnEscape } from '../editor/a11y/useCloseOnEscape';

interface TemplateRowMenuProps {
	template: TemplateMeta;
	/** Open state is owned by the list, so opening one row's menu closes any other. */
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	/** Switches the row's name cell into an input — the same "rename in place" the editor header does. */
	onRename: () => void;
	onMove: () => void;
	/** Called after a write that changed the list, so the page refetches rather than guessing at the new state. */
	onChanged: () => void;
}

/**
 * A template row's ⋮ menu on the list page: Open, Rename, Move, Duplicate,
 * Delete.
 *
 * The same five actions §3 gives the editor's own ⋮ menu, minus the three that
 * only mean something with a template open (Export PDF, Version history,
 * Settings). Having them here is the point of a list: needing to open a template
 * in order to delete it — the only way round before this — means loading a body,
 * taking the edit lock and being bounced if a colleague already has it, all to
 * throw the thing away.
 *
 * Duplicate reads the body first. `POST /templates` always creates a blank
 * template, so a copy is create-then-save (see `duplicateTemplate`), and the list
 * deliberately holds metadata only.
 */
export function TemplateRowMenu({ template, open, onToggle, onClose, onRename, onMove, onChanged }: TemplateRowMenuProps) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useCloseOnEscape(open, onClose);

	async function duplicate() {
		setBusy('duplicate');
		setError(null);
		try {
			const { body } = await getTemplate(template.id);
			await duplicateTemplate({ id: template.id, name: template.name }, body);
			onClose();
			// Stays on the list rather than opening the copy, unlike the editor's own
			// Duplicate. Someone duplicating from here is organizing, not editing —
			// and the new row appearing is the confirmation that it worked.
			onChanged();
		} catch {
			setError('Could not duplicate that template.');
		} finally {
			setBusy(null);
		}
	}

	async function remove() {
		setBusy('delete');
		setError(null);
		try {
			await deleteTemplate(template.id);
			onClose();
			onChanged();
		} catch {
			setError('Could not delete that template.');
			setBusy(null);
		}
	}

	return (
		<div className="templates-menu-anchor">
			<button type="button" aria-label={`More actions for ${template.name}`} aria-expanded={open} onClick={onToggle}>
				⋮
			</button>
			{open && (
				<div className="templates-menu" role="menu">
					<button type="button" role="menuitem" onClick={() => { onClose(); onRename(); }}>
						Rename
					</button>
					<button type="button" role="menuitem" onClick={() => { onClose(); onMove(); }}>
						Move
					</button>
					<button type="button" role="menuitem" disabled={busy !== null} onClick={() => void duplicate()}>
						{busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
					</button>
					{confirmingDelete ? (
						<div className="templates-menu-confirm">
							<span>Delete this template?</span>
							<button type="button" disabled={busy !== null} onClick={() => void remove()}>
								{busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
							</button>
							<button type="button" onClick={() => setConfirmingDelete(false)}>
								Keep it
							</button>
						</div>
					) : (
						<button type="button" role="menuitem" className="templates-menu-danger" onClick={() => setConfirmingDelete(true)}>
							Delete
						</button>
					)}
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

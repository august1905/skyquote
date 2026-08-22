import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteTemplate, duplicateTemplate } from '../../api/templates';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { useEditorStore } from '../store/editorStore';
import './header.css';

interface TemplateOverflowMenuProps {
	/** §3 lists "Export PDF" and "Settings" in this menu; both are owned by the editor shell, so they're passed in rather than reimplemented. */
	onExportPdf: () => void;
	onOpenSettings: () => void;
	onOpenVersionHistory: () => void;
	onMove: () => void;
	/** Focuses the inline template-name editor — §3's "Rename" is that field, not a separate dialog. */
	onRename: () => void;
	exporting: boolean;
}

/**
 * §3 ①'s "⋮ overflow: Duplicate, Rename, Move, Export PDF, Version history,
 * Settings, Delete."
 *
 * All seven, in the spec's own order. Three of them are entry points to things
 * that already exist elsewhere in the editor — Rename focuses the inline name
 * field, Move opens the folder dialog the `📁` chip opens, Export PDF and
 * Settings are the shell's own actions — because §3 describes *where a user
 * reaches these from*, not seven separate implementations.
 *
 * Delete archives rather than destroying (see `api/templates.ts`), but the menu
 * still says "Delete": that's what the user is doing, and the reversibility is
 * an implementation kindness rather than a different feature. It confirms first,
 * since it's the one item here that ends the editing session.
 */
export function TemplateOverflowMenu({
	onExportPdf,
	onOpenSettings,
	onOpenVersionHistory,
	onMove,
	onRename,
	exporting,
}: TemplateOverflowMenuProps) {
	const navigate = useNavigate();
	const meta = useEditorStore((s) => s.meta);
	const body = useEditorStore((s) => s.body);
	const [open, setOpen] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useCloseOnEscape(open, () => setOpen(false));

	if (!meta || !body) return null;

	function runAndClose(action: () => void) {
		setOpen(false);
		action();
	}

	async function duplicate() {
		setBusy('duplicate');
		setError(null);
		try {
			const created = await duplicateTemplate({ id: meta!.id, name: meta!.name }, body!);
			setOpen(false);
			// Navigating to the copy is the point of duplicating — the alternative
			// (a toast saying it happened somewhere else) leaves the user to go find it.
			void navigate(`/templates/${created.meta.id}/edit`);
		} catch {
			setError('Could not duplicate this template.');
		} finally {
			setBusy(null);
		}
	}

	async function remove() {
		setBusy('delete');
		setError(null);
		try {
			await deleteTemplate(meta!.id);
			setOpen(false);
			void navigate('/templates');
		} catch {
			setError('Could not delete this template.');
			setBusy(null);
		}
	}

	return (
		<div className="header-overflow-anchor">
			<button type="button" aria-label="More template actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
				⋮
			</button>
			{open && (
				<div className="header-overflow-menu" role="menu">
					<button type="button" role="menuitem" disabled={busy !== null} onClick={() => void duplicate()}>
						{busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
					</button>
					<button type="button" role="menuitem" onClick={() => runAndClose(onRename)}>
						Rename
					</button>
					<button type="button" role="menuitem" onClick={() => runAndClose(onMove)}>
						Move
					</button>
					<button type="button" role="menuitem" disabled={exporting} onClick={() => runAndClose(onExportPdf)}>
						Export PDF
					</button>
					<button type="button" role="menuitem" onClick={() => runAndClose(onOpenVersionHistory)}>
						Version history
					</button>
					<button type="button" role="menuitem" onClick={() => runAndClose(onOpenSettings)}>
						Settings
					</button>
					{confirmingDelete ? (
						<div className="header-overflow-confirm">
							<span>Delete this template?</span>
							<button type="button" disabled={busy !== null} onClick={() => void remove()}>
								{busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
							</button>
							<button type="button" onClick={() => setConfirmingDelete(false)}>
								Keep it
							</button>
						</div>
					) : (
						<button type="button" role="menuitem" className="header-overflow-danger" onClick={() => setConfirmingDelete(true)}>
							Delete
						</button>
					)}
					{error && (
						<p className="header-dialog-error" role="alert">
							{error}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

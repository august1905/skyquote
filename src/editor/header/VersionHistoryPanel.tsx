import { useEffect, useState } from 'react';
import { createTemplateVersion, listTemplateVersions, restoreTemplateVersion, type TemplateVersion } from '../../api/templates';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { useEditorStore } from '../store/editorStore';
import './header.css';

/** Absolute, not relative — a history panel is often left open, and "3 minutes ago" quietly stops being true. */
function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * §3's header ⋮ "Version history".
 *
 * Snapshots come from two places (see `utils/templateVersions.js`): automatic
 * checkpoints every 25 saves, and explicit ones the author asks for. The panel
 * shows both, distinguishing them by label, because "the version I saved before
 * rewriting the pricing section" and "some point during Tuesday" are different
 * kinds of useful.
 *
 * Restoring replaces the live body, and the backend snapshots the pre-restore
 * state first so the restore is itself undoable — worth knowing, and stated in
 * the UI, because "restore" otherwise reads as destructive.
 */
export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
	const meta = useEditorStore((s) => s.meta);
	const loadTemplate = useEditorStore((s) => s.loadTemplate);
	const [versions, setVersions] = useState<TemplateVersion[]>([]);
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [label, setLabel] = useState('');

	useCloseOnEscape(true, onClose);

	const templateId = meta?.id;

	useEffect(() => {
		if (!templateId) return;
		let cancelled = false;
		setStatus('loading');
		listTemplateVersions(templateId)
			.then((loaded) => {
				if (cancelled) return;
				setVersions(loaded);
				setStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [templateId]);

	if (!meta) return null;

	async function saveVersion() {
		setBusy(true);
		setError(null);
		try {
			const created = await createTemplateVersion(meta!.id, label.trim() || undefined);
			setVersions((existing) => [created, ...existing]);
			setLabel('');
		} catch {
			setError('Could not save a version.');
		} finally {
			setBusy(false);
		}
	}

	async function restore(version: TemplateVersion) {
		setBusy(true);
		setError(null);
		try {
			const restored = await restoreTemplateVersion(meta!.id, version.id);
			// `loadTemplate`, not a body patch: the restored body is a new starting
			// point, so undo entries captured against the old one would be
			// meaningless — exactly the reasoning `restoreDraftBody` uses.
			loadTemplate(restored.meta, restored.body);
			// The pre-restore snapshot the backend just took belongs in the list.
			setVersions(await listTemplateVersions(meta!.id));
		} catch {
			setError('Could not restore that version.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="app-dialog-backdrop" onClick={onClose}>
			<div className="app-dialog" role="dialog" aria-modal="true" aria-label="Version history" onClick={(event) => event.stopPropagation()}>
				<h2>Version history</h2>
				<p className="app-dialog-hint">
					Checkpoints are saved automatically as you work. Restoring keeps a copy of the current version first, so you can always come back.
				</p>

				<div className="app-dialog-new">
					<input
						type="text"
						aria-label="Version label"
						placeholder="Label this version (optional)…"
						value={label}
						onChange={(event) => setLabel(event.target.value)}
					/>
					<button type="button" disabled={busy} onClick={() => void saveVersion()}>
						Save a version
					</button>
				</div>

				{status === 'loading' && <p className="app-dialog-hint">Loading history…</p>}
				{status === 'error' && (
					<p className="app-dialog-error" role="alert">
						Couldn&apos;t load version history.
					</p>
				)}
				{status === 'ready' && versions.length === 0 && <p className="app-dialog-hint">No saved versions yet.</p>}

				<ul className="header-version-list">
					{versions.map((version) => (
						<li key={version.id}>
							<span className="header-version-meta">
								<strong>{version.label ?? `Version ${version.version}`}</strong>
								<span>{formatTimestamp(version.createdAt)}</span>
							</span>
							<button type="button" disabled={busy} onClick={() => void restore(version)}>
								Restore
							</button>
						</li>
					))}
				</ul>

				{error && (
					<p className="app-dialog-error" role="alert">
						{error}
					</p>
				)}
				<button type="button" className="app-dialog-close" onClick={onClose}>
					Close
				</button>
			</div>
		</div>
	);
}

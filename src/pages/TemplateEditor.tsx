import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTemplate } from '../api/templates';
import { TemplateCanvas } from '../editor/canvas/TemplateCanvas';
import { useEditorStore } from '../editor/store/editorStore';
import AppShell from '../components/AppShell';
import LoadingSpinner from '../components/LoadingSpinner';
import './TemplateEditor.css';

// This is the phase 1 editor shell — enough header to load a template, see
// its name, and undo/redo. The spec's full header/toolbar/right rail/content
// panel are a later phase; don't mistake this for that.
function TemplateEditor() {
	const { id } = useParams<{ id: string }>();
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const loadTemplate = useEditorStore((s) => s.loadTemplate);
	const meta = useEditorStore((s) => s.meta);
	const undo = useEditorStore((s) => s.undo);
	const redo = useEditorStore((s) => s.redo);
	const canUndo = useEditorStore((s) => s.undoStack.length > 0);
	const canRedo = useEditorStore((s) => s.redoStack.length > 0);

	useEffect(() => {
		if (!id) return;
		// Guards against a stale response calling loadTemplate() after a newer
		// one already has — without this, a fetch that resolves after the
		// component has moved on (StrictMode's dev-only double-invoke on
		// mount, or a real navigation to a different template before this one
		// finished loading) silently overwrites in-progress edits with
		// whatever the stale request fetched. Caught this via an intermittent
		// e2e failure where the canvas reset to the pristine unsaved template
		// mid-test; it reproduced reliably under StrictMode, which double-
		// invokes exactly this effect on mount.
		let cancelled = false;
		setStatus('loading');
		getTemplate(id)
			.then(({ meta: templateMeta, body }) => {
				if (cancelled) return;
				loadTemplate(templateMeta, body);
				setStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [id, loadTemplate]);

	if (status === 'loading') {
		return (
			<AppShell>
				<LoadingSpinner fullPage />
			</AppShell>
		);
	}

	if (status === 'error' || !meta) {
		return (
			<AppShell>
				<p role="alert">Couldn&apos;t load this template.</p>
			</AppShell>
		);
	}

	return (
		<AppShell>
			<div className="template-editor">
				<div className="template-editor-header">
					<h1>{meta.name}</h1>
					<div className="template-editor-header-actions">
						<button type="button" onClick={undo} disabled={!canUndo}>
							Undo
						</button>
						<button type="button" onClick={redo} disabled={!canRedo}>
							Redo
						</button>
					</div>
				</div>
				<TemplateCanvas />
			</div>
		</AppShell>
	);
}

export default TemplateEditor;

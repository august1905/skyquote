import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTemplate } from '../api/templates';
import { TemplateCanvas } from '../editor/canvas/TemplateCanvas';
import { useAutosave, type AutosaveStatus } from '../editor/autosave/useAutosave';
import { useEditorStore } from '../editor/store/editorStore';
import { RightRail } from '../editor/rightrail/RightRail';
import { TemplateNameEditor } from '../editor/header/TemplateNameEditor';
import { ValidationIndicator } from '../editor/validation/ValidationIndicator';
import AppShell from '../components/AppShell';
import LoadingSpinner from '../components/LoadingSpinner';
import './TemplateEditor.css';

// 'conflict' isn't here on purpose — it gets the banner below instead of a
// status label. Typed against a full mapping (rather than `Record<string,
// string>`) so adding a new AutosaveStatus without deciding its label here
// is a compile error, not a silently blank status line.
const AUTOSAVE_STATUS_LABEL: Record<Exclude<AutosaveStatus, 'conflict'>, string> = {
	idle: '',
	saving: 'Saving…',
	saved: 'All changes saved',
	error: 'Save failed — will retry on your next edit',
};

// This is the phase 1 editor shell — enough header to load a template, see
// its name, undo/redo, and autosave status. The spec's full header/toolbar/
// right rail/content panel are a later phase; don't mistake this for that.
function TemplateEditor() {
	const { id } = useParams<{ id: string }>();
	const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const loadTemplate = useEditorStore((s) => s.loadTemplate);
	const meta = useEditorStore((s) => s.meta);
	const undo = useEditorStore((s) => s.undo);
	const redo = useEditorStore((s) => s.redo);
	const canUndo = useEditorStore((s) => s.undoStack.length > 0);
	const canRedo = useEditorStore((s) => s.redoStack.length > 0);
	const { status: autosaveStatus, reloadFromServer } = useAutosave();

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
		setLoadStatus('loading');
		getTemplate(id)
			.then(({ meta: templateMeta, body }) => {
				if (cancelled) return;
				loadTemplate(templateMeta, body);
				setLoadStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setLoadStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [id, loadTemplate]);

	if (loadStatus === 'loading') {
		return (
			<AppShell>
				<LoadingSpinner fullPage />
			</AppShell>
		);
	}

	if (loadStatus === 'error' || !meta) {
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
					<TemplateNameEditor />
					<div className="template-editor-header-actions">
						<ValidationIndicator />
						<span className="template-editor-autosave-status" data-status={autosaveStatus}>
							{autosaveStatus === 'conflict' ? '' : AUTOSAVE_STATUS_LABEL[autosaveStatus]}
						</span>
						<button type="button" onClick={undo} disabled={!canUndo}>
							Undo
						</button>
						<button type="button" onClick={redo} disabled={!canRedo}>
							Redo
						</button>
					</div>
				</div>
				{autosaveStatus === 'conflict' && (
					<div className="template-editor-conflict-banner" role="alert">
						<span>This template was changed elsewhere. Reload to see the latest version — your unsaved changes here will be lost.</span>
						<button type="button" onClick={() => void reloadFromServer()}>
							Reload latest
						</button>
					</div>
				)}
				<div className="template-editor-body">
					<div className="template-editor-canvas-area">
						<TemplateCanvas />
					</div>
					<RightRail />
				</div>
			</div>
		</AppShell>
	);
}

export default TemplateEditor;

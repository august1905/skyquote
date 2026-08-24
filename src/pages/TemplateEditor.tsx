import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTemplate } from '../api/templates';
import { listComments } from '../api/comments';
import { TemplateCanvas } from '../editor/canvas/TemplateCanvas';
import { PageNavigator } from '../editor/canvas/PageNavigator';
import { EditorDndProvider } from '../editor/dnd/EditorDndProvider';
import { useAutosave, type AutosaveStatus } from '../editor/autosave/useAutosave';
import { useEditorStore } from '../editor/store/editorStore';
import { useAuth } from '../auth/AuthContext';
import { clearLocalDraft, describeDraft, readLocalDraft, type LocalDraft } from '../editor/autosave/localDraft';
import { RightRail } from '../editor/rightrail/RightRail';
import { CommentsSidebar } from '../editor/comments/CommentsSidebar';
import { PdfExporter } from '../print/PdfExporter';
import { groupIntoThreads, unresolvedThreadCount } from '../editor/comments/commentAnchors';
import { TemplateNameEditor } from '../editor/header/TemplateNameEditor';
import { startRenamingTemplate } from '../editor/header/renameRequest';
import { TemplateFolderChip } from '../editor/header/TemplateFolderChip';
import { RoleAvatarStack } from '../editor/header/RoleAvatarStack';
import { TemplateOverflowMenu } from '../editor/header/TemplateOverflowMenu';
import { VersionHistoryPanel } from '../editor/header/VersionHistoryPanel';
import { computeValidationIssues } from '../editor/validation/computeValidationIssues';
import { HeaderTotal } from '../editor/header/HeaderTotal';
import { PreviewRoleToggle } from '../editor/header/PreviewRoleToggle';
import { PageSettingsPanel } from '../editor/header/PageSettingsPanel';
import { EditorToolbar } from '../editor/toolbar/EditorToolbar';
import { useEditorShortcuts } from '../editor/keyboard/useEditorShortcuts';
import { useTemplateLock } from '../editor/lock/useTemplateLock';
import { TemplateLockedScreen } from '../editor/lock/TemplateLockedScreen';
import { ValidationIndicator } from '../editor/validation/ValidationIndicator';
import { CreateDocumentWizard } from '../documents/wizard/CreateDocumentWizard';
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
	// §13: distinct from 'error' on purpose. Offline resolves itself the moment
	// the connection returns (autosave listens for `online`), and the work is
	// already safe on this device — so it shouldn't read like something broke.
	offline: 'Offline — your changes are saved on this device',
};

// The editor shell. §3's header bar is complete apart from "Need help" (there
// are no docs to launch) — the hamburger and user avatar belong to `AppShell`,
// which owns global nav. §2's toolbar, §9.3's keyboard layer, §3's page chrome +
// navigator drawer, and six of the right rail's panels are all real.
//
// Deliberately absent: the Approval workflow / Automations / Integrations
// panels, parked until the spec is finished and the app is stable. See
// BUILD_STATUS.md for the current list rather than trusting this comment to
// stay exhaustive.
function TemplateEditor() {
	const { id } = useParams<{ id: string }>();
	const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const loadTemplate = useEditorStore((s) => s.loadTemplate);
	const meta = useEditorStore((s) => s.meta);
	const undo = useEditorStore((s) => s.undo);
	const redo = useEditorStore((s) => s.redo);
	const canUndo = useEditorStore((s) => s.undoStack.length > 0);
	const canRedo = useEditorStore((s) => s.redoStack.length > 0);
	const { user } = useAuth();
	const { status: autosaveStatus, reloadFromServer, flush } = useAutosave(user?.id);
	const restoreDraftBody = useEditorStore((s) => s.restoreDraftBody);
	// §13's restore-from-local-draft. Held in state rather than read inline so
	// dismissing it (either way) doesn't re-trigger on the next render.
	const [recoverableDraft, setRecoverableDraft] = useState<LocalDraft | null>(null);
	const [wizardOpen, setWizardOpen] = useState(false);
	const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
	// §2's page-navigator drawer: toggled from the toolbar, rendered beside the
	// canvas, so neither of those two components can own the state alone.
	// Closed by default — it's a navigation aid, and a template usually has one
	// page, so opening it unprompted would just narrow the canvas.
	const [pagesOpen, setPagesOpen] = useState(false);
	// §12's comment sidebar (the header's comment icon). Its open state lives in
	// the store, not here, because the canvas opens it too — see editorStore.ts.
	const commentsOpen = useEditorStore((s) => s.commentsSidebarOpen);
	const setCommentsOpen = useEditorStore((s) => s.setCommentsSidebarOpen);
	const setComments = useEditorStore((s) => s.setComments);
	const setCommentsStatus = useEditorStore((s) => s.setCommentsStatus);
	const comments = useEditorStore((s) => s.comments);
	// §10's PDF export renders the body itself, and reuses the canvas's own
	// physical-page map so the PDF's page breaks are the ones on screen.
	const body = useEditorStore((s) => s.body);
	const blockPageNumbers = useEditorStore((s) => s.blockPageNumbers);

	// §9.3's shortcut layer. Registered unconditionally (not gated on
	// loadStatus) so the hook order stays stable across the early returns
	// below — with no template loaded, every action it can dispatch is
	// already a no-op against an empty store.
	const handleForceSave = useCallback(() => void flush(), [flush]);
	useEditorShortcuts({ onForceSave: handleForceSave });

	// Threads, not messages: five replies to one question is one thing needing
	// attention, not five.
	const unresolvedCount = useMemo(() => unresolvedThreadCount(groupIntoThreads(comments)), [comments]);

	// §3/§11.1's gate on "Create document". Only `error`-severity issues block;
	// `ValidationIndicator` shows both severities either way.
	const blockingIssues = useMemo(
		() => (body ? computeValidationIssues(body, meta?.name ?? '').filter((issue) => issue.severity === 'error') : []),
		[body, meta?.name]
	);

	// §3 ①'s ⋮ menu dialogs. Held here rather than inside the menu because the
	// folder dialog has two entry points — the 📁 chip and the menu's "Move" —
	// so neither of those owns it.
	const [moveDialogOpen, setMoveDialogOpen] = useState(false);
	const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

	// §10's PDF export. `pdfExporting` mounts `PdfExporter`, whose render *is*
	// the work — see that file. The flush first is deliberate: exporting a
	// template whose latest edits are still sitting in the autosave debounce
	// would hand the author a PDF of a version nobody has, which is a worse
	// failure than a slightly slower export.
	const [pdfExporting, setPdfExporting] = useState(false);
	const [pdfMessage, setPdfMessage] = useState<string | null>(null);
	const startPdfExport = useCallback(() => {
		setPdfMessage(null);
		void flush().finally(() => setPdfExporting(true));
	}, [flush]);
	const handlePdfFinished = useCallback((error: string | null) => {
		setPdfExporting(false);
		setPdfMessage(error);
	}, []);

	// §12's exclusive edit lock. Acquired in parallel with the template load
	// rather than before it — serialising two round trips would slow every
	// open to protect against a case the blocked screen below already handles,
	// since a blocked user never sees the body even though it was fetched.
	const { status: lockStatus, blockedReason, retry: retryLock } = useTemplateLock(id);

	// The catalog, the content library and the @-mention list used to be fetched
	// here, unconditionally, on every editor open — three requests per open for
	// data most sessions never look at. They're workspace-level, not
	// template-scoped, and each one now loads the first time something actually
	// needs it: see `editor/workspaceData.ts` and its callers (CatalogPanel,
	// PricingTableBlockView, ContentLibraryPanel, SaveToLibraryDialog,
	// CommentsSidebar).

	// §12's comments, template-scoped — refetched whenever the open template
	// changes, unlike the catalog/library which are workspace-level. Degrades
	// to an empty sidebar rather than blocking the editor.
	useEffect(() => {
		if (!id) return;
		let cancelled = false;
		// Cleared here rather than in `loadTemplate`: this effect owns the list,
		// and the template load routinely finishes *after* it — see the note in
		// editorStore.ts's loadTemplate.
		setComments([], []);
		setCommentsStatus('loading');
		listComments(id)
			.then(({ comments: loaded, authors }) => {
				if (!cancelled) setComments(loaded, authors);
			})
			.catch(() => {
				if (!cancelled) setCommentsStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [id, setComments, setCommentsStatus]);

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
				// §13: a draft still on disk *is* unsent work — autosave clears it
				// on every successful save — so its mere presence is the signal.
				// Offered, never auto-applied: silently replacing what the server
				// returned would be its own kind of data loss.
				const draft = user?.id ? readLocalDraft(user.id, templateMeta.id) : null;
				setRecoverableDraft(draft);
				setLoadStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setLoadStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, [id, loadTemplate, user?.id]);

	// Checked before the load states on purpose: a locked-out user should be
	// told why immediately, not shown a spinner until an irrelevant fetch
	// finishes.
	if (lockStatus === 'blocked') {
		return (
			<AppShell>
				<TemplateLockedScreen reason={blockedReason ?? 'Someone else is editing this template'} onRetry={retryLock} />
			</AppShell>
		);
	}

	if (loadStatus === 'loading' || lockStatus === 'acquiring') {
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
		// `scroll="self"`: the editor's canvas is its own scroll region beside a
		// fixed rail, so the shell must not add padding or a second scrollbar.
		<AppShell scroll="self">
			<div className="template-editor">
				<div className="template-editor-header">
					{/* §3 ①'s object-type indicator, immediately before the name. */}
					<span className="header-type-badge">TEMPLATES</span>
					<TemplateNameEditor />
					<div className="template-editor-header-actions">
						<HeaderTotal />
						{/* §3 ①'s metadata row: the folder, click-to-move. */}
						<TemplateFolderChip dialogOpen={moveDialogOpen} onDialogOpenChange={setMoveDialogOpen} />
						{/* §3 ①'s role avatar stack, and the Manage button beside it. */}
						<RoleAvatarStack />
						<PreviewRoleToggle />
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
						{/* §3's header comment icon, "shows unread badge". The count is
						    **unresolved threads**, not unread ones: per-user read state
						    needs a table that doesn't exist yet (see BUILD_STATUS.md),
						    and unresolved is both meaningful on its own and the same
						    number for everyone. */}
						<div className="comments-header-toggle">
							<button type="button" aria-label="Comments" aria-pressed={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)}>
								💬
							</button>
							{unresolvedCount > 0 && (
								<span className="comments-header-badge" aria-label={`${unresolvedCount} unresolved comments`}>
									{unresolvedCount}
								</span>
							)}
						</div>
						{/* §3/§11.1: "Disabled with tooltip if the template has validation
						    errors." Warnings deliberately don't block — an image missing alt
						    text is worth flagging, not worth refusing to send a quote over. */}
						<button
							type="button"
							onClick={() => setWizardOpen(true)}
							disabled={blockingIssues.length > 0}
							{...(blockingIssues.length > 0
								? {
										title: `Fix ${blockingIssues.length === 1 ? 'this problem' : `these ${blockingIssues.length} problems`} first: ${blockingIssues
											.map((issue) => issue.message)
											.join('; ')}`,
									}
								: {})}
						>
							Create document
						</button>
						{/* §3 ①'s "⋮ overflow: Duplicate, Rename, Move, Export PDF, Version
						    history, Settings, Delete" — all seven. Export PDF and Settings
						    moved in here from their own header buttons, which is where §3
						    puts them; the header was also running out of room. */}
						<TemplateOverflowMenu
							onExportPdf={startPdfExport}
							onOpenSettings={() => setPageSettingsOpen(true)}
							onOpenVersionHistory={() => setVersionHistoryOpen(true)}
							onMove={() => setMoveDialogOpen(true)}
							onRename={startRenamingTemplate}
							exporting={pdfExporting}
						/>
						<div className="page-settings-panel-anchor">
							{pageSettingsOpen && <PageSettingsPanel onClose={() => setPageSettingsOpen(false)} />}
						</div>
					</div>
				</div>
				{versionHistoryOpen && <VersionHistoryPanel onClose={() => setVersionHistoryOpen(false)} />}
				<EditorToolbar pagesOpen={pagesOpen} onTogglePages={() => setPagesOpen((open) => !open)} />
				{pdfMessage && (
					<div className="template-editor-conflict-banner" role="alert">
						<span>{pdfMessage}</span>
						<button type="button" onClick={() => setPdfMessage(null)}>
							Dismiss
						</button>
					</div>
				)}
				{pdfExporting && body && (
					<PdfExporter body={body} blockPageNumbers={blockPageNumbers} filename={`${meta.name || 'template'}.pdf`} onFinished={handlePdfFinished} />
				)}
				{wizardOpen && <CreateDocumentWizard onClose={() => setWizardOpen(false)} />}
				{recoverableDraft && (
					<div className="template-editor-draft-banner" role="alert">
						<span>
							Unsaved changes from this device, {new Date(recoverableDraft.savedAt).toLocaleString()}, were never sent to the server.
							{describeDraft(recoverableDraft, meta.version).isStale &&
								' Someone has saved this template since — restoring will replace their version.'}
						</span>
						<div className="template-editor-draft-banner-actions">
							<button
								type="button"
								onClick={() => {
									restoreDraftBody(recoverableDraft.body);
									setRecoverableDraft(null);
								}}
							>
								Restore them
							</button>
							<button
								type="button"
								onClick={() => {
									if (user?.id) clearLocalDraft(user.id, recoverableDraft.templateId);
									setRecoverableDraft(null);
								}}
							>
								Discard
							</button>
						</div>
					</div>
				)}
				{autosaveStatus === 'conflict' && (
					<div className="template-editor-conflict-banner" role="alert">
						<span>This template was changed elsewhere. Reload to see the latest version — your unsaved changes here will be lost.</span>
						<button type="button" onClick={() => void reloadFromServer()}>
							Reload latest
						</button>
					</div>
				)}
				<EditorDndProvider>
					<div className="template-editor-body">
						{pagesOpen && <PageNavigator onClose={() => setPagesOpen(false)} />}
						<div className="template-editor-canvas-area">
							<TemplateCanvas />
						</div>
						{commentsOpen && <CommentsSidebar onClose={() => setCommentsOpen(false)} />}
						<RightRail />
					</div>
				</EditorDndProvider>
			</div>
		</AppShell>
	);
}

export default TemplateEditor;

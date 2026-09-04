import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFolder, listFolders, renameFolder, type Folder } from '../api/folders';
import { createTemplate, listTemplates, patchTemplate } from '../api/templates';
import AppShell from '../components/AppShell';
import { MoveToFolderDialog } from '../components/MoveToFolderDialog';
import type { TemplateMeta } from '../editor/types';
import { importDocxAsTemplate, type DocxImportOutcome, type DocxImportProgress } from '../import/docx/importDocx';
import { FolderRowMenu } from '../templates/FolderRowMenu';
import { TemplateRowMenu } from '../templates/TemplateRowMenu';
import {
	childFolders,
	folderPath,
	indexFoldersById,
	lastActivityAt,
	orphanedTemplates,
	searchFolders,
	searchTemplates,
	sortTemplates,
	templatesInFolder,
	type TemplateSort,
} from '../templates/templateListView';
import './Templates.css';

/**
 * The Templates list page (BASIC_ARCHITECHTURE.md: "list view of documents (no
 * tabs) — folders + individuals, searchable by name; top right: create new
 * template, new folder").
 *
 * No tabs, deliberately: the spec gives Documents four (All / Created by me /
 * Recent / Archived) and gives Templates none, because a template library is a
 * shelf rather than a workflow — nothing here has a status to filter by.
 *
 * Two behaviours worth knowing:
 *
 * - **Search spans the whole library, not the open folder.** Someone typing a
 *   name is looking for a template; a search that hid the answer because it's
 *   filed elsewhere would be worse than no search. Results show which folder each
 *   match lives in, so the answer to "where is it?" comes with it.
 * - **Folder navigation is local state, not a route.** `/templates/:id` is
 *   already a template, and a URL scheme that could mean either would be one
 *   ambiguity to resolve on every request. The trade-off is that a folder isn't
 *   linkable yet; the fix, when it's wanted, is `/templates/folder/:id`.
 */
/** Import progress as a label — uploads are the slow part and the only stage with a count worth showing. */
function importProgressLabel(progress: DocxImportProgress): string {
	if (progress.stage === 'parsing') return 'Reading…';
	if (progress.stage === 'saving') return 'Saving…';
	return `Uploading ${progress.done ?? 0}/${progress.total ?? 0}…`;
}

function Templates() {
	const navigate = useNavigate();
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [templates, setTemplates] = useState<TemplateMeta[]>([]);
	const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
	const [folders, setFolders] = useState<Folder[]>([]);
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<TemplateSort>('name');
	const [creating, setCreating] = useState(false);
	const [newFolderName, setNewFolderName] = useState<string | null>(null);
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<{ kind: 'template' | 'folder'; id: string; name: string } | null>(null);
	const [moving, setMoving] = useState<TemplateMeta | null>(null);
	const [moveBusy, setMoveBusy] = useState(false);
	const [moveError, setMoveError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [importProgress, setImportProgress] = useState<DocxImportProgress | null>(null);
	const [importSummary, setImportSummary] = useState<DocxImportOutcome | null>(null);
	const [importError, setImportError] = useState<string | null>(null);

	/**
	 * Refetches both lists. Every mutation calls this rather than patching local
	 * state: a rename, a move and a delete each change what belongs where, and
	 * two people can be filing templates at once — a list assembled from guesses
	 * about the server's new state is a list that quietly drifts out of date.
	 *
	 * `status` only goes back to 'loading' on the very first load, so a rename
	 * doesn't blank the page it just changed.
	 */
	const refresh = useCallback(async (first = false) => {
		if (first) setStatus('loading');
		try {
			const [templateList, folderList] = await Promise.all([listTemplates(), listFolders('template')]);
			setTemplates(templateList.templates);
			setOwnerNames(new Map(templateList.owners.map((owner) => [owner.id, owner.name])));
			setFolders(folderList);
			setStatus('ready');
			setError(null);
		} catch {
			// A failed refresh after a successful write leaves the old list on
			// screen, which is stale but readable — better than replacing it with an
			// error page when the write itself worked.
			if (first) setStatus('error');
			else setError('Could not refresh the list.');
		}
	}, []);

	useEffect(() => {
		void refresh(true);
	}, [refresh]);

	const byId = useMemo(() => indexFoldersById(folders), [folders]);
	const searching = query.trim().length > 0;

	// The folder you were standing in can disappear — someone else deletes it, or
	// you delete it yourself from inside. Falling back to the root beats rendering
	// an empty folder that no longer exists.
	useEffect(() => {
		if (currentFolderId && status === 'ready' && !byId.has(currentFolderId)) setCurrentFolderId(null);
	}, [currentFolderId, byId, status]);

	const breadcrumb = useMemo(() => folderPath(currentFolderId, byId), [currentFolderId, byId]);
	const visibleFolders = useMemo(
		() => (searching ? searchFolders(folders, query) : childFolders(folders, currentFolderId)),
		[searching, folders, query, currentFolderId],
	);
	const visibleTemplates = useMemo(() => {
		if (searching) return sortTemplates(searchTemplates(templates, query), sort);
		const inFolder = templatesInFolder(templates, currentFolderId);
		// Templates whose folder row is gone would otherwise be unreachable: not at
		// the root, and no folder left to open. They surface at the root, where
		// they can at least be moved somewhere real.
		const stranded = currentFolderId === null ? orphanedTemplates(templates, byId) : [];
		return sortTemplates([...inFolder, ...stranded], sort);
	}, [searching, templates, query, currentFolderId, byId, sort]);

	async function handleCreateTemplate() {
		setCreating(true);
		try {
			// Created straight into the folder you're looking at — filing it
			// afterwards is a step nobody wants when they've already navigated here.
			const { meta } = await createTemplate();
			if (currentFolderId) await patchTemplate(meta.id, { folderId: currentFolderId });
			void navigate(`/templates/${meta.id}/edit`);
		} catch {
			setError('Could not create a template.');
			setCreating(false);
		}
	}

	/**
	 * Imports a PandaDoc `.docx` export as a new template.
	 *
	 * Parsed in the browser (see `import/docx`), so the only backend traffic is
	 * the create, the save, and one upload per distinct image. Filed into the
	 * open folder for the same reason a new template is.
	 *
	 * The summary is left on screen rather than navigating straight into the
	 * editor: an import can be partial — unmapped merge tokens, an image that
	 * didn't upload — and those are things to read before editing, not to
	 * discover later in a document a client is reading.
	 */
	async function handleImportDocx(file: File) {
		setImportError(null);
		setImportSummary(null);
		setImportProgress({ stage: 'parsing' });
		try {
			const outcome = await importDocxAsTemplate(file, setImportProgress);
			if (currentFolderId) await patchTemplate(outcome.templateId, { folderId: currentFolderId });
			setImportSummary(outcome);
			await refresh();
		} catch (cause) {
			setImportError(cause instanceof Error ? cause.message : 'Could not import that file.');
		} finally {
			setImportProgress(null);
		}
	}

	async function handleCreateFolder() {
		const name = (newFolderName || '').trim();
		if (!name) return;
		try {
			await createFolder(currentFolderId ? { name, kind: 'template', parentFolderId: currentFolderId } : { name, kind: 'template' });
			setNewFolderName(null);
			await refresh();
		} catch {
			setError('Could not create that folder.');
		}
	}

	async function commitRename() {
		if (!renaming) return;
		const name = renaming.name.trim();
		const original = renaming.kind === 'template' ? templates.find((t) => t.id === renaming.id)?.name : byId.get(renaming.id)?.name;
		setRenaming(null);
		if (!name || name === original) return;
		try {
			if (renaming.kind === 'template') await patchTemplate(renaming.id, { name });
			else await renameFolder(renaming.id, name);
			await refresh();
		} catch {
			setError('Could not rename that.');
		}
	}

	async function moveTo(folderId: string | null) {
		if (!moving) return;
		setMoveBusy(true);
		setMoveError(null);
		try {
			await patchTemplate(moving.id, { folderId });
			setMoving(null);
			await refresh();
		} catch {
			setMoveError('Could not move that template.');
		} finally {
			setMoveBusy(false);
		}
	}

	async function createFolderAndMove(name: string) {
		if (!name || !moving) return;
		setMoveBusy(true);
		setMoveError(null);
		try {
			const folder = await createFolder({ name, kind: 'template' });
			setFolders((existing) => [...existing, folder]);
			await moveTo(folder.id);
		} catch {
			setMoveError('Could not create that folder.');
			setMoveBusy(false);
		}
	}

	function renameInput() {
		return (
			<input
				className="templates-rename-input"
				aria-label="New name"
				autoFocus
				value={renaming?.name ?? ''}
				onChange={(event) => setRenaming((current) => (current ? { ...current, name: event.target.value } : current))}
				onBlur={() => void commitRename()}
				onKeyDown={(event) => {
					if (event.key === 'Enter') void commitRename();
					// Escape abandons the edit. `onBlur` would otherwise commit it on
					// the way out, which is the opposite of what Escape means.
					if (event.key === 'Escape') setRenaming(null);
				}}
			/>
		);
	}

	const isEmpty = visibleFolders.length === 0 && visibleTemplates.length === 0;

	return (
		<AppShell>
			<div className="templates-page">
				<div className="templates-header">
					<h1>Templates</h1>
					<div className="templates-header-actions">
						{/* A label wrapping a hidden input, not a button that clicks one:
						    the file picker is the whole interaction, and this keeps it
						    keyboard-reachable and labelled without a ref. */}
						<label className={`templates-import${importProgress ? ' templates-import-busy' : ''}`}>
							{importProgress ? importProgressLabel(importProgress) : 'Import .docx'}
							<input
								type="file"
								accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
								aria-label="Import a PandaDoc .docx export"
								disabled={importProgress !== null}
								onChange={(event) => {
									const file = event.target.files?.[0];
									// Cleared so picking the same file twice still fires a change.
									event.target.value = '';
									if (file) void handleImportDocx(file);
								}}
							/>
						</label>
						<button type="button" onClick={() => setNewFolderName('')}>
							+ New folder
						</button>
						<button type="button" className="templates-primary" onClick={() => void handleCreateTemplate()} disabled={creating}>
							{creating ? 'Creating…' : '+ New template'}
						</button>
					</div>
				</div>

				<div className="templates-toolbar">
					<input
						type="search"
						className="templates-search"
						aria-label="Search templates"
						placeholder="Search templates…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<div className="templates-sort">
						<span>Sort</span>
						<button type="button" aria-pressed={sort === 'name'} onClick={() => setSort('name')}>
							Name
						</button>
						<button type="button" aria-pressed={sort === 'updated'} onClick={() => setSort('updated')}>
							Last updated
						</button>
					</div>
				</div>

				{searching ? (
					<p className="templates-breadcrumb" role="status">
						{visibleTemplates.length + visibleFolders.length} matching “{query.trim()}” across all folders
						<button type="button" className="templates-crumb" onClick={() => setQuery('')}>
							Clear search
						</button>
					</p>
				) : (
					<nav className="templates-breadcrumb" aria-label="Folder path">
						<button type="button" className="templates-crumb" disabled={currentFolderId === null} onClick={() => setCurrentFolderId(null)}>
							All templates
						</button>
						{breadcrumb.map((folder, index) => (
							<span key={folder.id}>
								<span className="templates-crumb-sep">/</span>
								<button
									type="button"
									className="templates-crumb"
									disabled={index === breadcrumb.length - 1}
									onClick={() => setCurrentFolderId(folder.id)}
								>
									{folder.name}
								</button>
							</span>
						))}
					</nav>
				)}

				{newFolderName !== null && (
					<div className="templates-new-folder">
						<input
							type="text"
							aria-label="Folder name"
							placeholder={currentFolderId ? 'Folder name (inside this folder)…' : 'Folder name…'}
							autoFocus
							value={newFolderName}
							onChange={(event) => setNewFolderName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') void handleCreateFolder();
								if (event.key === 'Escape') setNewFolderName(null);
							}}
						/>
						<button type="button" disabled={!newFolderName.trim()} onClick={() => void handleCreateFolder()}>
							Create folder
						</button>
						<button type="button" onClick={() => setNewFolderName(null)}>
							Cancel
						</button>
					</div>
				)}

				{error && (
					<p className="app-dialog-error" role="alert">
						{error}
					</p>
				)}

				{status === 'loading' && <p>Loading…</p>}
				{importError && (
					<p className="templates-import-error" role="alert">
						{importError}
					</p>
				)}

				{importSummary && (
					<div className="templates-import-summary" role="status">
						<div className="templates-import-summary-head">
							<strong>Imported {importSummary.counts.pages} pages</strong>
							<button type="button" aria-label="Dismiss import summary" onClick={() => setImportSummary(null)}>
								×
							</button>
						</div>
						<p>
							{importSummary.counts.textBlocks} text blocks, {importSummary.counts.images} images,{' '}
							{importSummary.counts.tables} tables, {importSummary.counts.backgrounds} page backgrounds.
						</p>
						{/* Stated, not buried: an import that quietly leaves merge fields
						    as dead text would look finished and behave wrong. */}
						{importSummary.unmappedTokens.length > 0 && (
							<p className="templates-import-warning">
								Left as plain text — no variable in SkyQuotes matches: {importSummary.unmappedTokens.join(', ')}.
							</p>
						)}
						{importSummary.missingImages > 0 && (
							<p className="templates-import-warning">
								{importSummary.missingImages} image{importSummary.missingImages === 1 ? '' : 's'} could not be uploaded.
							</p>
						)}
						<button type="button" className="templates-primary" onClick={() => void navigate(`/templates/${importSummary.templateId}/edit`)}>
							Open in the editor
						</button>
					</div>
				)}

				{status === 'error' && <p role="alert">Couldn&apos;t load templates.</p>}

				{status === 'ready' && isEmpty && (
					<p className="templates-empty">
						{searching
							? `Nothing matches “${query.trim()}”.`
							: currentFolderId
								? 'This folder is empty.'
								: 'No templates yet — start one with “+ New template”.'}
					</p>
				)}

				{status === 'ready' && !isEmpty && (
					<table className="templates-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Owner</th>
								<th>Last updated</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{visibleFolders.map((folder) => (
								<tr key={`folder-${folder.id}`} className="templates-row templates-row-folder">
									<td>
										{renaming?.kind === 'folder' && renaming.id === folder.id ? (
											renameInput()
										) : (
											<button
												type="button"
												className="templates-name-button"
												onClick={() => {
													setQuery('');
													setCurrentFolderId(folder.id);
												}}
											>
												📁 {folder.name}
											</button>
										)}
									</td>
									<td />
									<td />
									<td className="templates-actions-cell">
										<FolderRowMenu
											folder={folder}
											open={openMenuId === `folder-${folder.id}`}
											onToggle={() => setOpenMenuId((current) => (current === `folder-${folder.id}` ? null : `folder-${folder.id}`))}
											onClose={() => setOpenMenuId(null)}
											onRename={() => setRenaming({ kind: 'folder', id: folder.id, name: folder.name })}
											onChanged={() => void refresh()}
										/>
									</td>
								</tr>
							))}
							{visibleTemplates.map((template) => {
								const folderName = template.folderId ? (byId.get(template.folderId)?.name ?? 'A deleted folder') : 'All templates';
								return (
									<tr key={template.id} className="templates-row">
										<td>
											{renaming?.kind === 'template' && renaming.id === template.id ? (
												renameInput()
											) : (
												<button
													type="button"
													className="templates-name-button"
													onClick={() => void navigate(`/templates/${template.id}/edit`)}
												>
													{template.name}
												</button>
											)}
											{/* Where a match lives, shown only while searching — the folder view already answers it. */}
											{searching && <span className="templates-row-folder-hint">in {folderName}</span>}
										</td>
										<td>{ownerNames.get(template.createdBy) || '—'}</td>
										<td>{formatDate(lastActivityAt(template))}</td>
										<td className="templates-actions-cell">
											<TemplateRowMenu
												template={template}
												open={openMenuId === template.id}
												onToggle={() => setOpenMenuId((current) => (current === template.id ? null : template.id))}
												onClose={() => setOpenMenuId(null)}
												onRename={() => setRenaming({ kind: 'template', id: template.id, name: template.name })}
												onMove={() => {
													setMoveError(null);
													setMoving(template);
												}}
												onChanged={() => void refresh()}
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			{moving && (
				<MoveToFolderDialog
					folders={folders}
					currentFolderId={moving.folderId}
					title="Move template"
					status="idle"
					busy={moveBusy}
					error={moveError}
					onMove={(folderId) => void moveTo(folderId)}
					onCreateAndMove={(name) => void createFolderAndMove(name)}
					onClose={() => setMoving(null)}
				/>
			)}
		</AppShell>
	);
}

/** Absolute rather than relative: a list is scanned and compared down the column, and "3 days ago" doesn't sort by eye. */
function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default Templates;

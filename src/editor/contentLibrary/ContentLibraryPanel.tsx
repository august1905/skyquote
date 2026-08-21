import { useMemo, useState } from 'react';
import { deleteContentLibraryItem, type ContentLibraryItem } from '../../api/contentLibrary';
import { useEditorStore } from '../store/editorStore';
import { useContentLibrary } from './useContentLibrary';
import { filterByQuery, sortForTab, type ContentLibraryTab } from './contentLibraryFilters';
import './contentLibrary.css';

interface ContentLibraryPanelProps {
	onClose: () => void;
}

const TABS: { key: ContentLibraryTab; label: string }[] = [
	{ key: 'recent', label: 'Recent' },
	{ key: 'featured', label: 'Featured' },
];

/** `block`/`page` at a glance. Stands in for §8's thumbnail, which needs a renderer that doesn't exist yet — see ContentLibraryTile's comment. */
function kindIcon(item: ContentLibraryItem): string {
	return item.kind === 'page' ? '📄' : '⬓';
}

/**
 * One library item.
 *
 * **§8 specifies a "2-column thumbnail grid"; these are name-and-tag tiles.**
 * A thumbnail there means a rendered preview, "generated server-side from the
 * same renderer used for PDF export" — and that renderer isn't built, so
 * `thumbnail_path` stays null (the column is nullable for exactly this
 * reason). The grid layout is real; what fills each cell becomes an image once
 * there's something honest to put there. A placeholder rectangle would look
 * like a preview that failed to load.
 */
function ContentLibraryTile({
	item,
	onInsert,
	onDelete,
	busy,
}: {
	item: ContentLibraryItem;
	onInsert: () => void;
	onDelete: () => void;
	busy: boolean;
}) {
	return (
		<div className="content-library-tile">
			{/* `aria-label`, not just `title`: this button has text content (the
			    name, kind and tags below), and content wins over `title` for the
			    accessible name — so the tile would otherwise be addressable only
			    by its whole concatenated contents. `title` stays for the hover
			    tooltip. */}
			<button
				type="button"
				className="content-library-tile-insert"
				disabled={busy}
				onClick={onInsert}
				aria-label={`Insert ${item.name}`}
				title={`Insert ${item.name}`}
			>
				<span className="content-library-tile-kind" aria-hidden="true">
					{kindIcon(item)}
				</span>
				<span className="content-library-tile-name">{item.name}</span>
				<span className="content-library-tile-meta">
					{item.kind === 'page' ? 'Page' : 'Block'}
					{item.usageCount > 0 && ` · used ${item.usageCount}×`}
				</span>
				{item.tags.length > 0 && (
					<span className="content-library-tile-tags">
						{item.tags.map((tag) => (
							<span key={tag} className="content-library-tag">
								{tag}
							</span>
						))}
					</span>
				)}
			</button>
			<button type="button" className="content-library-tile-delete" aria-label={`Delete ${item.name} from the library`} disabled={busy} onClick={onDelete}>
				×
			</button>
		</div>
	);
}

/**
 * §3's Content Library right-rail panel (§8). Recent/Featured tabs, search, a
 * 2-column grid, and a persistent "Open Content Library" button — the last of
 * which opens the same content in a full-screen browser for when the rail is
 * too narrow to work in.
 *
 * Fetching is owned by `TemplateEditor` (one fetch per editor session, like the
 * catalog), so this only reads from the store — meaning the panel can be opened
 * and closed repeatedly without re-requesting the list.
 */
export function ContentLibraryPanel({ onClose }: ContentLibraryPanelProps) {
	const items = useEditorStore((s) => s.contentLibraryItems);
	const status = useEditorStore((s) => s.contentLibraryStatus);
	const removeItem = useEditorStore((s) => s.removeContentLibraryItem);
	const { insertItem } = useContentLibrary();
	const [tab, setTab] = useState<ContentLibraryTab>('recent');
	const [query, setQuery] = useState('');
	const [browserOpen, setBrowserOpen] = useState(false);
	// One id at a time: an insert awaits a payload fetch, and double-clicking a
	// tile in that window would otherwise insert it twice.
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const visible = useMemo(() => filterByQuery(sortForTab(items, tab), query), [items, tab, query]);

	async function handleInsert(item: ContentLibraryItem) {
		setBusyId(item.id);
		setError(null);
		try {
			await insertItem(item.id, item.kind);
		} catch {
			setError(`Couldn't insert "${item.name}".`);
		} finally {
			setBusyId(null);
		}
	}

	async function handleDelete(item: ContentLibraryItem) {
		if (!window.confirm(`Delete "${item.name}" from the Content Library? Blocks already inserted from it are unaffected.`)) return;
		setBusyId(item.id);
		setError(null);
		try {
			await deleteContentLibraryItem(item.id);
			removeItem(item.id);
		} catch {
			setError(`Couldn't delete "${item.name}".`);
		} finally {
			setBusyId(null);
		}
	}

	/** Rendered in both the rail panel and the full-screen browser — same tiles, wider grid. */
	function renderGrid(wide: boolean) {
		return (
			<div className={`content-library-grid${wide ? ' content-library-grid-wide' : ''}`}>
				{visible.map((item) => (
					<ContentLibraryTile
						key={item.id}
						item={item}
						busy={busyId === item.id}
						onInsert={() => void handleInsert(item)}
						onDelete={() => void handleDelete(item)}
					/>
				))}
			</div>
		);
	}

	const emptyState = (
		<>
			{status === 'loading' && <p className="content-library-empty">Loading…</p>}
			{status === 'error' && (
				<p className="content-library-empty" role="alert">
					Couldn&apos;t load the content library.
				</p>
			)}
			{status === 'ready' && items.length === 0 && (
				<p className="content-library-empty">
					Nothing saved yet. Use a block&apos;s <strong>Save to library</strong> button, or a page&apos;s <strong>…</strong> menu.
				</p>
			)}
			{status === 'ready' && items.length > 0 && visible.length === 0 && (
				<p className="content-library-empty">{tab === 'featured' && !query ? 'Nothing has been reused yet.' : 'No matches.'}</p>
			)}
		</>
	);

	return (
		<div className="content-library-panel">
			<div className="content-library-header">
				<h2>Content Library</h2>
				<button type="button" aria-label="Close content library panel" onClick={onClose}>
					×
				</button>
			</div>

			<div className="content-library-tabs" role="tablist">
				{TABS.map((entry) => (
					<button
						key={entry.key}
						type="button"
						role="tab"
						aria-selected={tab === entry.key}
						className={tab === entry.key ? 'content-library-tab-active' : undefined}
						onClick={() => setTab(entry.key)}
					>
						{entry.label}
					</button>
				))}
			</div>

			<input
				type="text"
				className="content-library-search"
				placeholder="Search the library…"
				aria-label="Search content library"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>

			{error && (
				<p className="content-library-error" role="alert">
					{error}
				</p>
			)}
			{emptyState}
			{visible.length > 0 && renderGrid(false)}

			<button type="button" className="content-library-open-full" onClick={() => setBrowserOpen(true)}>
				Open Content Library
			</button>

			{browserOpen && (
				<div className="content-library-browser-overlay" role="dialog" aria-label="Content Library browser">
					<div className="content-library-browser">
						<div className="content-library-header">
							<h2>Content Library</h2>
							<button type="button" aria-label="Close content library browser" onClick={() => setBrowserOpen(false)}>
								×
							</button>
						</div>
						<input
							type="text"
							className="content-library-search"
							placeholder="Search the library…"
							aria-label="Search content library (full screen)"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{emptyState}
						{visible.length > 0 && renderGrid(true)}
					</div>
				</div>
			)}
		</div>
	);
}

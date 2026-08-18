import { useEffect, useRef, useState } from 'react';
import { INSERTABLE_BLOCK_KINDS, type InsertableBlockKind } from '../blocks/insertable';
import type { Block } from '../types';
import './canvas.css';

interface AddBlockMenuProps {
	onInsert: (block: Block) => void;
	/** Defaults to every top-level-insertable kind; pass a filtered list (e.g. `COLUMN_INSERTABLE_BLOCK_KINDS`) for a nested "+ Add block" menu. */
	kinds?: InsertableBlockKind[];
}

// §4.1's path 2 ("click a palette tile → insert after the currently selected
// block or at page end"), scoped down to "at page end" — there's no
// persistent Content panel/palette yet (that's the right-rail UI §3
// describes, not built in phase 1 or 2's block-catalog slice), so this is a
// lightweight stand-in reachable from the page itself.
export function AddBlockMenu({ onInsert, kinds = INSERTABLE_BLOCK_KINDS }: AddBlockMenuProps) {
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
	const [errorMessage, setErrorMessage] = useState('');
	const [urlDraft, setUrlDraft] = useState('');
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [open]);

	// Shared by both async kinds (`createFromFile` — Image's real upload —
	// and `createFromUrl` — Video's oEmbed fetch): a real "working" state to
	// show, and a real failure mode (too large/wrong format/network for
	// Image; unsupported provider/not-found for Video) to surface, unlike the
	// synchronous `create()` kinds.
	async function resolveAndInsert(kind: InsertableBlockKind, run: () => Promise<Block>) {
		setOpen(false);
		setStatus('working');
		setErrorMessage('');
		try {
			const block = await run();
			onInsert(block);
			setStatus('idle');
		} catch (err) {
			setStatus('error');
			setErrorMessage(err instanceof Error ? err.message : `Could not add ${kind.label.toLowerCase()}`);
		}
	}

	function handleUrlSubmit(kind: InsertableBlockKind) {
		if (!kind.createFromUrl) return;
		const url = urlDraft.trim();
		if (!url) return;
		setUrlDraft('');
		void resolveAndInsert(kind, () => kind.createFromUrl!(url));
	}

	return (
		<div className="canvas-add-block-menu" ref={containerRef}>
			<button type="button" className="canvas-add-block" onClick={() => setOpen((o) => !o)} disabled={status === 'working'}>
				{status === 'working' ? 'Adding…' : '+ Add block'}
			</button>
			{open && (
				<div className="canvas-add-block-options" role="menu">
					{kinds.map((kind) => {
						if (kind.createFromFile) {
							return (
								<label key={kind.type} role="menuitem" className="canvas-add-block-file-option">
									{kind.label}
									<input
										type="file"
										accept={kind.fileAccept}
										className="canvas-add-block-file-input"
										onChange={(e) => {
											const file = e.target.files?.[0];
											// Reset so picking the same file twice in a row still fires onChange.
											e.target.value = '';
											if (file) void resolveAndInsert(kind, () => kind.createFromFile!(file));
										}}
									/>
								</label>
							);
						}
						if (kind.createFromUrl) {
							return (
								<form
									key={kind.type}
									className="canvas-add-block-url-option"
									onSubmit={(e) => {
										e.preventDefault();
										handleUrlSubmit(kind);
									}}
								>
									<input
										type="url"
										className="canvas-add-block-url-input"
										placeholder={kind.urlPlaceholder ?? 'Paste a URL'}
										value={urlDraft}
										onChange={(e) => setUrlDraft(e.target.value)}
										onClick={(e) => e.stopPropagation()}
									/>
									<button type="submit" disabled={!urlDraft.trim()}>
										{kind.label}
									</button>
								</form>
							);
						}
						return (
							<button
								key={kind.type}
								type="button"
								role="menuitem"
								onClick={() => {
									if (kind.create) onInsert(kind.create());
									setOpen(false);
								}}
							>
								{kind.label}
							</button>
						);
					})}
				</div>
			)}
			{status === 'error' && (
				<p className="canvas-add-block-error" role="alert">
					{errorMessage}
				</p>
			)}
		</div>
	);
}

import { useEffect, useRef } from 'react';
import { deletePage, duplicatePage, movePage, setPageBackground } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Page } from '../types';
import './canvas.css';

interface PageMenuProps {
	page: Page;
	/** This page's position in `body.pages`, for the move controls' own bounds. */
	pageIndex: number;
	pageCount: number;
	onClose: () => void;
	/** Focuses the page-name input, which is already inline-editable — "Rename" is a shortcut to it, not a second editing surface. */
	onRequestRename: () => void;
}

/**
 * §3 ⑤'s per-page `…` menu: "rename, duplicate, delete, move, set
 * background, save page to Content Library".
 *
 * Same popover shape as `BlockSettingsPopover` — outside-click to dismiss,
 * `stopPropagation` on its own clicks so interacting with it never counts as
 * a canvas click that would change block selection.
 *
 * **"Save page to Content Library" is deliberately absent rather than
 * present-but-disabled.** The Content Library needs a Data Store table that
 * doesn't exist yet (see BUILD_STATUS.md's "Waiting on Grayson"), so there's
 * nothing for the action to do; a disabled item would imply the feature is a
 * toggle away when it's actually blocked on a console step.
 */
export function PageMenu({ page, pageIndex, pageCount, onClose, onRequestRename }: PageMenuProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleOutsideClick(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) onClose();
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [onClose]);

	/** Every item closes the menu after acting — these are one-shot commands, not toggles to sit and adjust (the background colour input below is the one exception). */
	function runAndClose(action: () => void) {
		action();
		onClose();
	}

	const isFirst = pageIndex === 0;
	const isLast = pageIndex === pageCount - 1;

	return (
		<div className="page-menu-popover" ref={containerRef} onClick={(e) => e.stopPropagation()}>
			<button type="button" onClick={() => runAndClose(onRequestRename)}>
				Rename
			</button>
			<button type="button" onClick={() => runAndClose(() => runCommand(duplicatePage(page.id)))}>
				Duplicate
			</button>
			{/* arrayMove semantics, same as moveBlock: moving up targets the slot
			    before this page, moving down the slot after the next one. */}
			<button type="button" disabled={isFirst} onClick={() => runAndClose(() => runCommand(movePage(page.id, pageIndex - 1)))}>
				Move up
			</button>
			<button type="button" disabled={isLast} onClick={() => runAndClose(() => runCommand(movePage(page.id, pageIndex + 1)))}>
				Move down
			</button>

			<label className="page-menu-row">
				<span>Background</span>
				<input
					type="color"
					// Not "Page background" — the Theme panel already owns that
					// exact accessible name for the *template-wide* default, and
					// two controls sharing one label makes both ambiguous to a
					// screen reader and to `getByLabel`.
					aria-label="This page background"
					value={page.background?.color ?? '#ffffff'}
					// Coalesced: dragging through a colour picker fires a stream
					// of changes that should collapse into one undo entry, the
					// same treatment BlockSettingsPopover gives its own colour
					// inputs.
					onChange={(e) => runCommand(setPageBackground(page.id, { ...page.background, color: e.target.value }), { coalesceKey: `page-bg-${page.id}` })}
				/>
			</label>
			{/* Clearing is distinct from picking white: with no background set
			    the page inherits the Theme panel's own page colour, so this is
			    "follow the theme again", not "paint it #ffffff". */}
			<button type="button" disabled={!page.background} onClick={() => runAndClose(() => runCommand(setPageBackground(page.id, undefined)))}>
				Clear background
			</button>

			{/* §3 ⑤ lists delete, but the canvas must always have at least one
			    page — the command layer deliberately doesn't enforce that (see
			    pageCommands.ts's own note), so it's enforced here. */}
			<button
				type="button"
				className="page-menu-danger"
				disabled={pageCount === 1}
				title={pageCount === 1 ? 'A template needs at least one page' : undefined}
				onClick={() => runAndClose(() => runCommand(deletePage(page.id)))}
			>
				Delete page
			</button>
		</div>
	);
}

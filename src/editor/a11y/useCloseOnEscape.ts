import { useEffect } from 'react';

/**
 * §13: "Full keyboard operation of toolbar/panels."
 *
 * Escape is the expected way out of any transient surface — a rail panel, a
 * popover, a menu, a dialog — and before this, every one of them could only be
 * dismissed by tabbing to its close button or clicking outside. Neither is
 * available to someone who opened it by keyboard and wants out.
 *
 * Shared rather than reimplemented per surface: there are eight of these, and
 * eight copies of a document listener is eight chances for one to get the
 * text-entry rule below subtly wrong.
 *
 * **Escape originating from text entry is ignored**, which is the whole
 * subtlety. The same key already means "step out of text-edit" inside a
 * ProseMirror block (`richtext/escapeToBlur.ts`) and "cancel what I'm typing"
 * in a form field, and both of those are closer to the user's intent than
 * closing a panel they weren't looking at. This mirrors the rule
 * `keyboard/useEditorShortcuts.ts` applies for the same reason.
 *
 * @param active  Whether the surface is currently open. The listener is only
 *                attached while it is, so a stack of nested surfaces closes
 *                one at a time from the innermost — each of which is the only
 *                one whose `active` is true at that moment.
 */
export function useCloseOnEscape(active: boolean, onClose: () => void): void {
	useEffect(() => {
		if (!active) return;

		// Claim Escape for as long as this surface is open, so the editor-wide
		// handler doesn't *also* act on it — see hasOpenDismissibleSurface.
		openSurfaces += 1;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			const target = event.target;
			if (target instanceof HTMLElement) {
				if (target.isContentEditable) return;
				const tag = target.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			}
			onClose();
		}

		document.addEventListener('keydown', handleKeyDown);
		return () => {
			openSurfaces -= 1;
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [active, onClose]);
}

/**
 * How many dismissible surfaces are currently open.
 *
 * A plain module-level counter rather than state: nothing re-renders on it, and
 * its only reader is `useEditorShortcuts`'s Escape branch, which runs from a
 * document listener outside React's cycle anyway.
 */
let openSurfaces = 0;

/**
 * Whether Escape is currently owned by an open popover, menu or dialog.
 *
 * This exists because Escape is layered, and both layers are document
 * listeners — so ordering alone can't arbitrate. Without it, closing a block's
 * settings popover with Escape *also* ran the editor-wide "step out of
 * selection" handler, which deselected the block and took the whole floating
 * toolbar away with it. Pressing Escape to dismiss a popover should leave the
 * thing you were working on exactly as it was; a second press then steps out.
 *
 * Caught by the accessibility e2e, where the `⋯` button vanished mid-test.
 */
export function hasOpenDismissibleSurface(): boolean {
	return openSurfaces > 0;
}

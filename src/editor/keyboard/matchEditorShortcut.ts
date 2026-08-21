/**
 * §9.3's shortcut table, as a pure key-event → action mapping. Split out from
 * the hook that acts on it so the whole table is unit-testable without a DOM,
 * a store, or a live ProseMirror — the mapping is where the fiddly parts live
 * (modifier combinations, and which shortcuts may fire while the caret is in
 * text), and those are exactly what's worth pinning down in tests.
 */

export type EditorShortcutAction = 'undo' | 'redo' | 'duplicate' | 'deleteBlock' | 'stepOut' | 'forceSave' | 'togglePreview' | 'insertLink';

/** Just the parts of a `KeyboardEvent` this needs, so a test can pass a literal. */
export interface ShortcutEvent {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	/**
	 * Whether the event came from somewhere text is being typed — a
	 * contenteditable (any of the many Tiptap instances), or an `input`/
	 * `textarea`/`select`. This is the difference between `Backspace` meaning
	 * "delete a character" and "delete the selected block", so it's an input
	 * to the mapping rather than something the caller checks afterwards.
	 */
	inTextEntry: boolean;
}

export function matchEditorShortcut(event: ShortcutEvent): EditorShortcutAction | null {
	// Cmd on macOS, Ctrl elsewhere. Alt is never part of any shortcut in
	// §9.3's table, so requiring it to be up keeps combinations like
	// Alt+Cmd+Z (a different command in some browsers/OSes) from being
	// swallowed here.
	const mod = event.metaKey || event.ctrlKey;
	if (event.altKey) return null;

	// Shift changes 'z' to 'Z'; normalizing means the table below doesn't
	// need a case for each.
	const key = event.key.toLowerCase();

	if (mod) {
		switch (key) {
			case 'z':
				return event.shiftKey ? 'redo' : 'undo';
			case 'd':
				return event.shiftKey ? null : 'duplicate';
			case 's':
				return event.shiftKey ? null : 'forceSave';
			case 'p':
				return event.shiftKey ? null : 'togglePreview';
			case 'k':
				return event.shiftKey ? null : 'insertLink';
			default:
				// Bold/italic/underline (Cmd+B/I/U) are deliberately absent:
				// Tiptap's own StarterKit keymap already owns those inside an
				// editor, and intercepting them here would either duplicate
				// or fight it.
				return null;
		}
	}

	if (event.shiftKey) return null;

	if (key === 'escape') return 'stepOut';
	// Only outside text entry — inside, these are ordinary character deletes
	// and must reach ProseMirror untouched.
	if ((key === 'backspace' || key === 'delete') && !event.inTextEntry) return 'deleteBlock';

	return null;
}

/** Whether an event target is somewhere the user is typing — see {@link ShortcutEvent.inTextEntry}. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

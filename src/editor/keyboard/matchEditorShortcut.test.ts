import { describe, expect, it } from 'vitest';
import { matchEditorShortcut, type ShortcutEvent } from './matchEditorShortcut';

function event(overrides: Partial<ShortcutEvent> & Pick<ShortcutEvent, 'key'>): ShortcutEvent {
	return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, inTextEntry: false, ...overrides };
}

describe('matchEditorShortcut', () => {
	it('maps Cmd+Z to undo and Shift+Cmd+Z to redo', () => {
		expect(matchEditorShortcut(event({ key: 'z', metaKey: true }))).toBe('undo');
		// Shift makes the browser report an uppercase key — normalizing is why
		// this doesn't need its own table entry.
		expect(matchEditorShortcut(event({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
	});

	it('accepts Ctrl as the modifier too, for non-macOS', () => {
		expect(matchEditorShortcut(event({ key: 'z', ctrlKey: true }))).toBe('undo');
		expect(matchEditorShortcut(event({ key: 's', ctrlKey: true }))).toBe('forceSave');
	});

	it('maps the remaining modifier shortcuts from §9.3', () => {
		expect(matchEditorShortcut(event({ key: 'd', metaKey: true }))).toBe('duplicate');
		expect(matchEditorShortcut(event({ key: 's', metaKey: true }))).toBe('forceSave');
		expect(matchEditorShortcut(event({ key: 'p', metaKey: true }))).toBe('togglePreview');
		expect(matchEditorShortcut(event({ key: 'k', metaKey: true }))).toBe('insertLink');
	});

	it('ignores anything with Alt held, so OS/browser combinations are not swallowed', () => {
		expect(matchEditorShortcut(event({ key: 'z', metaKey: true, altKey: true }))).toBeNull();
		expect(matchEditorShortcut(event({ key: 'escape', altKey: true }))).toBeNull();
	});

	it('does not claim Cmd+B/I/U — Tiptap owns those inside an editor', () => {
		for (const key of ['b', 'i', 'u']) {
			expect(matchEditorShortcut(event({ key, metaKey: true }))).toBeNull();
		}
	});

	it('ignores an unmapped modifier combination rather than guessing', () => {
		expect(matchEditorShortcut(event({ key: 'q', metaKey: true }))).toBeNull();
		expect(matchEditorShortcut(event({ key: 'd', metaKey: true, shiftKey: true }))).toBeNull();
	});

	it('maps Escape to stepOut, whether or not the caret is in text', () => {
		expect(matchEditorShortcut(event({ key: 'Escape' }))).toBe('stepOut');
		expect(matchEditorShortcut(event({ key: 'Escape', inTextEntry: true }))).toBe('stepOut');
	});

	it('maps Backspace/Delete to deleteBlock ONLY outside text entry', () => {
		expect(matchEditorShortcut(event({ key: 'Backspace' }))).toBe('deleteBlock');
		expect(matchEditorShortcut(event({ key: 'Delete' }))).toBe('deleteBlock');
		// The important half: inside an editor these are ordinary character
		// deletes and must reach ProseMirror untouched.
		expect(matchEditorShortcut(event({ key: 'Backspace', inTextEntry: true }))).toBeNull();
		expect(matchEditorShortcut(event({ key: 'Delete', inTextEntry: true }))).toBeNull();
	});

	it('ignores plain typing', () => {
		expect(matchEditorShortcut(event({ key: 'a' }))).toBeNull();
		expect(matchEditorShortcut(event({ key: 'z' }))).toBeNull();
		expect(matchEditorShortcut(event({ key: 'Enter' }))).toBeNull();
	});
});

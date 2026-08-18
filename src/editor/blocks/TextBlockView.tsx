import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect } from 'react';
import type { RichTextDoc, TextBlock } from '../types';
import { setBlockDoc } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { BlockViewProps } from './types';

// `@tiptap/react`'s JSONContent and our structural RichTextDoc describe the
// same ProseMirror doc JSON — this domain model deliberately doesn't import
// Tiptap types (see types.ts), so the boundary is a cast, not a converter.
function toJSONContent(doc: RichTextDoc): JSONContent {
	return doc;
}

function toRichTextDoc(doc: JSONContent): RichTextDoc {
	return doc as RichTextDoc;
}

export function TextBlockView({ pageId, block }: BlockViewProps<TextBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);

	const editor = useEditor({
		extensions: [
			// This app owns undo/redo (the command stack) so the whole
			// TemplateBody stays the unit of undo, not just this one editor's
			// ProseMirror history — otherwise Ctrl+Z inside a focused block
			// would fight with the toolbar's undo button.
			StarterKit.configure({ undoRedo: false }),
		],
		content: toJSONContent(block.doc),
		// §4.3: "Locked blocks are non-editable." Enforced here rather than
		// only in the command layer — `editable: false` blocks ProseMirror's
		// own contenteditable input at the source, not just the resulting
		// setBlockDoc call (which has no locked check itself; content editing
		// isn't gated by a command-layer throw the way delete/move are).
		editable: !block.locked,
		onUpdate: ({ editor: e }) => {
			runCommand(setBlockDoc(pageId, block.id, toRichTextDoc(e.getJSON())), { coalesceKey: block.id });
		},
		onBlur: () => endCoalescing(),
	});

	// Keeps this editor in sync with changes that didn't originate from it —
	// undo/redo, or (once cross-page moves land) another block's edit landing
	// here via drag. The stringify comparison is cheap at block-doc size and
	// avoids the alternative of threading an "origin" flag through the store.
	useEffect(() => {
		if (!editor) return;
		const current = JSON.stringify(editor.getJSON());
		const incoming = JSON.stringify(block.doc);
		if (current !== incoming) {
			editor.commands.setContent(toJSONContent(block.doc), { emitUpdate: false });
		}
	}, [editor, block.doc]);

	// `useEditor`'s `editable` option only takes effect at creation — toggling
	// Lock on an already-mounted block wouldn't otherwise update a live
	// editor's contenteditable state until it happened to remount.
	useEffect(() => {
		editor?.setEditable(!block.locked);
	}, [editor, block.locked]);

	return <EditorContent editor={editor} className="block-text" />;
}

import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { useEffect } from 'react';
import type { RichTextDoc, TextBlock } from '../types';
import { setBlockDoc } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { richTextExtensions } from '../richtext/richTextExtensions';
import { docsEqual, normalizeDoc } from '../richtext/docNormalization';
import { clearActiveRichTextEditorIf, registerRichTextEditor, setActiveRichTextEditor } from '../richtext/activeRichTextEditor';
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
		extensions: richTextExtensions(),
		content: toJSONContent(block.doc),
		// §4.3: "Locked blocks are non-editable." Enforced here rather than
		// only in the command layer — `editable: false` blocks ProseMirror's
		// own contenteditable input at the source, not just the resulting
		// setBlockDoc call (which has no locked check itself; content editing
		// isn't gated by a command-layer throw the way delete/move are).
		editable: !block.locked,
		onUpdate: ({ editor: e }) => {
			const next = toRichTextDoc(e.getJSON());
			// Tiptap fires onUpdate when *parsing* normalizes the content it was
			// given, not only when the user edits — and the `TextAlign`
			// extension makes that happen for every paragraph, since a global
			// attribute serializes as `textAlign: null` where a stored doc has
			// no `attrs` at all. Without this guard every block mount ran a
			// command: a freshly opened template went dirty on load and the undo
			// stack filled with entries that changed nothing visible. See
			// richtext/docNormalization.ts.
			if (docsEqual(next, block.doc)) return;
			// Stored canonicalized, so the doc that lands in Stratus doesn't
			// carry a `textAlign: null` on every paragraph forever.
			runCommand(setBlockDoc(pageId, block.id, normalizeDoc(next)), { coalesceKey: block.id });
		},
		// The block id travels with the editor so the toolbar knows which block's
		// stored doc the current selection belongs to.
		onFocus: ({ editor: e }) => setActiveRichTextEditor(e, block.id),
		onBlur: () => endCoalescing(),
	});

	// Keeps this editor in sync with changes that didn't originate from it —
	// undo/redo, or a block moving here from elsewhere. Compares canonicalized
	// docs rather than raw JSON: the editor's own serialization always carries
	// the global attributes described above, so a raw comparison would report a
	// mismatch on every render and re-`setContent` in a loop.
	useEffect(() => {
		if (!editor) return;
		if (!docsEqual(toRichTextDoc(editor.getJSON()), block.doc)) {
			editor.commands.setContent(toJSONContent(block.doc), { emitUpdate: false });
		}
	}, [editor, block.doc]);

	// `useEditor`'s `editable` option only takes effect at creation — toggling
	// Lock on an already-mounted block wouldn't otherwise update a live
	// editor's contenteditable state until it happened to remount.
	useEffect(() => {
		editor?.setEditable(!block.locked);
	}, [editor, block.locked]);

	// The active-editor ref deliberately survives blur (see
	// activeRichTextEditor.ts), so unmount is the only thing that can retire
	// it — otherwise deleting the block the toolbar last pointed at leaves the
	// toolbar enabled and silently inert against a destroyed ProseMirror.
	useEffect(() => {
		if (!editor) return;
		// Registered for as long as it's mounted, so a merge field dragged from
		// the Variables panel can find this editor by the coordinate it was
		// dropped on — see `richTextEditorAtPoint`.
		const unregister = registerRichTextEditor(editor);
		return () => {
			unregister();
			clearActiveRichTextEditorIf(editor);
		};
	}, [editor]);

	return (
		<EditorContent editor={editor} className="block-text" />
	);
}

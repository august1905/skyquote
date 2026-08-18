import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect } from 'react';
import type { RichTextDoc } from '../types';

function toJSONContent(doc: RichTextDoc): JSONContent {
	return doc;
}

function toRichTextDoc(doc: JSONContent): RichTextDoc {
	return doc as RichTextDoc;
}

interface TableCellEditorProps {
	doc: RichTextDoc;
	onChange: (doc: RichTextDoc) => void;
	onBlur: () => void;
}

/**
 * One Tiptap instance per cell — the same approach `TextBlockView` uses for
 * a whole block, just scoped smaller. Verified affordable for the table
 * sizes this block's default/typical use produces (a handful of rows and
 * columns); not load-tested for a large spreadsheet-sized table — see
 * BUILD_STATUS.md.
 */
export function TableCellEditor({ doc, onChange, onBlur }: TableCellEditorProps) {
	const editor = useEditor({
		extensions: [StarterKit.configure({ undoRedo: false })],
		content: toJSONContent(doc),
		onUpdate: ({ editor: e }) => onChange(toRichTextDoc(e.getJSON())),
		onBlur,
	});

	// See TextBlockView's identical effect for why this sync is needed —
	// undo/redo (and, once cross-table moves exist, another origin) can
	// change `doc` without this editor instance having produced the change.
	useEffect(() => {
		if (!editor) return;
		const current = JSON.stringify(editor.getJSON());
		const incoming = JSON.stringify(doc);
		if (current !== incoming) {
			editor.commands.setContent(toJSONContent(doc), { emitUpdate: false });
		}
	}, [editor, doc]);

	return <EditorContent editor={editor} className="block-table-cell" />;
}

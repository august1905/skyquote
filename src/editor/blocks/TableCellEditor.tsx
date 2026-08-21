import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { useEffect } from 'react';
import type { RichTextDoc } from '../types';
import { richTextExtensions } from '../richtext/richTextExtensions';
import { docsEqual, normalizeDoc } from '../richtext/docNormalization';
import { clearActiveRichTextEditorIf, setActiveRichTextEditor } from '../richtext/activeRichTextEditor';

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
	/** §4.3: a locked table's cells are non-editable too — the whole block locks, not individual cells. */
	locked: boolean;
}

/**
 * One Tiptap instance per cell — the same approach `TextBlockView` uses for
 * a whole block, just scoped smaller. Verified affordable for the table
 * sizes this block's default/typical use produces (a handful of rows and
 * columns); not load-tested for a large spreadsheet-sized table — see
 * BUILD_STATUS.md.
 */
export function TableCellEditor({ doc, onChange, onBlur, locked }: TableCellEditorProps) {
	const editor = useEditor({
		extensions: richTextExtensions(),
		content: toJSONContent(doc),
		editable: !locked,
		onUpdate: ({ editor: e }) => {
			const next = toRichTextDoc(e.getJSON());
			// Same parse-time-normalization guard as TextBlockView — without it
			// every cell of every table pushed a command on mount. See
			// richtext/docNormalization.ts.
			if (docsEqual(next, doc)) return;
			onChange(normalizeDoc(next));
		},
		onFocus: ({ editor: e }) => setActiveRichTextEditor(e),
		onBlur,
	});

	// See TextBlockView's identical effect for why this sync is needed —
	// undo/redo (and, once cross-table moves exist, another origin) can
	// change `doc` without this editor instance having produced the change.
	useEffect(() => {
		if (!editor) return;
		if (!docsEqual(toRichTextDoc(editor.getJSON()), doc)) {
			editor.commands.setContent(toJSONContent(doc), { emitUpdate: false });
		}
	}, [editor, doc]);

	// See TextBlockView's identical effect for why `editable` needs its own
	// effect rather than relying on the option above alone.
	useEffect(() => {
		editor?.setEditable(!locked);
	}, [editor, locked]);

	// See TextBlockView's identical cleanup — a removed row/column destroys
	// this cell's editor, which must not stay the toolbar's target.
	useEffect(() => {
		if (!editor) return;
		return () => clearActiveRichTextEditorIf(editor);
	}, [editor]);

	return <EditorContent editor={editor} className="block-table-cell" />;
}

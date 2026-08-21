import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import type { RichTextDoc, TextBlock } from '../types';
import { setBlockDoc } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { richTextExtensions } from '../richtext/richTextExtensions';
import { docsEqual, normalizeDoc } from '../richtext/docNormalization';
import { clearActiveRichTextEditorIf, setActiveRichTextEditor } from '../richtext/activeRichTextEditor';
import { COMMENT_ID_ATTRIBUTE, commentHighlightKey, type CommentHighlightRange } from '../comments/commentHighlight';
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
	const comments = useEditorStore((s) => s.comments);
	const activeCommentId = useEditorStore((s) => s.activeCommentId);
	const setActiveCommentId = useEditorStore((s) => s.setActiveCommentId);

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
		// The block id travels with the editor so §12's "comment on the selected
		// text" knows which block's stored doc a captured range belongs to.
		onFocus: ({ editor: e }) => setActiveRichTextEditor(e, block.id),
		onBlur: () => endCoalescing(),
	});

	// §12's text-range anchors, as ProseMirror decorations. Only root comments
	// carry an anchor — a reply inherits its thread's — so replies are filtered
	// out here rather than drawing the same highlight once per message.
	const commentRanges = useMemo<CommentHighlightRange[]>(
		() =>
			comments
				.filter(
					(comment) =>
						!comment.parentCommentId && comment.blockId === block.id && comment.anchorStart != null && comment.anchorEnd != null
				)
				.map((comment) => ({
					commentId: comment.id,
					from: comment.anchorStart as number,
					to: comment.anchorEnd as number,
					active: comment.id === activeCommentId,
					resolved: Boolean(comment.resolvedAt),
				})),
		[comments, block.id, activeCommentId]
	);

	// Handed to the plugin as transaction metadata rather than as an extension
	// option, because options are fixed at editor creation and this set changes
	// every time anyone comments. A metadata-only transaction doesn't change the
	// doc, so it can't trip `onUpdate` above into saving anything.
	useEffect(() => {
		if (!editor) return;
		editor.view.dispatch(editor.state.tr.setMeta(commentHighlightKey, commentRanges));
	}, [editor, commentRanges]);

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
		return () => clearActiveRichTextEditorIf(editor);
	}, [editor]);

	return (
		<EditorContent
			editor={editor}
			className="block-text"
			// Clicking a highlighted passage opens its thread. Delegated from the
			// wrapper rather than bound per decoration: decorations are recreated
			// on every doc change, so per-span listeners would have to be
			// re-attached constantly — the `data-comment-id` the plugin writes is
			// the stable handle.
			onClick={(event) => {
				const target = event.target as HTMLElement | null;
				const commentId = target?.closest(`[${COMMENT_ID_ATTRIBUTE}]`)?.getAttribute(COMMENT_ID_ATTRIBUTE);
				if (commentId) setActiveCommentId(commentId);
			}}
		/>
	);
}

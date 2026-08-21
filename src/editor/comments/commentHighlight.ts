import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** One commented text range inside a single block's editor. */
export interface CommentHighlightRange {
	/** The root comment's id — becomes `data-comment-id` on the rendered span, which is how a click gets back to the thread. */
	commentId: string;
	from: number;
	to: number;
	/** The thread currently open in the sidebar renders stronger, so selecting a thread shows you where it points. */
	active: boolean;
	resolved: boolean;
}

export const commentHighlightKey = new PluginKey<DecorationSet>('commentHighlight');

/** The attribute a click handler reads to map a click on highlighted text back to its thread. */
export const COMMENT_ID_ATTRIBUTE = 'data-comment-id';

function buildDecorations(doc: import('@tiptap/pm/model').Node, ranges: CommentHighlightRange[]): DecorationSet {
	const decorations = ranges
		// Out-of-bounds ranges are dropped rather than clamped: a stale anchor
		// pointing past the end of the text should stop highlighting entirely
		// (the sidebar shows the thread as detached), not highlight whatever
		// now happens to sit at the end. See commentAnchors.ts's isAnchorInBounds.
		.filter((range) => range.from >= 0 && range.to <= doc.content.size && range.to > range.from)
		.map((range) =>
			Decoration.inline(range.from, range.to, {
				class: `comment-highlight${range.active ? ' comment-highlight-active' : ''}${range.resolved ? ' comment-highlight-resolved' : ''}`,
				[COMMENT_ID_ATTRIBUTE]: range.commentId,
			})
		);
	return DecorationSet.create(doc, decorations);
}

/**
 * §12: comments "anchored to a block or a text range". This draws the text-range
 * half as ProseMirror **decorations**, which is the load-bearing detail —
 * decorations are a view-layer overlay and never enter the document, so
 * highlighting a commented passage doesn't change the block's stored doc, doesn't
 * mark the template dirty, and doesn't produce an undo entry. A `comment` *mark*
 * would have done all three, and would have made a comment un-postable by anyone
 * who doesn't hold §12's exclusive edit lock.
 *
 * Ranges arrive by transaction metadata rather than extension options, because
 * options are fixed when the editor is created and the set of comments on a
 * block changes constantly. Between updates the decorations are `map`ped through
 * each transaction, so a highlight follows its text while the user types around
 * it — within one session. Across sessions the stored offsets are all there is,
 * which is where drift comes from.
 */
export const CommentHighlight = Extension.create({
	name: 'commentHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<DecorationSet>({
				key: commentHighlightKey,
				state: {
					init: () => DecorationSet.empty,
					apply(tr, value) {
						const incoming = tr.getMeta(commentHighlightKey) as CommentHighlightRange[] | undefined;
						if (incoming) return buildDecorations(tr.doc, incoming);
						return value.map(tr.mapping, tr.doc);
					},
				},
				props: {
					decorations: (state) => commentHighlightKey.getState(state),
				},
			}),
		];
	},
});

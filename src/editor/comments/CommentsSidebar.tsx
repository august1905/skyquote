import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { blockTypeLabel } from '../blocks/registry';
import { findBlockById } from '../commands/blockTree';
import { useEditorStore } from '../store/editorStore';
import { ensureMentionableUsers } from '../workspaceData';
import { CommentComposer } from './CommentComposer';
import { CommentThreadView } from './CommentThreadView';
import {
	groupIntoThreads,
	isAnchorInBounds,
	richTextDocSize,
	sortThreadsByDocumentOrder,
	unresolvedThreadCount,
	type CommentThread,
} from './commentAnchors';
import { useComments } from './useComments';
import './comments.css';

/**
 * §12's comment sidebar, toggled from the header's comment icon.
 *
 * Threads are listed in document order rather than by time posted (see
 * `sortThreadsByDocumentOrder`) and resolved threads are hidden behind a
 * toggle — §12 asks for "resolvable", which means out of the way but still
 * reachable, not deleted.
 */
export function CommentsSidebar({ onClose }: { onClose: () => void }) {
	// The @-mention list is only ever read in here and in the composers this
	// renders, so it loads with the sidebar rather than with the editor.
	useEffect(() => {
		void ensureMentionableUsers();
	}, []);

	const comments = useEditorStore((s) => s.comments);
	const authors = useEditorStore((s) => s.commentAuthors);
	const mentionableUsers = useEditorStore((s) => s.mentionableUsers);
	const commentsStatus = useEditorStore((s) => s.commentsStatus);
	const activeCommentId = useEditorStore((s) => s.activeCommentId);
	const setActiveCommentId = useEditorStore((s) => s.setActiveCommentId);
	const pendingAnchor = useEditorStore((s) => s.pendingCommentAnchor);
	const setPendingCommentAnchor = useEditorStore((s) => s.setPendingCommentAnchor);
	const pages = useEditorStore((s) => s.body?.pages);
	const { post } = useComments();
	const [showResolved, setShowResolved] = useState(false);

	const close = useCallback(() => onClose(), [onClose]);
	useCloseOnEscape(true, close);

	const threads = useMemo(() => sortThreadsByDocumentOrder(groupIntoThreads(comments), pages), [comments, pages]);
	const visible = showResolved ? threads : threads.filter((thread) => !thread.root.resolvedAt);
	const resolvedCount = threads.length - unresolvedThreadCount(threads);

	/**
	 * The block a thread points at, as a human label — and whether its text
	 * anchor survived. Both are resolved here rather than in the thread view so
	 * the block tree is walked once per render instead of once per thread.
	 */
	function describeAnchor(thread: CommentThread): { blockLabel: string | null; anchorIntact: boolean } {
		if (!thread.root.blockId) return { blockLabel: 'This template', anchorIntact: true };
		const block = pages ? findBlockById(pages, thread.root.blockId) : null;
		if (!block) return { blockLabel: null, anchorIntact: false };
		const label = blockTypeLabel(block.type);
		if (thread.root.anchorStart == null) return { blockLabel: label, anchorIntact: true };
		// Only a text block carries a doc to measure; a range anchored to any
		// other block type can't be intact because it could never be drawn.
		const docSize = block.type === 'text' ? richTextDocSize(block.doc) : 0;
		return { blockLabel: label, anchorIntact: isAnchorInBounds(thread.root, docSize) };
	}

	const pendingBlock = pendingAnchor && pages ? findBlockById(pages, pendingAnchor.blockId) : null;

	return (
		<aside className="comments-sidebar" aria-label="Comments">
			<div className="comments-sidebar-header">
				<h2>Comments</h2>
				<button type="button" aria-label="Close comments" onClick={onClose}>
					×
				</button>
			</div>

			{pendingAnchor && (
				<div className="comments-new-thread">
					<p className="comments-new-thread-target">
						New comment on {pendingBlock ? blockTypeLabel(pendingBlock.type) : 'this block'}
						{pendingAnchor.anchorStart !== undefined ? ' · selected text' : ''}
					</p>
					<CommentComposer
						label="Comment"
						// "Post comment", not "Comment": the block ⋯ menu's own entry
						// point is already named "Comment", and two buttons sharing an
						// accessible name is both an accessibility smell and unaddressable
						// by any test.
						submitLabel="Post comment"
						mentionableUsers={mentionableUsers}
						autoFocus
						onSubmit={async (body) => {
							await post({
								body,
								blockId: pendingAnchor.blockId,
								...(pendingAnchor.anchorStart !== undefined && pendingAnchor.anchorEnd !== undefined
									? { anchorStart: pendingAnchor.anchorStart, anchorEnd: pendingAnchor.anchorEnd }
									: {}),
							});
						}}
						onCancel={() => setPendingCommentAnchor(null)}
					/>
				</div>
			)}

			{commentsStatus === 'loading' && <p className="comments-sidebar-empty">Loading comments…</p>}
			{commentsStatus === 'error' && (
				<p className="comments-sidebar-empty" role="alert">
					Couldn&apos;t load comments.
				</p>
			)}
			{commentsStatus === 'ready' && visible.length === 0 && !pendingAnchor && (
				<p className="comments-sidebar-empty">
					No {showResolved ? '' : 'open '}comments. Select a block and use its ⋯ menu to start one.
				</p>
			)}

			<ul className="comments-thread-list">
				{visible.map((thread) => {
					const { blockLabel, anchorIntact } = describeAnchor(thread);
					return (
						<CommentThreadView
							key={thread.root.id}
							thread={thread}
							authors={authors}
							mentionableUsers={mentionableUsers}
							active={activeCommentId === thread.root.id}
							anchorIntact={anchorIntact}
							blockLabel={blockLabel}
							onSelect={() => {
								setActiveCommentId(thread.root.id);
								scrollToBlock(thread.root.blockId);
							}}
						/>
					);
				})}
			</ul>

			{resolvedCount > 0 && (
				<button type="button" className="comments-resolved-toggle" onClick={() => setShowResolved((shown) => !shown)}>
					{showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
				</button>
			)}
		</aside>
	);
}

/**
 * Brings the commented block into view when its thread is selected.
 *
 * Reads the DOM directly rather than going through the store: the canvas owns
 * scroll position, there's no scroll state to coordinate, and the alternative
 * (a "scroll to this block" flag in the store that the canvas watches and then
 * has to clear) would be more moving parts for the same effect.
 */
function scrollToBlock(blockId: string | null): void {
	if (!blockId) return;
	const node = document.querySelector(`[data-block-id="${blockId}"]`);
	node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

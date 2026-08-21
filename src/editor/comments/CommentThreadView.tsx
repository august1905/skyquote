import { useState } from 'react';
import type { Comment, CommentAuthor, MentionableUser } from '../../api/comments';
import { useAuth } from '../../auth/AuthContext';
import { CommentBody } from './CommentBody';
import { CommentComposer } from './CommentComposer';
import { hasTextAnchor, type CommentThread } from './commentAnchors';
import { useComments } from './useComments';

interface CommentThreadViewProps {
	thread: CommentThread;
	authors: CommentAuthor[];
	mentionableUsers: MentionableUser[];
	active: boolean;
	/** Whether the thread's text-range anchor still points inside its block's current text. False means the highlight is gone and the thread renders as detached. */
	anchorIntact: boolean;
	/** Null when the thread's block has been deleted since the comment was posted. */
	blockLabel: string | null;
	onSelect: () => void;
}

function authorName(authors: CommentAuthor[], userId: string): string {
	return authors.find((author) => author.id === userId)?.name || 'Unknown';
}

/** Short and absolute rather than "3 hours ago": a relative label has to be re-rendered to stay true, and a comment sidebar is often left open for hours. */
function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One thread: the root comment, its replies, and whichever composer is open. */
export function CommentThreadView({
	thread,
	authors,
	mentionableUsers,
	active,
	anchorIntact,
	blockLabel,
	onSelect,
}: CommentThreadViewProps) {
	const { user } = useAuth();
	const { reply, edit, setResolved, remove } = useComments();
	const [replying, setReplying] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const resolved = Boolean(thread.root.resolvedAt);

	function canEdit(comment: Comment): boolean {
		return Boolean(user && comment.authorUserId === user.id);
	}

	function canDelete(comment: Comment): boolean {
		// Mirrors the backend's own rule (routes/comments.js): an admin can
		// delete anyone's comment but can never edit one — a deletion is visible,
		// a silent rewrite of someone's words is not.
		return Boolean(user && (comment.authorUserId === user.id || user.role === 'admin'));
	}

	function renderMessage(comment: Comment, isRoot: boolean) {
		if (editingId === comment.id) {
			return (
				<CommentComposer
					key={comment.id}
					label="Edit comment"
					initialValue={comment.body}
					submitLabel="Save"
					mentionableUsers={mentionableUsers}
					autoFocus
					onSubmit={async (body) => {
						await edit(comment.id, body);
						setEditingId(null);
					}}
					onCancel={() => setEditingId(null)}
				/>
			);
		}
		return (
			<div key={comment.id} className={isRoot ? 'comment-message comment-message-root' : 'comment-message comment-message-reply'}>
				<div className="comment-message-meta">
					<span className="comment-author">{authorName(authors, comment.authorUserId)}</span>
					<span className="comment-time">{formatTimestamp(comment.createdAt)}</span>
					{comment.editedAt && <span className="comment-edited">edited</span>}
				</div>
				<CommentBody body={comment.body} users={mentionableUsers.length > 0 ? mentionableUsers : authors} />
				<div className="comment-message-actions">
					{canEdit(comment) && (
						<button type="button" onClick={() => setEditingId(comment.id)}>
							Edit
						</button>
					)}
					{canDelete(comment) && (
						<button type="button" onClick={() => void remove(comment.id)}>
							{isRoot ? 'Delete thread' : 'Delete'}
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<li
			className={`comment-thread${active ? ' comment-thread-active' : ''}${resolved ? ' comment-thread-resolved' : ''}`}
			data-comment-id={thread.root.id}
		>
			{/* The whole card is the click target for focusing a thread, but it's a
			    button rather than a div-with-onClick so it's reachable by keyboard
			    — §13's "full keyboard operation". The messages below sit outside
			    it, since nesting the Edit/Delete buttons inside a button is
			    invalid HTML and breaks their clicks. */}
			<button type="button" className="comment-thread-header" onClick={onSelect} aria-expanded={active}>
				<span className="comment-thread-location">
					{blockLabel === null
						? 'Deleted block'
						: hasTextAnchor(thread.root)
							? anchorIntact
								? `${blockLabel} · selected text`
								: `${blockLabel} · text has changed`
							: blockLabel}
				</span>
				{resolved && <span className="comment-thread-badge">Resolved</span>}
				{thread.replies.length > 0 && <span className="comment-thread-count">{thread.replies.length + 1} messages</span>}
			</button>

			{renderMessage(thread.root, true)}
			{/* Replies are collapsed until the thread is focused, so a sidebar of
			    long conversations stays scannable. */}
			{(active || thread.replies.length <= 2) && thread.replies.map((child) => renderMessage(child, false))}
			{!active && thread.replies.length > 2 && (
				<p className="comment-thread-more">{thread.replies.length} replies — select to read</p>
			)}

			<div className="comment-thread-footer">
				<button type="button" onClick={() => void setResolved(thread.root.id, !resolved)}>
					{resolved ? 'Reopen' : 'Resolve'}
				</button>
				{!resolved &&
					(replying ? null : (
						<button
							type="button"
							onClick={() => {
								onSelect();
								setReplying(true);
							}}
						>
							Reply
						</button>
					))}
			</div>
			{replying && (
				<CommentComposer
					label="Reply"
					// Distinct from the "Reply" button that opened this composer — see
					// the sidebar's "Post comment" for why.
					submitLabel="Post reply"
					mentionableUsers={mentionableUsers}
					autoFocus
					onSubmit={async (body) => {
						await reply(thread.root.id, body);
						setReplying(false);
					}}
					onCancel={() => setReplying(false)}
				/>
			)}
		</li>
	);
}

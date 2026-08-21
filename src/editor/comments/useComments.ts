import { useCallback, useMemo } from 'react';
import {
	createComment,
	deleteComment,
	setCommentResolved,
	updateComment,
	type Comment,
} from '../../api/comments';
import { useAuth } from '../../auth/AuthContext';
import { useEditorStore } from '../store/editorStore';
import { parseMentions } from './commentAnchors';

/**
 * §12's comment verbs — post, reply, edit, resolve, delete — in one place, so
 * the sidebar, the block toolbar's "Comment" action and the canvas's
 * click-a-highlight path all mutate through identical logic.
 *
 * A hook rather than commands, for the same reason `useContentLibrary` is:
 * these talk to the backend and touch no part of the template body, so they
 * belong nowhere near the synchronous, pure `Command` layer or its undo stack.
 * Cmd+Z must never un-post a colleague's question.
 *
 * Every mutation caches the row the backend returned rather than refetching —
 * the response *is* authoritative, so a refetch would be a second round trip
 * for data already in hand.
 */
export function useComments() {
	const { user } = useAuth();
	const upsertComment = useEditorStore((s) => s.upsertComment);
	const removeComments = useEditorStore((s) => s.removeComments);
	const setActiveCommentId = useEditorStore((s) => s.setActiveCommentId);
	const setPendingCommentAnchor = useEditorStore((s) => s.setPendingCommentAnchor);

	/**
	 * The author record for the current user, so their own freshly posted
	 * comment renders with their name instead of "Unknown" — the author list
	 * from the initial fetch won't contain them if they hadn't commented yet.
	 */
	const selfAuthor = useMemo(
		() => (user ? { id: user.id, name: `${user.first_name} ${user.last_name}`.trim() || user.email } : undefined),
		[user]
	);

	const post = useCallback(
		async (input: { body: string; blockId?: string | undefined; anchorStart?: number; anchorEnd?: number }): Promise<Comment | null> => {
			const { meta, mentionableUsers } = useEditorStore.getState();
			if (!meta) return null;
			const comment = await createComment({
				templateId: meta.id,
				body: input.body,
				...(input.blockId ? { blockId: input.blockId } : {}),
				...(input.anchorStart !== undefined && input.anchorEnd !== undefined
					? { anchorStart: input.anchorStart, anchorEnd: input.anchorEnd }
					: {}),
				mentionedUserIds: parseMentions(input.body, mentionableUsers),
			});
			upsertComment(comment, selfAuthor);
			// Posting a thread focuses it: the new comment is what the author is
			// looking at, and its highlight should be the strong one.
			setPendingCommentAnchor(null);
			setActiveCommentId(comment.id);
			return comment;
		},
		[selfAuthor, setActiveCommentId, setPendingCommentAnchor, upsertComment]
	);

	const reply = useCallback(
		async (rootCommentId: string, body: string): Promise<Comment | null> => {
			const { meta, mentionableUsers } = useEditorStore.getState();
			if (!meta) return null;
			const comment = await createComment({
				templateId: meta.id,
				parentCommentId: rootCommentId,
				body,
				mentionedUserIds: parseMentions(body, mentionableUsers),
			});
			upsertComment(comment, selfAuthor);
			return comment;
		},
		[selfAuthor, upsertComment]
	);

	const edit = useCallback(
		async (commentId: string, body: string): Promise<void> => {
			const { mentionableUsers } = useEditorStore.getState();
			const comment = await updateComment(commentId, body, parseMentions(body, mentionableUsers));
			upsertComment(comment);
		},
		[upsertComment]
	);

	const setResolved = useCallback(
		async (rootCommentId: string, resolved: boolean): Promise<void> => {
			const comment = await setCommentResolved(rootCommentId, resolved);
			upsertComment(comment);
			// Resolving collapses the thread out of the default view, so keeping
			// it focused would leave the sidebar pointing at something no longer
			// listed.
			if (resolved) setActiveCommentId(null);
		},
		[setActiveCommentId, upsertComment]
	);

	const remove = useCallback(
		async (commentId: string): Promise<void> => {
			const deletedIds = await deleteComment(commentId);
			removeComments(deletedIds);
		},
		[removeComments]
	);

	return { post, reply, edit, setResolved, remove };
}

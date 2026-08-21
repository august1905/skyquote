import apiFetch from './client';

/**
 * §12's comments. One row per message; a thread is a root comment plus every
 * comment whose `parentCommentId` is that root (see `groupIntoThreads`).
 *
 * Comments are stored entirely outside the template body — they are not marks
 * in the block tree — so posting one never dirties the template and never
 * needs §12's exclusive edit lock. The cost of that choice is that a
 * text-range anchor is a pair of positions rather than a mark ProseMirror
 * maintains through edits; `editor/comments/commentAnchors.ts` handles the
 * drift that follows.
 */
export interface Comment {
	id: string;
	templateId: string;
	/** null for a reply (a reply inherits its root's anchor) and for a template-level comment. */
	blockId: string | null;
	/** ProseMirror document positions inside `blockId`'s editor. Both null for a block-level anchor. */
	anchorStart: number | null;
	anchorEnd: number | null;
	/** null on a root comment; the root's id on a reply. Threading is one level deep. */
	parentCommentId: string | null;
	body: string;
	authorUserId: string;
	mentionedUserIds: string[];
	createdAt: string;
	/** null unless the author has edited it since posting. */
	editedAt: string | null;
	/** null = unresolved. Only ever set on a root comment. */
	resolvedAt: string | null;
	resolvedByUserId: string | null;
}

/** Display names for the authors appearing in a comment list, sent alongside it so a ten-reply thread carries one name per person rather than one per message. */
export interface CommentAuthor {
	id: string;
	name: string;
}

export interface MentionableUser {
	id: string;
	name: string;
	email: string;
}

export async function listComments(templateId: string): Promise<{ comments: Comment[]; authors: CommentAuthor[] }> {
	return apiFetch<{ comments: Comment[]; authors: CommentAuthor[] }>(`/comments?templateId=${encodeURIComponent(templateId)}`);
}

export async function listMentionableUsers(): Promise<MentionableUser[]> {
	const { users } = await apiFetch<{ users: MentionableUser[] }>('/comments/mentionable-users');
	return users;
}

export interface CreateCommentInput {
	templateId: string;
	body: string;
	blockId?: string | null;
	anchorStart?: number;
	anchorEnd?: number;
	parentCommentId?: string;
	mentionedUserIds?: string[];
}

export async function createComment(input: CreateCommentInput): Promise<Comment> {
	const { comment } = await apiFetch<{ comment: Comment }>('/comments', {
		method: 'POST',
		body: JSON.stringify(input),
	});
	return comment;
}

/** Author-only, enforced server-side — editing someone else's words is the one thing a comment system must never allow. */
export async function updateComment(id: string, body: string, mentionedUserIds: string[]): Promise<Comment> {
	const { comment } = await apiFetch<{ comment: Comment }>(`/comments/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ body, mentionedUserIds }),
	});
	return comment;
}

/** Resolving is a property of the whole thread, so `id` must be a root comment's id. */
export async function setCommentResolved(id: string, resolved: boolean): Promise<Comment> {
	const { comment } = await apiFetch<{ comment: Comment }>(`/comments/${id}/resolve`, {
		method: resolved ? 'POST' : 'DELETE',
	});
	return comment;
}

/** Deleting a root deletes its replies too; the response lists everything that went. */
export async function deleteComment(id: string): Promise<string[]> {
	const { deletedIds } = await apiFetch<{ deletedIds: string[] }>(`/comments/${id}`, { method: 'DELETE' });
	return deletedIds;
}

import type { Comment, CommentAuthor, MentionableUser } from '../../api/comments';
import type { Block, BlockId, Page, RichTextNode } from '../types';

/**
 * §12's "threaded" — one root comment and its replies, in the order they were
 * posted. Deliberately one level deep: a reply to a reply is stored against
 * the same root, which is what a threaded comment sidebar means in every tool
 * that has one.
 */
export interface CommentThread {
	root: Comment;
	replies: Comment[];
}

export function groupIntoThreads(comments: Comment[]): CommentThread[] {
	const roots = comments.filter((comment) => !comment.parentCommentId);
	const repliesByRoot = new Map<string, Comment[]>();
	for (const comment of comments) {
		if (!comment.parentCommentId) continue;
		const existing = repliesByRoot.get(comment.parentCommentId);
		if (existing) existing.push(comment);
		else repliesByRoot.set(comment.parentCommentId, [comment]);
	}
	// A reply whose root was deleted is dropped rather than promoted to a root
	// of its own: the backend deletes replies with their root, so this only
	// happens if that cascade partially failed, and showing an answer with no
	// question would be worse than showing nothing.
	return roots.map((root) => ({ root, replies: repliesByRoot.get(root.id) ?? [] }));
}

/**
 * Sidebar order: **document order**, so scanning the sidebar top to bottom
 * follows the template top to bottom. Threads anchored to a block that no
 * longer exists sort last (they're still readable, just detached), and
 * template-level threads with no block at all sort first.
 *
 * Sorting by `createdAt` instead would be defensible for a chat, but a comment
 * sidebar is a view of the document, not a conversation log — a comment on
 * page 1 belongs above one on page 8 regardless of which was written first.
 */
export function sortThreadsByDocumentOrder(threads: CommentThread[], pages: Page[] | undefined): CommentThread[] {
	const order = blockDocumentOrder(pages ?? []);
	return [...threads].sort((a, b) => {
		const aIndex = a.root.blockId ? (order.get(a.root.blockId) ?? Number.MAX_SAFE_INTEGER) : -1;
		const bIndex = b.root.blockId ? (order.get(b.root.blockId) ?? Number.MAX_SAFE_INTEGER) : -1;
		if (aIndex !== bIndex) return aIndex - bIndex;
		// Two threads on the same block: oldest first, so a conversation about
		// one block reads in the order it happened.
		return a.root.createdAt.localeCompare(b.root.createdAt);
	});
}

/**
 * Flattens the block tree into `blockId -> position`, descending into
 * containers (columns, smart content, table cells) so a comment on a nested
 * block still sorts where it visually sits rather than falling to the bottom
 * with the unfindable ones.
 */
function blockDocumentOrder(pages: Page[]): Map<BlockId, number> {
	const order = new Map<BlockId, number>();
	let index = 0;
	const walk = (blocks: Block[]) => {
		for (const block of blocks) {
			order.set(block.id, index++);
			if (block.type === 'columns') for (const column of block.columns) walk(column);
			else if (block.type === 'smart_content') walk(block.children);
		}
	};
	for (const page of pages) walk(page.blocks);
	return order;
}

/** §12's header badge. Counts *threads*, not messages — five replies to one question is one thing needing attention. */
export function unresolvedThreadCount(threads: CommentThread[]): number {
	return threads.filter((thread) => !thread.root.resolvedAt).length;
}

/**
 * Whether a text-range anchor still points inside the block's current text.
 *
 * A text anchor is a pair of ProseMirror document positions captured when the
 * comment was posted, and nothing maintains them afterwards — editing the
 * block's text moves the words the comment was about. A stale range is
 * detected by bounds alone (`to` beyond the document's size) and the thread
 * then renders block-level instead, which is why this is a `boolean` rather
 * than an attempt to repair the offsets.
 *
 * **Known limit, deliberately not papered over:** an edit that leaves the
 * document the same size — replacing a word with another of equal length —
 * keeps the range in bounds, so the highlight stays put and now covers
 * different words. Detecting that needs the quoted text stored alongside the
 * offsets, and the live `Comments` table has no column for it. Anchors are
 * therefore best-effort by construction; the thread body is the durable
 * record.
 */
export function isAnchorInBounds(comment: Comment, docSize: number): boolean {
	if (comment.anchorStart == null || comment.anchorEnd == null) return false;
	return comment.anchorStart >= 0 && comment.anchorEnd <= docSize && comment.anchorEnd > comment.anchorStart;
}

/**
 * The `content.size` ProseMirror would report for a stored doc, computed from
 * the JSON without instantiating an editor.
 *
 * The sidebar needs this to tell an intact text anchor from a stale one, and it
 * runs nowhere near the live ProseMirror views — those live inside individual
 * `TextBlockView`s, one per block, mounted only for blocks currently on screen.
 * Reimplementing the arithmetic is a smaller price than plumbing every
 * editor's size back up into the store.
 *
 * ProseMirror's own rules, which this mirrors exactly:
 * - a text node's size is its string length,
 * - a leaf node (a variable chip, a fillable field, a hard break) is 1,
 * - any other node is 2 (its open and close tokens) plus its children,
 * - and a fragment's size is the sum of its children, which is what the top
 *   level returns.
 *
 * Leaves are identified **by type name**, not by having no `content` array.
 * Tiptap serializes an empty paragraph as bare `{ type: 'paragraph' }`, and
 * ProseMirror still counts it as 2 — inferring "no content means leaf" made
 * every empty paragraph one position short and skewed every anchor after it.
 * Caught by the unit test below rather than in the field.
 *
 * Marks don't contribute, which is why bold-ing a commented passage doesn't
 * invalidate its anchor.
 */
export function richTextDocSize(doc: RichTextNode | null | undefined): number {
	return fragmentSize(doc?.content);
}

function fragmentSize(content: RichTextNode[] | undefined): number {
	if (!Array.isArray(content)) return 0;
	return content.reduce((total, node) => total + nodeSize(node), 0);
}

/**
 * Every leaf node this app's schema can produce (see `richTextExtensions.ts`):
 * the two custom inline atoms, plus StarterKit's own leaves.
 */
const LEAF_NODE_TYPES = new Set(['variable', 'fillableField', 'hardBreak', 'horizontalRule', 'image']);

function nodeSize(node: RichTextNode): number {
	if (node.type === 'text') return node.text?.length ?? 0;
	if (LEAF_NODE_TYPES.has(node.type)) return 1;
	return 2 + fragmentSize(node.content);
}

/** Whether a thread anchors to a text range at all (as opposed to a whole block, or nothing). */
export function hasTextAnchor(comment: Comment): boolean {
	return comment.anchorStart != null && comment.anchorEnd != null;
}

/**
 * §12's @-mentions, resolved by scanning the body for `@Full Name` against the
 * known user list.
 *
 * Scanning text rather than storing rich mention nodes is what lets the
 * composer stay a plain `<textarea>` — a mention is typed, pasted, or edited
 * like any other text, and a name that no longer matches anyone simply stops
 * being a mention instead of leaving a dangling reference behind.
 *
 * Shares `splitBodyIntoSegments` rather than scanning independently, which is
 * the fix for a real bug the unit tests caught: checking each user's name
 * against the body separately made "@Sam Taylor" notify both Sam Taylor *and* a
 * colleague named Sam, because the longer name contains the shorter one.
 * Consuming the body left to right means each stretch of text belongs to
 * exactly one mention.
 */
export function parseMentions(body: string, users: MentionableUser[]): string[] {
	const found = new Set<string>();
	for (const segment of splitBodyIntoSegments(body, users)) {
		if (segment.kind === 'mention') found.add(segment.userId);
	}
	return [...found];
}

export type BodySegment = { kind: 'text'; text: string } | { kind: 'mention'; text: string; userId: string };

/**
 * Splits a comment body into plain and mention segments for rendering, so a
 * mention can be visually distinct without the body being stored as markup.
 *
 * Only mentions whose user is in `users` are highlighted — a name that has
 * since been deactivated reads as ordinary text rather than as a link to
 * nobody.
 */
export function splitBodyIntoSegments(body: string, users: Array<MentionableUser | CommentAuthor>): BodySegment[] {
	const candidates = [...users].filter((user) => user.name).sort((a, b) => b.name.length - a.name.length);
	const segments: BodySegment[] = [];
	let cursor = 0;
	let plainStart = 0;

	while (cursor < body.length) {
		if (body[cursor] !== '@') {
			cursor += 1;
			continue;
		}
		const match = candidates.find((user) => body.startsWith(`@${user.name}`, cursor));
		if (!match) {
			cursor += 1;
			continue;
		}
		if (cursor > plainStart) segments.push({ kind: 'text', text: body.slice(plainStart, cursor) });
		segments.push({ kind: 'mention', text: `@${match.name}`, userId: match.id });
		cursor += match.name.length + 1;
		plainStart = cursor;
	}

	if (plainStart < body.length) segments.push({ kind: 'text', text: body.slice(plainStart) });
	return segments;
}

import type { CommentAuthor, MentionableUser } from '../../api/comments';
import { splitBodyIntoSegments } from './commentAnchors';

/**
 * A comment's text, with @-mentions picked out visually.
 *
 * The body is stored as plain text and mentions are found by scanning it
 * against the known user list, so this is a render-time transform rather than
 * a stored format — see `commentAnchors.ts`. `white-space: pre-wrap` in the CSS
 * preserves the line breaks someone actually typed without the body needing to
 * be markup.
 */
export function CommentBody({ body, users }: { body: string; users: Array<MentionableUser | CommentAuthor> }) {
	const segments = splitBodyIntoSegments(body, users);
	return (
		<p className="comment-body">
			{segments.map((segment, index) =>
				segment.kind === 'mention' ? (
					<span key={index} className="comment-mention">
						{segment.text}
					</span>
				) : (
					<span key={index}>{segment.text}</span>
				)
			)}
		</p>
	);
}

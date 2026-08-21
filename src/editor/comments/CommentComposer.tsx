import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { MentionableUser } from '../../api/comments';

interface CommentComposerProps {
	/** Shown as the textarea's accessible name and placeholder — "Comment", "Reply", "Edit comment". */
	label: string;
	initialValue?: string;
	submitLabel: string;
	mentionableUsers: MentionableUser[];
	autoFocus?: boolean;
	onSubmit: (body: string) => Promise<void> | void;
	onCancel: () => void;
}

/** Matches the `@partial name` immediately before the caret. Allows one space so "@Shared Te" still matches "Shared Tester" — two-word names are the norm here. */
const MENTION_QUERY = /@([\p{L}\p{N}]*(?: [\p{L}\p{N}]*)?)$/u;

/**
 * §12's comment box, shared by the new-thread, reply and edit paths so all
 * three get @-mentions and the same submit behaviour.
 *
 * A plain `<textarea>` with an autocomplete popup, deliberately not a second
 * Tiptap instance: a comment body is stored as plain text (mentions are
 * resolved by scanning it — see `commentAnchors.ts`), so rich-text machinery
 * would add a serialization format with nothing to serialize. It also keeps
 * Escape and Enter behaving the way they do in every other form field in the
 * app, which the editor's own layered Escape handling depends on
 * (`a11y/useCloseOnEscape` exempts text-entry targets).
 */
export function CommentComposer({
	label,
	initialValue = '',
	submitLabel,
	mentionableUsers,
	autoFocus = false,
	onSubmit,
	onCancel,
}: CommentComposerProps) {
	const [value, setValue] = useState(initialValue);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// null = the mention popup is closed. An empty string is a *different*
	// state: the user has typed a bare "@" and every colleague is a candidate.
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [highlightIndex, setHighlightIndex] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (autoFocus) textareaRef.current?.focus();
	}, [autoFocus]);

	const matches =
		mentionQuery === null
			? []
			: mentionableUsers.filter((user) => user.name.toLowerCase().includes(mentionQuery.trim().toLowerCase())).slice(0, 6);

	function refreshMentionQuery(text: string, caret: number) {
		const match = MENTION_QUERY.exec(text.slice(0, caret));
		setMentionQuery(match ? (match[1] ?? '') : null);
		setHighlightIndex(0);
	}

	function insertMention(user: MentionableUser) {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const caret = textarea.selectionStart;
		const before = value.slice(0, caret);
		const match = MENTION_QUERY.exec(before);
		if (!match) return;
		// A trailing space so the next thing typed isn't absorbed into the name
		// — `parseMentions` matches on the exact "@Full Name" string, and
		// "@Sam Taylorwhat about" would stop being a mention at all.
		const replaced = `${before.slice(0, before.length - match[0].length)}@${user.name} `;
		const next = replaced + value.slice(caret);
		setValue(next);
		setMentionQuery(null);
		// Caret placed after the inserted name rather than left where it was,
		// which would otherwise sit mid-name after the text around it shifted.
		requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(replaced.length, replaced.length);
		});
	}

	async function submit() {
		const trimmed = value.trim();
		if (!trimmed || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(trimmed);
			setValue('');
		} catch {
			// Kept in the box rather than cleared: the text is the user's only
			// copy, and a failed post that also loses what they wrote is the
			// worst outcome here.
			setError('Could not save that comment. Try again.');
		} finally {
			setSubmitting(false);
		}
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (mentionQuery !== null && matches.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setHighlightIndex((index) => (index + 1) % matches.length);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setHighlightIndex((index) => (index - 1 + matches.length) % matches.length);
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				const picked = matches[highlightIndex];
				if (picked) {
					event.preventDefault();
					insertMention(picked);
					return;
				}
			}
			if (event.key === 'Escape') {
				// Closes the popup only. Escape with no popup open falls through
				// to `onCancel` below, so one key does the innermost thing first
				// — the same layering the editor's own Escape handling uses.
				event.stopPropagation();
				setMentionQuery(null);
				return;
			}
		}

		// Cmd/Ctrl+Enter submits; plain Enter inserts a newline. A comment is
		// often several sentences, so making Enter submit would truncate more
		// thoughts than it would save keystrokes.
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void submit();
			return;
		}
		if (event.key === 'Escape') {
			event.stopPropagation();
			onCancel();
		}
	}

	return (
		<div className="comment-composer">
			<textarea
				ref={textareaRef}
				className="comment-composer-input"
				aria-label={label}
				placeholder={`${label}… use @ to mention someone`}
				value={value}
				rows={3}
				onChange={(event) => {
					setValue(event.target.value);
					refreshMentionQuery(event.target.value, event.target.selectionStart);
				}}
				onClick={(event) => refreshMentionQuery(value, event.currentTarget.selectionStart)}
				onKeyDown={handleKeyDown}
			/>
			{mentionQuery !== null && matches.length > 0 && (
				<ul className="comment-mention-list" role="listbox" aria-label="Mention someone">
					{matches.map((user, index) => (
						<li key={user.id}>
							<button
								type="button"
								role="option"
								aria-selected={index === highlightIndex}
								className={index === highlightIndex ? 'comment-mention-option comment-mention-option-active' : 'comment-mention-option'}
								// `onMouseDown` rather than `onClick`: a click would
								// blur the textarea first, and the caret position
								// `insertMention` needs is only meaningful while it
								// still has focus.
								onMouseDown={(event) => {
									event.preventDefault();
									insertMention(user);
								}}
							>
								{user.name}
							</button>
						</li>
					))}
				</ul>
			)}
			{error && (
				<p className="comment-composer-error" role="alert">
					{error}
				</p>
			)}
			<div className="comment-composer-actions">
				<button type="button" onClick={() => void submit()} disabled={!value.trim() || submitting}>
					{submitting ? 'Saving…' : submitLabel}
				</button>
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</div>
	);
}

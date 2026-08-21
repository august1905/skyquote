import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { addPage, createBlankPage } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { useActiveRichTextEditor } from '../richtext/useActiveRichTextEditor';
import {
	FONT_FAMILY_OPTIONS,
	FONT_SIZE_OPTIONS,
	LINE_HEIGHT_OPTIONS,
	PARAGRAPH_STYLE_OPTIONS,
	currentParagraphStyle,
	type ParagraphStyleId,
} from './paragraphStyle';
import './toolbar.css';

const DEFAULT_HIGHLIGHT = '#fff3a3';

function applyParagraphStyle(editor: Editor, style: ParagraphStyleId): void {
	const chain = editor.chain().focus();
	// Every branch clears the *other* wrapper/node types first, so switching
	// Quote → Heading 1 doesn't leave the heading still wrapped in a
	// blockquote. `clearNodes()` is Tiptap's own "back to plain paragraphs"
	// command and handles lifting out of both.
	switch (style) {
		case 'paragraph':
			chain.clearNodes().setParagraph().run();
			return;
		case 'heading1':
			chain.clearNodes().setHeading({ level: 1 }).run();
			return;
		case 'heading2':
			chain.clearNodes().setHeading({ level: 2 }).run();
			return;
		case 'heading3':
			chain.clearNodes().setHeading({ level: 3 }).run();
			return;
		case 'blockquote':
			chain.clearNodes().setBlockquote().run();
			return;
		case 'codeBlock':
			chain.clearNodes().setCodeBlock().run();
			return;
	}
}

/**
 * §2's toolbar, right group: "contextual — only enabled when a text selection
 * or editable block is focused", and "must **disable** rather than hide
 * irrelevant controls, so the layout doesn't jump". Both are honored
 * literally: every control below renders unconditionally and goes `disabled`
 * when there's no usable editor, so the row never changes height or reflows.
 *
 * What "usable" means is one place, `disabled` below: an active editor that
 * still exists and isn't locked (§4.3 — a locked block's editor reports
 * `isEditable: false`, so lock is enforced here for free rather than needing
 * its own check).
 *
 * **Deliberately not built here, rather than half-built:**
 * - *Paragraph spacing* and *decrease/increase indent at block level* — no
 *   official Tiptap extension covers either, and both would need custom
 *   ProseMirror node attributes that then have to be taught to the PDF
 *   renderer and to `usePagePagination`'s height measurement. The indent
 *   buttons below are wired to **list** indent/outdent (`sinkListItem`/
 *   `liftListItem`), which is the part that does have real support, and
 *   disable themselves outside a list rather than pretending to work.
 * - *Letter case* (§2's `…` group) — a destructive text transform rather than
 *   a mark, so it can't round-trip or be toggled off the way everything else
 *   in that group can. Left out until there's a reason to want it.
 * §2's *left* group (page navigator toggle with a page-count badge, and
 * "+ Document") is built and lives here too. Undo/Redo are the one part of
 * that group deliberately left in the header rather than moved down to match
 * the reference layout — they work where they are, and moving them would
 * churn the header's existing e2e coverage for no behavioral gain.
 */
interface EditorToolbarProps {
	/** §2: the page-navigator toggle is a toolbar control, but the drawer itself renders beside the canvas — so its open state is owned by `TemplateEditor` and passed in. */
	pagesOpen: boolean;
	onTogglePages: () => void;
}

export function EditorToolbar({ pagesOpen, onTogglePages }: EditorToolbarProps) {
	const editor = useActiveRichTextEditor();
	const runCommand = useEditorStore((s) => s.runCommand);
	const pageCount = useEditorStore((s) => s.body?.pages.length ?? 0);
	const [moreOpen, setMoreOpen] = useState(false);
	const moreRef = useRef<HTMLDivElement>(null);

	const disabled = !editor || !editor.isEditable;

	useEffect(() => {
		if (!moreOpen) return;
		function handlePointerDown(event: MouseEvent) {
			if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
		}
		document.addEventListener('mousedown', handlePointerDown);
		return () => document.removeEventListener('mousedown', handlePointerDown);
	}, [moreOpen]);

	// Reading marks/nodes off a null editor would throw, and every one of
	// these is only meaningful with an editor anyway — so they collapse to
	// inert defaults when the toolbar is disabled.
	const isActive = (name: string, attrs?: Record<string, unknown>) => (editor ? editor.isActive(name, attrs) : false);
	const style = editor ? currentParagraphStyle(isActive) : 'paragraph';
	const fontFamily = (editor?.getAttributes('textStyle').fontFamily as string | undefined) ?? '';
	const fontSize = (editor?.getAttributes('textStyle').fontSize as string | undefined) ?? '';
	const lineHeight = (editor?.getAttributes('textStyle').lineHeight as string | undefined) ?? '';
	const fontColor = (editor?.getAttributes('textStyle').color as string | undefined) ?? '#000000';
	const inList = isActive('bulletList') || isActive('orderedList');

	/** Runs an overflow-menu action against the active editor and dismisses the menu. */
	function runAndClose(action: (editor: Editor) => void) {
		if (editor) action(editor);
		setMoreOpen(false);
	}

	function handleInsertLink() {
		if (!editor) return;
		const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
		// A plain prompt() rather than a bespoke popover: this is the one
		// control in §2's list that needs free-text input, and a custom
		// anchored popover here would duplicate BlockSettingsPopover's
		// outside-click/positioning machinery for a single field.
		const href = window.prompt('Link URL', existing);
		if (href === null) return;
		if (href.trim() === '') {
			editor.chain().focus().unsetLink().run();
			return;
		}
		editor.chain().focus().setLink({ href: href.trim() }).run();
	}

	return (
		<div className="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
			{/* §2's left group — "always visible", i.e. never contextual on a
			    text selection the way everything after the divider is. */}
			<button type="button" aria-label="Pages" aria-expanded={pagesOpen} onClick={onTogglePages}>
				🗐 <span className="editor-toolbar-badge">{pageCount}</span>
			</button>
			{/* §2's "+ Document" is an `OPEN` question in the spec, resolved
			    there as "implement as an 'add page' alias" until multi-document
			    templates are actually required — so that's exactly what this is,
			    labelled for what it really does rather than for the reference
			    product's own wording. */}
			<button type="button" onClick={() => runCommand(addPage(pageCount, createBlankPage('Untitled page')))}>
				+ Page
			</button>

			<span className="editor-toolbar-divider" />

			<select
				aria-label="Paragraph style"
				value={style}
				disabled={disabled}
				onChange={(e) => editor && applyParagraphStyle(editor, e.target.value as ParagraphStyleId)}
			>
				{PARAGRAPH_STYLE_OPTIONS.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>

			<select
				aria-label="Font family"
				value={fontFamily}
				disabled={disabled}
				onChange={(e) => {
					if (!editor) return;
					const value = e.target.value;
					if (value === '') editor.chain().focus().unsetFontFamily().run();
					else editor.chain().focus().setFontFamily(value).run();
				}}
			>
				{FONT_FAMILY_OPTIONS.map((option) => (
					<option key={option.label} value={option.value}>
						{option.label}
					</option>
				))}
			</select>

			<select
				aria-label="Font size"
				value={fontSize}
				disabled={disabled}
				onChange={(e) => {
					if (!editor) return;
					const value = e.target.value;
					if (value === '') editor.chain().focus().unsetFontSize().run();
					else editor.chain().focus().setFontSize(value).run();
				}}
			>
				{FONT_SIZE_OPTIONS.map((option) => (
					<option key={option.label} value={option.value}>
						{option.label}
					</option>
				))}
			</select>

			<span className="editor-toolbar-divider" />

			<button
				type="button"
				aria-label="Bold"
				aria-pressed={isActive('bold')}
				disabled={disabled}
				onClick={() => editor?.chain().focus().toggleBold().run()}
			>
				<strong>B</strong>
			</button>
			<button
				type="button"
				aria-label="Italic"
				aria-pressed={isActive('italic')}
				disabled={disabled}
				onClick={() => editor?.chain().focus().toggleItalic().run()}
			>
				<em>I</em>
			</button>
			<button
				type="button"
				aria-label="Underline"
				aria-pressed={isActive('underline')}
				disabled={disabled}
				onClick={() => editor?.chain().focus().toggleUnderline().run()}
			>
				<u>U</u>
			</button>

			{/* "Font color", not §2's literal "Text color" — the Theme panel
			    already owns that exact accessible name for the document-wide
			    default, and two controls sharing one label would make both
			    ambiguous to a screen reader and to `getByLabel`. */}
			<input
				type="color"
				aria-label="Font color"
				value={fontColor}
				disabled={disabled}
				onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
			/>

			<div className="editor-toolbar-more" ref={moreRef}>
				<button type="button" aria-label="More formatting" aria-expanded={moreOpen} disabled={disabled} onClick={() => setMoreOpen((o) => !o)}>
					…
				</button>
				{moreOpen && (
					// Closes on choosing an item, rather than staying open: the
					// menu hangs down over the top of the canvas, so leaving it
					// up would cover the very text being formatted.
					<div className="editor-toolbar-more-menu">
						<button type="button" aria-pressed={isActive('strike')} onClick={() => runAndClose((e) => e.chain().focus().toggleStrike().run())}>
							Strikethrough
						</button>
						<button type="button" aria-pressed={isActive('superscript')} onClick={() => runAndClose((e) => e.chain().focus().toggleSuperscript().run())}>
							Superscript
						</button>
						<button type="button" aria-pressed={isActive('subscript')} onClick={() => runAndClose((e) => e.chain().focus().toggleSubscript().run())}>
							Subscript
						</button>
						<button
							type="button"
							aria-pressed={isActive('highlight')}
							onClick={() => runAndClose((e) => e.chain().focus().toggleHighlight({ color: DEFAULT_HIGHLIGHT }).run())}
						>
							Highlight
						</button>
						<button type="button" onClick={() => runAndClose((e) => e.chain().focus().unsetColor().run())}>
							Clear font color
						</button>
					</div>
				)}
			</div>

			<span className="editor-toolbar-divider" />

			{(['left', 'center', 'right', 'justify'] as const).map((alignment) => (
				<button
					key={alignment}
					type="button"
					aria-label={`Align ${alignment}`}
					// Attrs-only form of isActive — textAlign is an attribute
					// spanning several node types, not a node/mark name of its own.
					aria-pressed={editor?.isActive({ textAlign: alignment }) === true}
					disabled={disabled}
					onClick={() => editor?.chain().focus().setTextAlign(alignment).run()}
				>
					{alignment === 'left' ? '⯇' : alignment === 'center' ? '≡' : alignment === 'right' ? '⯈' : '☰'}
				</button>
			))}

			<span className="editor-toolbar-divider" />

			<button
				type="button"
				aria-label="Bulleted list"
				aria-pressed={isActive('bulletList')}
				disabled={disabled}
				onClick={() => editor?.chain().focus().toggleBulletList().run()}
			>
				•
			</button>
			<button
				type="button"
				aria-label="Numbered list"
				aria-pressed={isActive('orderedList')}
				disabled={disabled}
				onClick={() => editor?.chain().focus().toggleOrderedList().run()}
			>
				1.
			</button>
			<button
				type="button"
				aria-label="Decrease indent"
				disabled={disabled || !inList}
				onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
			>
				⇤
			</button>
			<button
				type="button"
				aria-label="Increase indent"
				disabled={disabled || !inList}
				onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
			>
				⇥
			</button>

			<span className="editor-toolbar-divider" />

			<select
				aria-label="Line spacing"
				value={lineHeight}
				disabled={disabled}
				onChange={(e) => {
					if (!editor) return;
					const value = e.target.value;
					if (value === '') editor.chain().focus().unsetLineHeight().run();
					else editor.chain().focus().setLineHeight(value).run();
				}}
			>
				{LINE_HEIGHT_OPTIONS.map((option) => (
					<option key={option.label} value={option.value}>
						{option.label}
					</option>
				))}
			</select>

			<button type="button" aria-label="Insert link" aria-pressed={isActive('link')} disabled={disabled} onClick={handleInsertLink}>
				🔗
			</button>
			<button
				type="button"
				aria-label="Clear formatting"
				disabled={disabled}
				// Two things here, both found by instrumenting a real browser
				// rather than by reading the docs (see BUILD_STATUS.md):
				//
				// 1. `unsetAllMarks()` only touches non-empty ranges and
				//    returns `true` regardless — so with a collapsed caret it
				//    reported success while changing nothing, and the button
				//    looked broken. Selecting the block first is what "clear
				//    formatting" is expected to mean when nothing is selected.
				// 2. These run as two chains rather than one. A Tiptap chain is
				//    a single transaction that's discarded if any command in it
				//    reports failure, so pairing them risks one silently
				//    dropping the other's work.
				onClick={() => {
					if (!editor) return;
					const wholeBlock = editor.state.selection.empty;
					const marks = editor.chain().focus();
					if (wholeBlock) marks.selectAll();
					marks.unsetAllMarks().run();
					const nodes = editor.chain().focus();
					if (wholeBlock) nodes.selectAll();
					nodes.clearNodes().run();
				}}
			>
				⌫
			</button>
		</div>
	);
}

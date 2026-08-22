import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { registerRenameHandler } from './renameRequest';
import { allVariables } from '../variables/systemVariables';
import type { VariableDef } from '../types';
import './templateNameEditor.css';

/**
 * §3's header bar: "Template name... May contain variable tokens, rendered
 * as highlighted chips... Clicking places a caret; typing `[` opens the
 * variable picker." `TemplateMeta.name` is a plain string (a Data Store
 * column, unlike a text block's rich `RichTextDoc`) — so a variable "token"
 * here is a literal `[Client.Company]` substring, and chip rendering is a
 * *display-time* regex transform, not stored rich content. This is
 * deliberately not built on Tiptap; a flat string doesn't need a ProseMirror
 * document, just this component's own small inline `[` picker.
 */
export function TemplateNameEditor() {
	const meta = useEditorStore((s) => s.meta);
	const renameTemplate = useEditorStore((s) => s.renameTemplate);
	const customVariables = useEditorStore((s) => s.body?.variables ?? []);
	const variables = allVariables(customVariables);

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(meta?.name ?? '');
	const [pickerQuery, setPickerQuery] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!editing) setDraft(meta?.name ?? '');
	}, [meta?.name, editing]);

	function startEditing() {
		setDraft(meta?.name ?? '');
		setEditing(true);
	}

	// Registered for the ⋮ menu's "Rename" — see renameRequest.ts.
	useEffect(() => {
		registerRenameHandler(startEditing);
		return () => registerRenameHandler(null);
	});

	function stopEditing() {
		setEditing(false);
		setPickerQuery(null);
	}

	function handleChange(value: string) {
		setDraft(value);
		renameTemplate(value);

		const caret = inputRef.current?.selectionStart ?? value.length;
		const upToCaret = value.slice(0, caret);
		const openBracket = upToCaret.lastIndexOf('[');
		const closeBracket = upToCaret.lastIndexOf(']');
		// An unclosed "[" more recent than the last "]" means the caret is
		// mid-token — anything after it is the picker's filter query.
		setPickerQuery(openBracket > closeBracket ? upToCaret.slice(openBracket + 1) : null);
	}

	function insertVariable(variable: VariableDef) {
		const el = inputRef.current;
		const caret = el?.selectionStart ?? draft.length;
		const upToCaret = draft.slice(0, caret);
		const openBracket = upToCaret.lastIndexOf('[');
		const before = draft.slice(0, openBracket);
		const after = draft.slice(caret);
		const next = `${before}[${variable.key}]${after}`;
		setDraft(next);
		renameTemplate(next);
		setPickerQuery(null);
		// Set the DOM value/selection synchronously, in the same tick, rather
		// than deferring to a requestAnimationFrame: React's own re-render
		// (from setDraft above) is async, and a rAF callback can lose the race
		// against fast typing that follows this click — keystrokes landing
		// before the frame fires would type at the *old* caret position, then
		// get silently relocated once the frame finally ran, scrambling the
		// result. Mutating the input directly means the caret is already
		// correct before control returns to the caller; React's later
		// re-render just reapplies the same value, a no-op that doesn't move
		// the caret again.
		if (el) {
			const position = before.length + variable.key.length + 2;
			el.value = next;
			el.setSelectionRange(position, position);
			el.focus();
		}
	}

	const filtered =
		pickerQuery === null
			? []
			: variables
					.filter((v) => v.key.toLowerCase().includes(pickerQuery.toLowerCase()) || v.label.toLowerCase().includes(pickerQuery.toLowerCase()))
					.slice(0, 8);

	if (!editing) {
		return (
			// `aria-label` here pins the heading's accessible name to the plain
			// name string, overriding the nested button's own label — without
			// it, the button's `aria-label` would otherwise flow up and become
			// the *heading's* computed name too, breaking every other test that
			// looks up this heading by the template's actual name.
			<h1 className="template-name-display" aria-label={meta?.name ?? ''} onClick={startEditing}>
				<button type="button" className="template-name-display-button" aria-label="Edit template name">
					{renderChips(meta?.name ?? '', variables)}
				</button>
			</h1>
		);
	}

	return (
		<div className="template-name-edit">
			<input
				ref={inputRef}
				type="text"
				aria-label="Template name"
				value={draft}
				onChange={(e) => handleChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') stopEditing();
					if (e.key === 'Enter') stopEditing();
				}}
				onBlur={() => {
					// A picker item's own `onMouseDown` prevents default so this
					// blur never fires from clicking it — this timeout is only a
					// fallback for any other stray blur source.
					window.setTimeout(stopEditing, 150);
				}}
				autoFocus
			/>
			{pickerQuery !== null && filtered.length > 0 && (
				<ul className="template-name-picker">
					{filtered.map((v) => (
						<li key={v.key}>
							<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(v)}>
								{v.label} <span className="template-name-picker-key">({v.key})</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function renderChips(name: string, variables: VariableDef[]) {
	const knownKeys = new Set(variables.map((v) => v.key));
	const parts: { text: string; key: string; isVariable: boolean }[] = [];
	const tokenPattern = /\[([^[\]]+)\]/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	let partIndex = 0;
	while ((match = tokenPattern.exec(name))) {
		if (match.index > lastIndex) parts.push({ text: name.slice(lastIndex, match.index), key: `t${partIndex++}`, isVariable: false });
		parts.push({ text: match[0], key: `t${partIndex++}`, isVariable: knownKeys.has(match[1]!) });
		lastIndex = tokenPattern.lastIndex;
	}
	if (lastIndex < name.length || parts.length === 0) parts.push({ text: name.slice(lastIndex), key: `t${partIndex++}`, isVariable: false });

	return parts.map((part) =>
		part.isVariable ? (
			<span key={part.key} className="template-name-chip">
				{part.text}
			</span>
		) : (
			<span key={part.key}>{part.text}</span>
		)
	);
}

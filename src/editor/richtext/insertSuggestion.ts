import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { InsertSuggestionList, type InsertSuggestionListRef } from './InsertSuggestionList';
import { allVariables } from '../variables/systemVariables';
import { createField } from '../commands/fieldCommands';
import { collectAllFields } from '../fields/collectFields';
import { FIELD_TYPES, FIELD_TYPE_LABELS } from '../fields/fieldTypes';
import { useEditorStore } from '../store/editorStore';
import type { FieldType, VariableDef } from '../types';

export interface InsertSuggestionItem {
	kind: 'variable' | 'field';
	/** React key + list-selection identity. */
	key: string;
	label: string;
	subtitle: string;
	variable?: VariableDef;
	fieldType?: FieldType;
}

function buildItems(query: string): InsertSuggestionItem[] {
	const body = useEditorStore.getState().body;
	const customVariables = body?.variables ?? [];
	const roles = body?.roles ?? [];
	const q = query.toLowerCase();

	const variableItems: InsertSuggestionItem[] = allVariables(customVariables)
		.filter((v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q))
		.map((variable) => ({ kind: 'variable' as const, key: `variable:${variable.key}`, label: variable.label, subtitle: variable.key, variable }));

	// §6.1: "never allow a field to exist without a role" — no roles yet
	// means fields simply aren't offered here, same as the Content panel's
	// field palette would need a role selected before it can offer anything.
	const fieldItems: InsertSuggestionItem[] = roles.length
		? FIELD_TYPES.filter((type) => FIELD_TYPE_LABELS[type].toLowerCase().includes(q)).map((type) => ({
				kind: 'field' as const,
				key: `field:${type}`,
				label: FIELD_TYPE_LABELS[type],
				subtitle: 'Field',
				fieldType: type,
			}))
		: [];

	return [...variableItems, ...fieldItems].slice(0, 20);
}

/**
 * §4.1's inline trigger: "typing `[` inside a text block opens a combobox
 * for variables and fields... filter as you type, navigate with arrows,
 * insert on Enter, dismiss on Escape." Selecting a field type creates a
 * brand-new `FillableField` right there, inline, assigned to the template's
 * *first* role (there's no room for §3's role-selector dropdown inside a
 * transient inline picker — the standalone `AddBlockMenu` path has one
 * instead, see `insertable.ts`).
 */
export const InsertSuggestion = Extension.create({
	name: 'insertSuggestion',

	addOptions() {
		return {
			suggestion: {
				char: '[',
				startOfLine: false,
				// Several field-type labels are multi-word ("Collect files",
				// "Radio buttons", "Text field", "Billing details") —
				// @tiptap/suggestion's match otherwise closes at the first
				// space (its default assumes single-word queries like a
				// `@username` mention), silently exiting the suggestion
				// before the rest of a multi-word label is even typed.
				allowSpaces: true,
				items: ({ query }: { query: string }): InsertSuggestionItem[] => buildItems(query),
				command: ({
					editor,
					range,
					props,
				}: {
					editor: import('@tiptap/core').Editor;
					range: import('@tiptap/core').Range;
					props: InsertSuggestionItem;
				}) => {
					if (props.kind === 'variable' && props.variable) {
						editor.chain().focus().deleteRange(range).insertVariable({ key: props.variable.key, fallback: null }).run();
						return;
					}
					if (props.kind === 'field' && props.fieldType) {
						const body = useEditorStore.getState().body;
						const firstRole = body?.roles[0];
						if (!firstRole) return;
						const field = createField(props.fieldType, firstRole.id, collectAllFields(body));
						editor.chain().focus().deleteRange(range).insertFillableField(field).run();
					}
				},
				render: () => {
					let component: ReactRenderer<InsertSuggestionListRef>;
					let unmount: (() => void) | undefined;

					return {
						onStart: (renderProps) => {
							component = new ReactRenderer(InsertSuggestionList, {
								props: { items: renderProps.items, command: renderProps.command },
								editor: renderProps.editor,
							});
							unmount = renderProps.mount(component.element);
						},
						onUpdate: (renderProps) => {
							component.updateProps({ items: renderProps.items, command: renderProps.command });
						},
						onKeyDown: (renderProps) => {
							if (renderProps.event.key === 'Escape') {
								unmount?.();
								return true;
							}
							return component.ref?.onKeyDown({ event: renderProps.event }) ?? false;
						},
						onExit: () => {
							unmount?.();
							component.destroy();
						},
					};
				},
			} satisfies Partial<SuggestionOptions<InsertSuggestionItem, InsertSuggestionItem>>,
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion,
			}),
		];
	},
});

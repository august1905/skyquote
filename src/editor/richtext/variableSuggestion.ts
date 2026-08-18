import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { VariableSuggestionList, type VariableSuggestionListRef } from './VariableSuggestionList';
import { allVariables } from '../variables/systemVariables';
import { useEditorStore } from '../store/editorStore';
import type { VariableDef } from '../types';

/**
 * §4.1's inline trigger: "typing `[` inside a text block opens a combobox for
 * variables and fields... filter as you type, navigate with arrows, insert
 * on Enter, dismiss on Escape." `items()` reads live store state via
 * `getState()` rather than a closed-over prop — this extension is built once
 * per editor instance, but the variable list (custom ones especially) can
 * change after that.
 */
export const VariableSuggestion = Extension.create({
	name: 'variableSuggestion',

	addOptions() {
		return {
			suggestion: {
				char: '[',
				startOfLine: false,
				items: ({ query }: { query: string }): VariableDef[] => {
					const customVariables = useEditorStore.getState().body?.variables ?? [];
					const q = query.toLowerCase();
					return allVariables(customVariables)
						.filter((v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q))
						.slice(0, 20);
				},
				command: ({ editor, range, props }: { editor: import('@tiptap/core').Editor; range: import('@tiptap/core').Range; props: VariableDef }) => {
					editor.chain().focus().deleteRange(range).insertVariable({ key: props.key, fallback: null }).run();
				},
				render: () => {
					let component: ReactRenderer<VariableSuggestionListRef>;
					let unmount: (() => void) | undefined;

					return {
						onStart: (renderProps) => {
							component = new ReactRenderer(VariableSuggestionList, {
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
			} satisfies Partial<SuggestionOptions<VariableDef, VariableDef>>,
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

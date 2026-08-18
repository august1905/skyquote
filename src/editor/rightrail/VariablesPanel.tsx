import { useState } from 'react';
import { addVariable, customVariableKey, removeVariable } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { getActiveRichTextEditor } from '../richtext/activeRichTextEditor';
import { SYSTEM_VARIABLES } from '../variables/systemVariables';
import type { VariableDef, VariableSource } from '../types';
import './rightrail.css';

interface VariablesPanelProps {
	onClose: () => void;
}

const SOURCE_ORDER: VariableSource[] = ['contact', 'company', 'sender', 'computed', 'deal', 'custom'];
const SOURCE_LABELS: Record<VariableSource, string> = {
	contact: 'Client',
	company: 'Company',
	deal: 'Deal',
	sender: 'Sender',
	computed: 'Document',
	custom: 'Custom',
};

function groupBySource(variables: VariableDef[]): Partial<Record<VariableSource, VariableDef[]>> {
	const groups: Partial<Record<VariableSource, VariableDef[]>> = {};
	for (const variable of variables) {
		(groups[variable.source] ??= []).push(variable);
	}
	return groups;
}

/**
 * §3's Variables panel: "List of available variables grouped by source;
 * click inserts at caret; 'create custom variable'." Insertion targets
 * whichever rich-text editor the user was last focused in — see
 * `activeRichTextEditor.ts` for why that has to live outside this
 * component's own props/state.
 */
export function VariablesPanel({ onClose }: VariablesPanelProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const customVariables = useEditorStore((s) => s.body?.variables ?? []);
	const [creating, setCreating] = useState(false);

	const grouped = groupBySource([...SYSTEM_VARIABLES, ...customVariables]);

	function insert(variable: VariableDef) {
		const editor = getActiveRichTextEditor();
		if (!editor || editor.isDestroyed) return;
		editor.chain().focus().insertVariable({ key: variable.key, fallback: null }).run();
	}

	return (
		<div className="variables-panel">
			<div className="variables-panel-header">
				<h2>Variables</h2>
				<button type="button" aria-label="Close variables panel" onClick={onClose}>
					×
				</button>
			</div>
			{SOURCE_ORDER.filter((source) => grouped[source]?.length).map((source) => (
				<div key={source} className="variables-panel-group">
					<h3>{SOURCE_LABELS[source]}</h3>
					<ul>
						{grouped[source]!.map((variable) => (
							<li key={variable.key} className="variables-panel-row">
								<button type="button" className="variables-panel-insert" onClick={() => insert(variable)}>
									{variable.label}
								</button>
								{variable.source === 'custom' && (
									<button
										type="button"
										aria-label={`Remove ${variable.label}`}
										className="variables-panel-remove"
										onClick={() => runCommand(removeVariable(variable.key))}
									>
										×
									</button>
								)}
							</li>
						))}
					</ul>
				</div>
			))}
			{creating ? (
				<CreateVariableForm
					existingCustomVariables={customVariables}
					onCancel={() => setCreating(false)}
					onCreate={(variable) => {
						runCommand(addVariable(variable));
						setCreating(false);
					}}
				/>
			) : (
				<button type="button" className="variables-panel-add" onClick={() => setCreating(true)}>
					+ Create custom variable
				</button>
			)}
		</div>
	);
}

interface CreateVariableFormProps {
	existingCustomVariables: VariableDef[];
	onCancel: () => void;
	onCreate: (variable: VariableDef) => void;
}

function CreateVariableForm({ existingCustomVariables, onCancel, onCreate }: CreateVariableFormProps) {
	const [label, setLabel] = useState('');
	const [defaultValue, setDefaultValue] = useState('');
	const [format, setFormat] = useState<VariableDef['format']>('text');

	function submit() {
		const trimmed = label.trim();
		if (!trimmed) return;
		onCreate({
			key: customVariableKey(trimmed, existingCustomVariables),
			label: trimmed,
			source: 'custom',
			...(defaultValue ? { defaultValue } : {}),
			...(format ? { format } : {}),
		});
	}

	return (
		<div className="variables-panel-create">
			<label>
				<span>Label</span>
				<input type="text" aria-label="Variable label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
			</label>
			<label>
				<span>Default value</span>
				<input type="text" aria-label="Variable default value" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
			</label>
			<label>
				<span>Format</span>
				<select aria-label="Variable format" value={format} onChange={(e) => setFormat(e.target.value as VariableDef['format'])}>
					<option value="text">Text</option>
					<option value="currency">Currency</option>
					<option value="date">Date</option>
					<option value="number">Number</option>
				</select>
			</label>
			<div className="variables-panel-create-actions">
				<button type="button" onClick={submit} disabled={!label.trim()}>
					Create
				</button>
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</div>
	);
}

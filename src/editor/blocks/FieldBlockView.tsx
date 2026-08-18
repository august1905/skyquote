import { useState } from 'react';
import { setFieldConfig } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { collectAllFields } from '../fields/collectFields';
import { FieldSettingsPopover } from '../fields/FieldSettingsPopover';
import { FIELD_TYPE_LABELS } from '../fields/fieldTypes';
import type { FieldBlock } from '../types';
import type { BlockViewProps } from './types';
import '../fields/fields.css';

/**
 * A field placed as its own block (§6.2) — "used for large signature areas
 * and `billing_details`". Every type renders an *inert* preview (§6.1 rule
 * 3: "clicking configures, it does not fill" — a "Preview as {role}" live
 * mode is phase 4), tinted with its role's color so ownership is visible at
 * a glance without opening anything.
 */
export function FieldBlockView({ pageId, block }: BlockViewProps<FieldBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const body = useEditorStore((s) => s.body);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const role = roles.find((r) => r.id === block.field.roleId);
	const otherFields = body ? collectAllFields(body).filter((f) => f.id !== block.field.id) : [];

	return (
		<div
			className="field-block"
			style={{ borderColor: role?.color ?? '#999', backgroundColor: role ? `${role.color}1a` : undefined }}
			onClick={() => !block.locked && setSettingsOpen((o) => !o)}
		>
			<span className="field-block-type">{FIELD_TYPE_LABELS[block.field.type]}</span>
			<FieldPreview type={block.field.type} field={block.field} />
			<span className="field-block-name">
				{block.field.name}
				{block.field.required && <span className="field-block-required"> *</span>}
			</span>
			{settingsOpen && !block.locked && (
				<FieldSettingsPopover
					field={block.field}
					roles={roles}
					otherFields={otherFields}
					onChange={(patch) => runCommand(setFieldConfig(pageId, block.id, patch))}
					onClose={() => setSettingsOpen(false)}
				/>
			)}
		</div>
	);
}

function FieldPreview({ type, field }: { type: FieldBlock['field']['type']; field: FieldBlock['field'] }) {
	switch (type) {
		case 'signature':
		case 'initials':
		case 'stamp':
			return <div className="field-block-box" />;
		case 'file_upload':
			return <div className="field-block-box field-block-box-small">Upload</div>;
		case 'text':
			return <input type="text" disabled placeholder={field.placeholder || 'Text'} />;
		case 'date':
			return <input type="text" disabled placeholder="Date" />;
		case 'checkbox':
			return (
				<label className="field-block-inline">
					<input type="checkbox" disabled />
					<span>{field.placeholder || field.name}</span>
				</label>
			);
		case 'radio_group':
			return (
				<div className="field-block-options">
					{(field.options ?? ['Option 1']).map((option) => (
						<label key={option} className="field-block-inline">
							<input type="radio" disabled />
							<span>{option}</span>
						</label>
					))}
				</div>
			);
		case 'dropdown':
			return (
				<select disabled>
					{(field.options ?? ['Option 1']).map((option) => (
						<option key={option}>{option}</option>
					))}
				</select>
			);
		case 'billing_details':
			return <div className="field-block-box">Name, address, card</div>;
		default:
			return null;
	}
}

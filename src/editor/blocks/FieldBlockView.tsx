import { useState } from 'react';
import { setFieldConfig } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { collectAllFields } from '../fields/collectFields';
import { FieldSettingsPopover } from '../fields/FieldSettingsPopover';
import { FieldPreview } from '../fields/FieldPreview';
import { FIELD_TYPE_LABELS } from '../fields/fieldTypes';
import type { FieldBlock } from '../types';
import type { BlockViewProps } from './types';
import '../fields/fields.css';

/**
 * A field placed as its own block (§6.2) — "used for large signature areas
 * and `billing_details`". Every type renders an *inert* preview by default
 * (§6.1 rule 3: "clicking configures, it does not fill"), tinted with its
 * role's color so ownership is visible at a glance without opening anything.
 * The one exception: while `previewRoleId` (the "Preview as {role}" toggle)
 * matches this field's own role, it renders live/fillable instead, and
 * clicking it no longer opens settings — see `FieldPreview`.
 */
export function FieldBlockView({ pageId, block }: BlockViewProps<FieldBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const body = useEditorStore((s) => s.body);
	const previewRoleId = useEditorStore((s) => s.previewRoleId);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const role = roles.find((r) => r.id === block.field.roleId);
	const otherFields = body ? collectAllFields(body).filter((f) => f.id !== block.field.id) : [];
	const live = previewRoleId !== null && previewRoleId === block.field.roleId;

	return (
		<div
			className="field-block"
			style={{ borderColor: role?.color ?? '#999', backgroundColor: role ? `${role.color}1a` : undefined, cursor: live ? 'default' : 'pointer' }}
			onClick={() => !block.locked && !live && setSettingsOpen((o) => !o)}
		>
			<span className="field-block-type">{FIELD_TYPE_LABELS[block.field.type]}</span>
			<FieldPreview field={block.field} live={live} />
			<span className="field-block-name">
				{block.field.name}
				{block.field.required && <span className="field-block-required"> *</span>}
			</span>
			{settingsOpen && !block.locked && !live && (
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

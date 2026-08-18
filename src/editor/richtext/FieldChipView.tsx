import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { collectAllFields } from '../fields/collectFields';
import { FieldSettingsPopover } from '../fields/FieldSettingsPopover';
import { FieldPreview } from '../fields/FieldPreview';
import type { FillableField } from '../types';
import '../fields/fields.css';

/**
 * The inline placement mode's NodeView — same click-to-configure convention
 * as `VariableChipView` by default. While `previewRoleId` (the "Preview as
 * {role}" toggle) matches this field's own role, the compact name-pill swaps
 * for the same live/fillable `FieldPreview` the standalone `FieldBlockView`
 * uses, and clicking no longer opens settings.
 */
export function FieldChipView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
	const [open, setOpen] = useState(false);
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const body = useEditorStore((s) => s.body);
	const previewRoleId = useEditorStore((s) => s.previewRoleId);
	const field = node.attrs.field as FillableField;

	useEffect(() => {
		if (!selected) setOpen(false);
	}, [selected]);

	const role = roles.find((r) => r.id === field.roleId);
	const otherFields = body ? collectAllFields(body).filter((f) => f.id !== field.id) : [];
	const live = previewRoleId !== null && previewRoleId === field.roleId;

	if (live) {
		return (
			<NodeViewWrapper as="span" className="rt-field-chip rt-field-chip-live">
				<FieldPreview field={field} live />
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper as="span" className={`rt-field-chip${selected ? ' rt-field-chip-selected' : ''}`}>
			<button
				type="button"
				className="rt-field-chip-button"
				style={{ borderColor: role?.color ?? '#999', backgroundColor: role ? `${role.color}1a` : undefined }}
				onClick={() => setOpen((o) => !o)}
			>
				{field.name}
				{field.required && <span className="rt-field-chip-required">*</span>}
			</button>
			{open && (
				<FieldSettingsPopover
					field={field}
					roles={roles}
					otherFields={otherFields}
					onChange={(patch) => updateAttributes({ field: { ...field, ...patch } })}
					onClose={() => setOpen(false)}
					onRemove={() => deleteNode()}
				/>
			)}
		</NodeViewWrapper>
	);
}

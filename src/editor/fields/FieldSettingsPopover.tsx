import { useEffect, useRef } from 'react';
import type { FieldConfigPatch } from '../commands';
import { fieldTypeUsesOptions, FIELD_TYPE_LABELS } from './fieldTypes';
import type { FillableField, Role } from '../types';
import './fields.css';

interface FieldSettingsPopoverProps {
	field: FillableField;
	roles: Role[];
	/** Every other field in the template (never including this one) — for the name-collision warning. */
	otherFields: FillableField[];
	onChange: (patch: FieldConfigPatch) => void;
	onClose: () => void;
	/** Only inline field chips need this — a standalone `FieldBlock` is removed via the normal block toolbar's Delete button instead. */
	onRemove?: () => void;
}

/**
 * §5/§6.3's field settings popover — shared by both placement modes
 * (`FieldChipView`'s inline click and `FieldBlockView`'s standalone click),
 * since a field's configuration doesn't depend on where it's placed. Only
 * `FillableField`'s own declared shape is editable here (name, required,
 * role, placeholder, defaultValue, options, validation.format) — §6.3's
 * fuller per-type tables (date format/min-max, file-upload extensions/size/
 * count, radio layout, dropdown allow-other, etc.) would need extending the
 * domain type itself, a bigger and more deliberate change than this pass;
 * see BUILD_STATUS.md.
 */
export function FieldSettingsPopover({ field, roles, otherFields, onChange, onClose, onRemove }: FieldSettingsPopoverProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) onClose();
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [onClose]);

	const nameCollision = otherFields.some((f) => f.name === field.name);
	const usesOptions = fieldTypeUsesOptions(field.type);
	const usesPlaceholder = field.type === 'text';
	const usesFormat = field.type === 'text';

	return (
		<div className="field-settings-popover" ref={containerRef} onClick={(e) => e.stopPropagation()} contentEditable={false}>
			<div className="field-settings-row">
				<span className="field-settings-type-label">{FIELD_TYPE_LABELS[field.type]}</span>
			</div>
			<label className="field-settings-row">
				<span>Name</span>
				<input type="text" aria-label="Field name" value={field.name} onChange={(e) => onChange({ name: e.target.value })} />
			</label>
			{nameCollision && (
				<p className="field-settings-warning" role="alert">
					Another field already uses this name — merge names must be unique.
				</p>
			)}
			<label className="field-settings-row">
				<span>Role</span>
				<select aria-label="Field role" value={field.roleId} onChange={(e) => onChange({ roleId: e.target.value })}>
					{roles.map((role) => (
						<option key={role.id} value={role.id}>
							{role.name}
						</option>
					))}
				</select>
			</label>
			<label className="field-settings-row">
				<input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} />
				<span>Required</span>
			</label>
			{usesPlaceholder && (
				<label className="field-settings-row">
					<span>Placeholder</span>
					<input
						type="text"
						aria-label="Field placeholder"
						value={field.placeholder ?? ''}
						onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
					/>
				</label>
			)}
			{usesFormat && (
				<label className="field-settings-row">
					<span>Format</span>
					<select
						aria-label="Field format"
						value={field.validation?.format ?? ''}
						onChange={(e) => {
							const format = e.target.value as NonNullable<FillableField['validation']>['format'] | '';
							onChange({ validation: format ? { ...field.validation, format } : undefined });
						}}
					>
						<option value="">Any text</option>
						<option value="email">Email</option>
						<option value="phone">Phone</option>
						<option value="number">Number</option>
						<option value="currency">Currency</option>
					</select>
				</label>
			)}
			{usesOptions && (
				<label className="field-settings-row field-settings-options">
					<span>Options (one per line)</span>
					<textarea
						aria-label="Field options"
						value={(field.options ?? []).join('\n')}
						onChange={(e) =>
							onChange({
								options: e.target.value
									.split('\n')
									.map((line) => line.trim())
									.filter(Boolean),
							})
						}
					/>
				</label>
			)}
			{field.type !== 'billing_details' && field.type !== 'stamp' && field.type !== 'file_upload' && field.type !== 'signature' && field.type !== 'initials' && (
				<label className="field-settings-row">
					<span>Default value</span>
					<input type="text" aria-label="Field default value" value={field.defaultValue ?? ''} onChange={(e) => onChange({ defaultValue: e.target.value || undefined })} />
				</label>
			)}
			<div className="field-settings-actions">
				{onRemove && (
					<button type="button" aria-label="Remove field" onClick={onRemove}>
						Remove
					</button>
				)}
				<button type="button" onClick={onClose}>
					Done
				</button>
			</div>
		</div>
	);
}

import type { FieldType } from '../types';

/**
 * §6.3's ten field types, in the reference product's own tile order (§3's
 * Content panel: "Signature, Initials, Text field, Date, Collect files,
 * Checkbox, Radio buttons, Dropdown, Billing details, Stamp").
 */
export const FIELD_TYPES: FieldType[] = ['signature', 'initials', 'text', 'date', 'file_upload', 'checkbox', 'radio_group', 'dropdown', 'billing_details', 'stamp'];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
	signature: 'Signature',
	initials: 'Initials',
	text: 'Text field',
	date: 'Date',
	file_upload: 'Collect files',
	checkbox: 'Checkbox',
	radio_group: 'Radio buttons',
	dropdown: 'Dropdown',
	billing_details: 'Billing details',
	stamp: 'Stamp',
};

/** Types whose `options` (§2.2) actually mean something — everything else ignores it. */
export function fieldTypeUsesOptions(type: FieldType): boolean {
	return type === 'radio_group' || type === 'dropdown';
}

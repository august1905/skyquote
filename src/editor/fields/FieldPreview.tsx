import { useState } from 'react';
import type { FillableField } from '../types';
import { FIELD_TYPE_LABELS } from './fieldTypes';

interface FieldPreviewProps {
	field: FillableField;
	/**
	 * §6.1 rule 3: "clicking configures, it does not fill" is the default —
	 * every input renders `disabled`. `live` is the one exception, driven by
	 * `editorStore`'s "Preview as {role}" toggle: the previewed role's own
	 * fields render as real, fillable controls instead. Nothing typed here is
	 * persisted anywhere — there's no `Document`/recipient record yet to save
	 * it into — this is local component state that resets the moment the
	 * field unmounts.
	 */
	live: boolean;
}

/** The shared per-type preview switch — used by both placement modes (§6.2): `FieldBlockView` (standalone) and `FieldChipView` (inline). */
export function FieldPreview({ field, live }: FieldPreviewProps) {
	return live ? <LiveFieldPreview field={field} /> : <InertFieldPreview field={field} />;
}

function InertFieldPreview({ field }: { field: FillableField }) {
	switch (field.type) {
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

/**
 * Every type's live/fillable counterpart. Deliberately not wired to any real
 * persistence, payment provider (§16 Q7 leaves `billing_details`'s provider
 * as a genuinely open product question), or file upload endpoint — this is a
 * preview of *interactivity*, not a functioning recipient-facing form.
 */
function LiveFieldPreview({ field }: { field: FillableField }) {
	const [text, setText] = useState('');
	const [checked, setChecked] = useState(false);
	const [radioValue, setRadioValue] = useState('');
	const [selectValue, setSelectValue] = useState('');
	const [marked, setMarked] = useState(false);
	const [fileName, setFileName] = useState<string | null>(null);

	switch (field.type) {
		case 'signature':
		case 'initials':
		case 'stamp': {
			const label = FIELD_TYPE_LABELS[field.type].toLowerCase();
			return (
				<button
					type="button"
					className={`field-block-box field-block-live-toggle${marked ? ' field-block-live-marked' : ''}`}
					onClick={() => setMarked((m) => !m)}
				>
					{marked ? `✓ ${FIELD_TYPE_LABELS[field.type]} added` : `Click to add ${label}`}
				</button>
			);
		}
		case 'file_upload':
			return (
				<label className="field-block-box field-block-box-small field-block-live-upload">
					{fileName ?? 'Click to upload'}
					<input
						type="file"
						className="field-block-live-file-input"
						onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
					/>
				</label>
			);
		case 'text':
			return <input type="text" placeholder={field.placeholder || 'Text'} value={text} onChange={(e) => setText(e.target.value)} />;
		case 'date':
			return <input type="text" placeholder="Date" value={text} onChange={(e) => setText(e.target.value)} />;
		case 'checkbox':
			return (
				<label className="field-block-inline">
					<input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
					<span>{field.placeholder || field.name}</span>
				</label>
			);
		case 'radio_group':
			return (
				<div className="field-block-options">
					{(field.options ?? ['Option 1']).map((option) => (
						<label key={option} className="field-block-inline">
							<input type="radio" name={field.id} checked={radioValue === option} onChange={() => setRadioValue(option)} />
							<span>{option}</span>
						</label>
					))}
				</div>
			);
		case 'dropdown':
			return (
				<select value={selectValue} onChange={(e) => setSelectValue(e.target.value)}>
					<option value="" disabled>
						Choose…
					</option>
					{(field.options ?? ['Option 1']).map((option) => (
						<option key={option}>{option}</option>
					))}
				</select>
			);
		case 'billing_details':
			return (
				<div className="field-block-billing">
					<input type="text" placeholder="Name on card" value={text} onChange={(e) => setText(e.target.value)} />
					<input type="text" placeholder="Card number" />
				</div>
			);
		default:
			return null;
	}
}

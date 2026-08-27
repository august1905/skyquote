import { useState } from 'react';
import type { FillableField } from '../types';
import { FIELD_TYPE_LABELS } from './fieldTypes';
import type { RecipientSigning } from '../../documents/RichTextView';

/** What a filled-in field is actually worth persisting as — every type reduces to one of these two. */
export type FieldValue = string | boolean;

interface FieldPreviewProps {
	field: FillableField;
	/**
	 * §6.1 rule 3: "clicking configures, it does not fill" is the default —
	 * every input renders `disabled`. `live` is the one exception: either
	 * `editorStore`'s "Preview as {role}" toggle (the template editor, no
	 * `value`/`onChange` given — see below) or the recipient's own real
	 * document view (`DocumentView.tsx`, which does).
	 */
	live: boolean;
	/**
	 * Controlled mode: when both `value` and `onChange` are given, this reads
	 * and writes through them instead of local component state — the
	 * recipient document view's own field values, so they survive a re-render
	 * and get submitted (see `routes/publicDocumentView.js`'s submit route).
	 * Omitted everywhere else (Preview-as-role in the template editor), where
	 * nothing should ever be persisted — that falls back to local `useState`,
	 * reset the moment the field unmounts, same as before this existed.
	 */
	value?: FieldValue | undefined;
	onChange?: ((value: FieldValue) => void) | undefined;
	/** Freezes an already-`live` control once the recipient has submitted/declined — still shows their answer, just can't be changed again. Meaningless without `live`. */
	readOnly?: boolean | undefined;
	/**
	 * Given once the document is with Zoho Sign, which takes signature, initials
	 * and stamp fields out of this component's hands entirely — see the
	 * `signature` branch in `LiveFieldPreview`.
	 */
	signing?: RecipientSigning | undefined;
}

/** The shared per-type preview switch — used by both placement modes (§6.2): `FieldBlockView` (standalone) and `FieldChipView` (inline), and by the recipient document view's `DocumentBlockView`/`RichTextView`. */
export function FieldPreview({ field, live, value, onChange, readOnly, signing }: FieldPreviewProps) {
	return live ? (
		<LiveFieldPreview field={field} value={value} onChange={onChange} readOnly={readOnly} signing={signing} />
	) : (
		<InertFieldPreview field={field} />
	);
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

interface LiveFieldPreviewProps {
	field: FillableField;
	value?: FieldValue | undefined;
	onChange?: ((value: FieldValue) => void) | undefined;
	readOnly?: boolean | undefined;
	signing?: RecipientSigning | undefined;
}

/**
 * Every type's live/fillable counterpart. `file_upload` and `billing_details`
 * are deliberately never wired to controlled state, real persistence, a
 * payment provider (§16 Q7 leaves that as a genuinely open product
 * question), or a file-upload endpoint — even in the recipient document
 * view, those two stay a preview of interactivity, not a functioning part of
 * the submit flow. See BUILD_STATUS.md.
 */
function LiveFieldPreview({ field, value, onChange, readOnly, signing }: LiveFieldPreviewProps) {
	const controlled = onChange !== undefined;
	const [localText, setLocalText] = useState('');
	const [localChecked, setLocalChecked] = useState(false);
	const [localRadio, setLocalRadio] = useState('');
	const [localSelect, setLocalSelect] = useState('');
	const [localMarked, setLocalMarked] = useState(false);
	const [fileName, setFileName] = useState<string | null>(null);

	switch (field.type) {
		case 'signature':
		case 'initials':
		case 'stamp': {
			const label = FIELD_TYPE_LABELS[field.type].toLowerCase();
			// Once the document is with Zoho Sign, this box reports what Zoho Sign
			// says and offers the panel — it keeps no state of its own, because a
			// real signature exists there or it doesn't and this component is in no
			// position to know which. The webhook is. Saying "✓ Signature added"
			// off a local boolean is how a recipient ends up believing they signed
			// something they didn't.
			if (signing) {
				if (signing.status === 'signed') {
					return (
						<div className="field-block-box field-block-signed">
							✓ Signed
						</div>
					);
				}
				if (signing.status === 'declined') {
					return <div className="field-block-box field-block-declined">Declined</div>;
				}
				return (
					<button type="button" className="field-block-box field-block-live-toggle field-block-live-sign" onClick={signing.open}>
						{`Click to add your ${label}`}
					</button>
				);
			}
			// No signing request behind it — the template editor's "Preview as
			// role", or a document nobody has sent yet. A local toggle is honest
			// there: it's demonstrating that the field is fillable, not claiming
			// anything was filled.
			const marked = controlled ? Boolean(value) : localMarked;
			const setMarked = (next: boolean) => (controlled ? onChange(next) : setLocalMarked(next));
			return (
				<button
					type="button"
					className={`field-block-box field-block-live-toggle${marked ? ' field-block-live-marked' : ''}`}
					disabled={readOnly}
					onClick={() => setMarked(!marked)}
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
						disabled={readOnly}
						onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
					/>
				</label>
			);
		case 'text':
		case 'date': {
			const text = controlled ? (typeof value === 'string' ? value : '') : localText;
			const setText = (next: string) => (controlled ? onChange(next) : setLocalText(next));
			return (
				<input
					type="text"
					placeholder={field.type === 'date' ? 'Date' : field.placeholder || 'Text'}
					disabled={readOnly}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
			);
		}
		case 'checkbox': {
			const checked = controlled ? Boolean(value) : localChecked;
			const setChecked = (next: boolean) => (controlled ? onChange(next) : setLocalChecked(next));
			return (
				<label className="field-block-inline">
					<input type="checkbox" disabled={readOnly} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
					<span>{field.placeholder || field.name}</span>
				</label>
			);
		}
		case 'radio_group': {
			const radioValue = controlled ? (typeof value === 'string' ? value : '') : localRadio;
			const setRadioValue = (next: string) => (controlled ? onChange(next) : setLocalRadio(next));
			return (
				<div className="field-block-options">
					{(field.options ?? ['Option 1']).map((option) => (
						<label key={option} className="field-block-inline">
							<input
								type="radio"
								name={field.id}
								disabled={readOnly}
								checked={radioValue === option}
								onChange={() => setRadioValue(option)}
							/>
							<span>{option}</span>
						</label>
					))}
				</div>
			);
		}
		case 'dropdown': {
			const selectValue = controlled ? (typeof value === 'string' ? value : '') : localSelect;
			const setSelectValue = (next: string) => (controlled ? onChange(next) : setLocalSelect(next));
			return (
				<select disabled={readOnly} value={selectValue} onChange={(e) => setSelectValue(e.target.value)}>
					<option value="" disabled>
						Choose…
					</option>
					{(field.options ?? ['Option 1']).map((option) => (
						<option key={option}>{option}</option>
					))}
				</select>
			);
		}
		case 'billing_details':
			return (
				<div className="field-block-billing">
					<input type="text" placeholder="Name on card" value={localText} onChange={(e) => setLocalText(e.target.value)} />
					<input type="text" placeholder="Card number" />
				</div>
			);
		default:
			return null;
	}
}

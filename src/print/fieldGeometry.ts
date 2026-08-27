import type { FieldType } from '../editor/types';

/**
 * The canvas, the recipient's page and the print sheet all lay out at the
 * template's page size in **CSS px at 96 per inch** — 816 × 1056 for Letter
 * portrait. Zoho Sign places fields in **PDF points at 72 per inch** (its own
 * docs use A4 as 595 × 842, which is points).
 *
 * So the conversion is exact and has no calibration step: 72/96.
 */
export const PX_TO_PT = 72 / 96;

/** One field, positioned the way Zoho Sign's `fields` array wants it. */
export interface SignFieldGeometry {
	/** `FillableField.id` — how a placed field is matched back to the block it came from. */
	fieldId: string;
	/** Which recipient fills it. Zoho Sign groups fields under the action for that recipient. */
	roleId: string;
	type: FieldType;
	name: string;
	required: boolean;
	/** 0-indexed, as Zoho Sign counts pages. */
	pageNo: number;
	xCoord: number;
	yCoord: number;
	absWidth: number;
	absHeight: number;
}

/** What the DOM measurement supplies — the two rects, in screen px. Kept as a parameter so the arithmetic below is testable without a browser. */
export interface MeasuredRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface MeasuredField {
	fieldId: string;
	roleId: string;
	type: FieldType;
	name: string;
	required: boolean;
	pageNo: number;
	rect: MeasuredRect;
}

/**
 * A measured field converted to Zoho Sign's coordinate space.
 *
 * Both rects arrive in screen px, which is *not* necessarily page px: the print
 * tree is rendered offscreen at exact page size today, but a zoomed canvas or a
 * scaled container would break the assumption silently. So the page's own
 * rendered width divided by its design width is applied as a scale factor rather
 * than trusted to be 1 — the same guard `measureBlockOnPage` uses.
 *
 * The origin is the page's top-left corner, which is where Zoho Sign measures
 * from too, so no axis needs flipping.
 */
export function toSignFieldGeometry(field: MeasuredField, pageRect: MeasuredRect, pageWidthPx: number): SignFieldGeometry {
	const scale = pageRect.width > 0 && pageWidthPx > 0 ? pageRect.width / pageWidthPx : 1;
	const toPoints = (screenPx: number) => Math.round((screenPx / scale) * PX_TO_PT);
	return {
		fieldId: field.fieldId,
		roleId: field.roleId,
		type: field.type,
		name: field.name,
		required: field.required,
		pageNo: field.pageNo,
		xCoord: toPoints(field.rect.left - pageRect.left),
		yCoord: toPoints(field.rect.top - pageRect.top),
		absWidth: toPoints(field.rect.width),
		absHeight: toPoints(field.rect.height),
	};
}

/**
 * Every fillable field in a rendered print tree, positioned.
 *
 * Reads the tree `serializeForPdf` already walks, at the moment it's mounted
 * offscreen at exact page size — so this costs one extra pass over a DOM that
 * had to exist anyway, and needs no second layout implementation to agree with.
 *
 * A field with no `data-field-id` is skipped rather than guessed at: an
 * unidentified field can't be matched to a recipient, and placing a signature box
 * for the wrong person is worse than placing none.
 */
export function collectFieldGeometry(root: ParentNode, pageWidthPx: number): SignFieldGeometry[] {
	const geometry: SignFieldGeometry[] = [];
	const sheets = root.querySelectorAll('.print-page');
	sheets.forEach((sheet, pageNo) => {
		const pageRect = sheet.getBoundingClientRect();
		for (const node of sheet.querySelectorAll<HTMLElement>('[data-field-id]')) {
			const fieldId = node.dataset.fieldId;
			const roleId = node.dataset.fieldRole;
			const type = node.dataset.fieldType as FieldType | undefined;
			if (!fieldId || !roleId || !type) continue;
			geometry.push(
				toSignFieldGeometry(
					{
						fieldId,
						roleId,
						type,
						name: node.dataset.fieldName ?? '',
						required: node.dataset.fieldRequired === 'true',
						pageNo,
						rect: node.getBoundingClientRect(),
					},
					pageRect,
					pageWidthPx
				)
			);
		}
	});
	return geometry;
}

/**
 * `FieldType` → Zoho Sign's `field_type_name`.
 *
 * `null` means "Zoho Sign has no equivalent" and the field stays SkyQuotes-only —
 * it renders in the document but isn't something the signer fills in the signing
 * panel. Better than mapping it to something approximate: a `stamp` silently
 * becoming a text box would be a surprise at the worst possible moment.
 */
export const ZOHO_SIGN_FIELD_TYPES: Record<FieldType, string | null> = {
	signature: 'Signature',
	initials: 'Initial',
	text: 'Textfield',
	date: 'Date',
	checkbox: 'Checkbox',
	radio_group: 'Radiogroup',
	dropdown: 'Dropdown',
	file_upload: 'Attachment',
	stamp: null,
	billing_details: null,
};

/** Drops the fields Zoho Sign can't represent, so callers never have to special-case the nulls. */
export function signableFields(geometry: SignFieldGeometry[]): Array<SignFieldGeometry & { zohoType: string }> {
	const signable: Array<SignFieldGeometry & { zohoType: string }> = [];
	for (const field of geometry) {
		const zohoType = ZOHO_SIGN_FIELD_TYPES[field.type];
		if (zohoType) signable.push({ ...field, zohoType });
	}
	return signable;
}

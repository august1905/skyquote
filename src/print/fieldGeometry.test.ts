import { describe, expect, it } from 'vitest';
import { PX_TO_PT, ZOHO_SIGN_FIELD_TYPES, signableFields, toSignFieldGeometry, type MeasuredField, type SignFieldGeometry } from './fieldGeometry';

const LETTER_WIDTH_PX = 816;
/** A page rendered at exactly its design size, at the document origin — what the offscreen print tree gives us. */
const pageAtOrigin = { left: 0, top: 0, width: LETTER_WIDTH_PX, height: 1056 };

function field(overrides: Partial<MeasuredField> = {}): MeasuredField {
	return {
		fieldId: 'field-1',
		roleId: 'role-client',
		type: 'signature',
		name: 'Client signature',
		required: true,
		pageNo: 0,
		rect: { left: 96, top: 720, width: 240, height: 48 },
		...overrides,
	};
}

describe('PX_TO_PT', () => {
	it('is exactly 0.75, because the two coordinate spaces are 96 and 72 per inch', () => {
		// The whole mapping rests on this. Letter is 816×1056 px on the canvas and
		// 612×792 pt in the PDF; both are 8.5×11in.
		expect(PX_TO_PT).toBe(0.75);
		expect(LETTER_WIDTH_PX * PX_TO_PT).toBe(612);
		expect(1056 * PX_TO_PT).toBe(792);
	});
});

describe('toSignFieldGeometry', () => {
	it('converts a field to points, measured from the page corner', () => {
		const geometry = toSignFieldGeometry(field(), pageAtOrigin, LETTER_WIDTH_PX);
		expect(geometry).toMatchObject({ pageNo: 0, xCoord: 72, yCoord: 540, absWidth: 180, absHeight: 36 });
	});

	it('measures relative to the page, not the viewport', () => {
		// The print tree sits offscreen at an arbitrary offset; a field 96px into a
		// page is at 72pt whether that page starts at 0 or at 5000.
		const scrolled = { left: 400, top: 5000, width: LETTER_WIDTH_PX, height: 1056 };
		const geometry = toSignFieldGeometry(field({ rect: { left: 496, top: 5720, width: 240, height: 48 } }), scrolled, LETTER_WIDTH_PX);
		expect(geometry).toMatchObject({ xCoord: 72, yCoord: 540 });
	});

	it('divides out a page that is not rendered at its design size', () => {
		// A zoomed canvas or a scaled container would otherwise place every field at
		// the wrong coordinate, silently — the PDF only looks wrong after signing.
		const half = { left: 0, top: 0, width: LETTER_WIDTH_PX / 2, height: 528 };
		const geometry = toSignFieldGeometry(field({ rect: { left: 48, top: 360, width: 120, height: 24 } }), half, LETTER_WIDTH_PX);
		expect(geometry).toMatchObject({ xCoord: 72, yCoord: 540, absWidth: 180, absHeight: 36 });
	});

	it('keeps a field flush to the top-left corner at the origin', () => {
		// Both coordinate systems start at the page's top-left, so nothing is flipped.
		const geometry = toSignFieldGeometry(field({ rect: { left: 0, top: 0, width: 100, height: 20 } }), pageAtOrigin, LETTER_WIDTH_PX);
		expect(geometry).toMatchObject({ xCoord: 0, yCoord: 0 });
	});

	it('carries the role through, since Zoho Sign groups fields under the recipient who fills them', () => {
		const geometry = toSignFieldGeometry(field({ roleId: 'role-contractor' }), pageAtOrigin, LETTER_WIDTH_PX);
		expect(geometry.roleId).toBe('role-contractor');
	});

	it('rounds to whole points — Zoho Sign takes integers', () => {
		const geometry = toSignFieldGeometry(field({ rect: { left: 97, top: 721, width: 241, height: 49 } }), pageAtOrigin, LETTER_WIDTH_PX);
		expect(Number.isInteger(geometry.xCoord)).toBe(true);
		expect(Number.isInteger(geometry.absHeight)).toBe(true);
	});

	it('survives a page with no measurable width rather than dividing by zero', () => {
		const geometry = toSignFieldGeometry(field(), { left: 0, top: 0, width: 0, height: 0 }, LETTER_WIDTH_PX);
		expect(Number.isFinite(geometry.xCoord)).toBe(true);
	});
});

describe('signableFields', () => {
	const geometry = (type: SignFieldGeometry['type'], fieldId: string): SignFieldGeometry =>
		toSignFieldGeometry(field({ type, fieldId }), pageAtOrigin, LETTER_WIDTH_PX);

	it('maps the field types Zoho Sign understands', () => {
		const signable = signableFields([geometry('signature', 'a'), geometry('text', 'b'), geometry('checkbox', 'c')]);
		expect(signable.map((f) => f.zohoType)).toEqual(['Signature', 'Textfield', 'Checkbox']);
	});

	it('drops the ones it has no equivalent for, rather than approximating them', () => {
		// A `stamp` quietly becoming a text box would be a surprise at the worst
		// possible moment — mid-signature, in front of a customer.
		const signable = signableFields([geometry('stamp', 'a'), geometry('billing_details', 'b'), geometry('signature', 'c')]);
		expect(signable.map((f) => f.fieldId)).toEqual(['c']);
	});

	it('has an entry for every field type, so a new one is a compile error rather than a silent drop', () => {
		expect(Object.keys(ZOHO_SIGN_FIELD_TYPES).sort()).toEqual(
			['billing_details', 'checkbox', 'date', 'dropdown', 'file_upload', 'initials', 'radio_group', 'signature', 'stamp', 'text'].sort()
		);
	});
});

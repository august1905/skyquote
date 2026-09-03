/**
 * The template editor's named text styles: one for every design-system colour
 * at every size from 10px to 80px in 2px steps — "Navy 22px", "White 12px",
 * "White 14px".
 *
 * Asked for by Grayson (2026-09-03): "Every merge field and text element should
 * have a custom style selector, where it can choose one of our custom text
 * styles. You should create those text styles and store them somewhere, where
 * every time we place a variable or text, we can apply one of them to it …
 * they should be based off of Claude design."
 *
 * The colours are the Skyline Parent Design System's own palette (that folder is
 * the Claude Design system referred to; `src/index.css` mirrors the same token
 * values), not a set invented here — a style called "Navy" has to be the same
 * navy as the wordmark, or the styles stop being a system.
 *
 * **Only colour and size vary.** There is no font-family axis: Montserrat is the
 * brand's typeface for display and body alike, so a style that changed it would
 * be off-brand by construction.
 *
 * Deliberately code, not template data. These are the house styles — the same
 * list in every template, resolvable by id from a stored document years later
 * — where per-template styles would drift and would have to be migrated. A
 * style is *applied* as ordinary `color` + `fontSize` marks, so nothing
 * downstream (the recipient's view, the PDF, the frozen agreement) needs to
 * know this catalogue exists to render text that used it.
 */

export interface TextStyleColor {
	/** Stable, and part of every style id — renaming a colour must not restyle existing text. */
	id: string;
	name: string;
	hex: string;
}

/**
 * The palette, in the design system's own order: brand core first, then the
 * neutrals a document actually sets type in, then the two semantic colours that
 * mean something in a quote (a total in the green, a caveat in the red).
 */
export const TEXT_STYLE_COLORS: TextStyleColor[] = [
	{ id: 'navy', name: 'Navy', hex: '#094D82' },
	{ id: 'navy-deep', name: 'Navy deep', hex: '#134570' },
	{ id: 'navy-ink', name: 'Navy ink', hex: '#0A2E4D' },
	{ id: 'sky-blue', name: 'Sky blue', hex: '#13A5DF' },
	{ id: 'sky-blue-bright', name: 'Sky blue bright', hex: '#4FC0EC' },
	{ id: 'orange', name: 'Orange', hex: '#ED6825' },
	{ id: 'orange-warm', name: 'Orange warm', hex: '#F5842F' },
	{ id: 'gold', name: 'Gold', hex: '#F7B718' },
	{ id: 'magenta', name: 'Magenta', hex: '#DF4F8A' },
	{ id: 'purple', name: 'Purple', hex: '#B4519F' },
	{ id: 'charcoal', name: 'Charcoal', hex: '#1E2A36' },
	{ id: 'body-grey', name: 'Body grey', hex: '#33414F' },
	{ id: 'muted-grey', name: 'Muted grey', hex: '#657586' },
	{ id: 'light-grey', name: 'Light grey', hex: '#B9C6D4' },
	{ id: 'white', name: 'White', hex: '#FFFFFF' },
	{ id: 'success', name: 'Success green', hex: '#2FA36B' },
	{ id: 'danger', name: 'Danger red', hex: '#D9463C' },
];

export const MIN_TEXT_STYLE_SIZE = 10;
export const MAX_TEXT_STYLE_SIZE = 80;
export const TEXT_STYLE_SIZE_STEP = 2;

/** 10, 12, 14 … 80. */
export const TEXT_STYLE_SIZES: number[] = Array.from(
	{ length: (MAX_TEXT_STYLE_SIZE - MIN_TEXT_STYLE_SIZE) / TEXT_STYLE_SIZE_STEP + 1 },
	(_, index) => MIN_TEXT_STYLE_SIZE + index * TEXT_STYLE_SIZE_STEP
);

export interface TextStyle {
	/** `navy-22`. Stored on a merge field; stable forever. */
	id: string;
	/** "Navy 22px" — the name in the selector, and the one to say out loud. */
	label: string;
	color: TextStyleColor;
	sizePx: number;
}

export function textStyleId(colorId: string, sizePx: number): string {
	return `${colorId}-${sizePx}`;
}

function makeStyle(color: TextStyleColor, sizePx: number): TextStyle {
	return { id: textStyleId(color.id, sizePx), label: `${color.name} ${sizePx}px`, color, sizePx };
}

/** Every combination — colour-major, so a selector grouped by colour reads in palette order. */
export const TEXT_STYLES: TextStyle[] = TEXT_STYLE_COLORS.flatMap((color) => TEXT_STYLE_SIZES.map((sizePx) => makeStyle(color, sizePx)));

const BY_ID = new Map(TEXT_STYLES.map((style) => [style.id, style] as const));

/** Null for an id this build doesn't know — a colour could be retired from the palette while stored content still names it, and unstyled text beats a crash. */
export function findTextStyle(id: string | null | undefined): TextStyle | null {
	return id ? (BY_ID.get(id) ?? null) : null;
}

/** CSS for a style, for every surface that renders one directly (the editor's chips) rather than through marks. */
export function textStyleCss(style: TextStyle): { color: string; fontSize: string } {
	return { color: style.color.hex, fontSize: `${style.sizePx}px` };
}

function normalizeHex(value: string): string {
	const trimmed = value.trim();
	// `#094D82` and `#094d82` are the same colour; a `<select>` compares strings.
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
	// `rgb(9, 77, 130)` — what `getComputedStyle` and some paste paths produce.
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(trimmed);
	if (!rgb) return trimmed;
	return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * The style a piece of text is *already* wearing, from its `color` and
 * `fontSize` marks — so the selector shows "Navy 22px" for text that was styled
 * with it, and shows nothing for text that was hand-formatted into some colour
 * or size the catalogue doesn't contain. Both halves must match: navy at 23px
 * is not a house style, and pretending otherwise would silently resize it to 22
 * the next time the selector was touched.
 */
export function matchTextStyle(color: string | undefined, fontSize: string | undefined): TextStyle | null {
	if (!color || !fontSize) return null;
	const hex = normalizeHex(color);
	const px = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/i.exec(fontSize);
	if (!px?.[1]) return null;
	const matched = TEXT_STYLE_COLORS.find((candidate) => candidate.hex.toUpperCase() === hex);
	if (!matched) return null;
	return findTextStyle(textStyleId(matched.id, Number(px[1])));
}
